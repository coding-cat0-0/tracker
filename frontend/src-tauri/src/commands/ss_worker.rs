use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::{
    state::{tracking_state::TrackingState, auth_state::AuthState},
    commands::screenshot::capture_and_upload_screenshot,

};

pub fn start_screenshot_worker(
    tracking: Arc<Mutex<TrackingState>>,
    auth: Arc<AuthState>,
) {
    thread::spawn(move || {
        loop {
            let should_stop = {
                let tracker = tracking.lock().unwrap();
                !tracker.screenshot_running
            };
            
            if should_stop {
                break;
            }

            match capture_and_upload_screenshot(&auth) {
                Ok(_) => {
                    thread::sleep(Duration::from_secs(30));
                }
                Err(_) => {
                    let mut tracker = tracking.lock().unwrap();
                    tracker.screenshot_running = false;
                    break;
                }
            }
        }
    });
}

