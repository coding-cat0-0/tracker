use tauri::State;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use chrono::Utc;

use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowThreadProcessId,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
};
use windows::Win32::System::ProcessStatus::GetModuleBaseNameW;
use windows::Win32::Foundation::{CloseHandle, HWND};
use windows::Win32::System::SystemInformation::GetTickCount;

#[repr(C)]
pub struct LASTINPUTINFO {
    pub cbSize: u32,
    pub dwTime: u32,
}

extern "system" {
    pub fn GetLastInputInfo(plii: *mut LASTINPUTINFO) -> i32;
}

use crate::commands::ss_worker::start_screenshot_worker;
use crate::state::{
    tracking_state::{TrackingState, UsageRecord},
    auth_state::AuthState,
};

#[tauri::command]
pub fn set_auth_token(token: String, auth: State<Arc<AuthState>>) {
    *auth.token.lock().unwrap() = Some(token);
}

#[tauri::command]
pub fn clear_auth_token(auth: State<Arc<AuthState>>) {
    *auth.token.lock().unwrap() = None;
}

#[tauri::command]
pub fn start_tracking(
    tracking: State<Arc<Mutex<TrackingState>>>,
    auth: State<Arc<AuthState>>,
) {
    let mut tracker = tracking.lock().unwrap();

    if tracker.is_tracking {
        return;
    }

    tracker.is_tracking = true;
    tracker.start_instant = Some(Instant::now());
    let now = Instant::now();
    tracker.last_user_activity = now;
    tracker.last_idle_check = now;
    tracker.accumulated_idle = 0;

    tracker.current_app = None;
    tracker.app_start_instant = None;

    tracker.screenshot_running = true;

    start_screenshot_worker(
        tracking.inner().clone(),
        auth.inner().clone(),
    );
}

#[tauri::command]
pub fn stop_tracking(tracking: State<Arc<Mutex<TrackingState>>>) {
    let mut tracker = tracking.lock().unwrap();

    tracker.is_tracking = false;
    tracker.screenshot_running = false;

    tracker.current_app = None;
    tracker.app_start_instant = None;
}

#[tauri::command]
pub fn get_elapsed(tracking: State<Arc<Mutex<TrackingState>>>) -> u64 {
    tracking
        .lock()
        .unwrap()
        .start_instant
        .map(|s| s.elapsed().as_secs())
        .unwrap_or(0)
}

fn get_active_app() -> String {
    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd.0 == 0 {
            return "Unknown".into();
        }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));

        if pid == 0 {
            return "Unknown".into();
        }

        let handle = match OpenProcess(
            PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
            false,
            pid,
        ) {
            Ok(h) => h,
            Err(_) => return "Unknown".into(),
        };

        let mut buffer = [0u16; 260];
        let len = GetModuleBaseNameW(handle, None, &mut buffer);

        CloseHandle(handle);

        if len == 0 {
            return "Unknown".into();
        }

        String::from_utf16_lossy(&buffer[..len as usize])
    }
}

// Returns idle time in seconds (0 if user is active)
fn get_idle_seconds() -> u64 {
    unsafe {
        let mut input_info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };

        if GetLastInputInfo(&mut input_info) == 0 {
            return 0;
        }

        let current_tick = GetTickCount();
        let idle_ms = current_tick.saturating_sub(input_info.dwTime) as u64;
        idle_ms / 1000 // Convert to seconds
    }
}

#[tauri::command]
pub fn tick_usage(
    tracking: State<Arc<Mutex<TrackingState>>>,
) -> Option<UsageRecord> {

    let active_app = get_active_app();
    let now = Instant::now();
    let idle_secs = get_idle_seconds();
    
    const IDLE_THRESHOLD_SECS: u64 = 120; // 2 minutes

    let mut tracker = tracking.lock().unwrap();

    if !tracker.is_tracking {
        return None;
    }

    if idle_secs >= IDLE_THRESHOLD_SECS {
        let check_elapsed = tracker.last_idle_check.elapsed().as_secs();
        if check_elapsed > 0 {
            tracker.accumulated_idle += check_elapsed;
        }
    } else {
        tracker.accumulated_idle = 0;
        tracker.last_user_activity = now;
    }
    
    tracker.last_idle_check = now;

    match (tracker.current_app.clone(), tracker.app_start_instant) {
        (None, _) => {
            tracker.current_app = Some(active_app);
            tracker.app_start_instant = Some(now);
            None  
        }

        (Some(app), Some(start)) if app == active_app => {
            let elapsed = start.elapsed().as_secs();

            if elapsed == 0 {
                return None;  
            }

            tracker.app_start_instant = Some(now);

            Some(UsageRecord {
                app,
                duration: elapsed,
                idle_duration: tracker.accumulated_idle,
                timestamp: Utc::now(),
            })
        }

        (Some(old_app), Some(start)) => {
            let elapsed = start.elapsed().as_secs();

            tracker.current_app = Some(active_app);
            tracker.app_start_instant = Some(now);

            Some(UsageRecord {
                app: old_app,
                duration: elapsed,
                idle_duration: tracker.accumulated_idle,
                timestamp: Utc::now(),
            })
        }

        _ => None,  // ✅ Return None instead of error
    }
}
