#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod state;

use std::sync::{Arc, Mutex};

use state::{
    tracking_state::TrackingState,
    auth_state::AuthState,
};

fn main() {
    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(TrackingState::default())))
        .manage(Arc::new(AuthState::new()))
        .invoke_handler(tauri::generate_handler![
            commands::tracking::set_auth_token,
            commands::tracking::clear_auth_token,
            commands::tracking::start_tracking,
            commands::tracking::stop_tracking,
            commands::tracking::resume_tracking,
            commands::tracking::get_elapsed,
            commands::tracking::tick_usage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}