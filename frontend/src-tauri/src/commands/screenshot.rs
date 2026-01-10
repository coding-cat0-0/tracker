use screenshots::Screen;
use reqwest::blocking::Client;
use std::io::Cursor;
use chrono::Utc;
use image::ImageOutputFormat;

use crate::state::auth_state::AuthState;

pub fn capture_and_upload_screenshot(
    auth_state: &AuthState,
) -> Result<(), ()> {
    let token = {
        let guard = auth_state.token.lock().unwrap();
        guard.clone().ok_or(())?
    };

    let screen = Screen::all()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .ok_or(())?;

    let image = screen.capture().map_err(|_| ())?;

    let mut png_bytes = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut png_bytes), ImageOutputFormat::Png)
        .map_err(|_| ())?;

    let filename = format!("shot_{}.png", Utc::now().timestamp_millis());

    Client::new()
        .post("http://localhost:9000/employee/upload-screenshot")
        .bearer_auth(token)
        .multipart(
            reqwest::blocking::multipart::Form::new().part(
                "file",
                reqwest::blocking::multipart::Part::bytes(png_bytes)
                    .file_name(filename)
                    .mime_str("image/png")
                    .unwrap(),
            ),
        )
        .send()
        .map_err(|_| ())?;

    Ok(())
}
