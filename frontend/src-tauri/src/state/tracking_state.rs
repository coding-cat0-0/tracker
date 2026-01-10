use chrono::{DateTime, Utc};
use std::path::PathBuf;
use std::time::Instant;
use serde::Serialize;

#[derive(Clone)]
pub struct ScreenshotRecord {
    pub path: PathBuf,
    pub timestamp: i64,
}

#[derive(Serialize, Clone)]
pub struct UsageRecord {
    pub app: String,
    pub duration: u64,
    pub idle_duration: u64,
    pub timestamp: DateTime<Utc>,
}

pub struct TrackingState {
    pub is_tracking: bool,
    pub start_instant: Option<Instant>,

    pub current_app: Option<String>,
    pub app_start_instant: Option<Instant>,

    pub screenshot_running: bool,
    
    pub last_user_activity: Instant,
    pub last_idle_check: Instant,
    pub accumulated_idle: u64, // in seconds
}

impl TrackingState {
    pub fn new() -> Self {
        let now = Instant::now();
        Self {
            is_tracking: false,
            start_instant: None,
            current_app: None,
            app_start_instant: None,
            screenshot_running: false,
            last_user_activity: now,
            last_idle_check: now,
            accumulated_idle: 0,
        }
    }
}

impl Default for TrackingState {
    fn default() -> Self {
        Self::new()
    }
}
