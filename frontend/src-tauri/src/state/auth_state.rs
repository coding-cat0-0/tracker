use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct AuthState {
    pub token: Arc<Mutex<Option<String>>>,
}

impl AuthState {
    pub fn new() -> Self {
        Self {
            token: Arc::new(Mutex::new(None)),
        }
    }
}
