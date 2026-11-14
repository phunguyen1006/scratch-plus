use base64::Engine as _;
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};
use tokio::fs;

use crate::AppState;

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const PICKER_SESSIONS_URL: &str = "https://photospicker.googleapis.com/v1/sessions";
const PICKER_MEDIA_ITEMS_URL: &str = "https://photospicker.googleapis.com/v1/mediaItems";
const PICKER_SCOPE: &str = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
const MAX_DOWNLOAD_BYTES: usize = 35 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GooglePhotosConfig {
    #[serde(default)]
    pub client_id: String,
    #[serde(default)]
    pub client_secret: Option<String>,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GooglePhotosStatus {
    pub has_client_id: bool,
    pub client_id: String,
    pub has_client_secret: bool,
    pub connected: bool,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PickerSessionResponse {
    id: String,
    #[serde(default)]
    picker_uri: Option<String>,
    #[serde(default)]
    media_items_set: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PickerMediaItemsResponse {
    #[serde(default)]
    media_items: Vec<PickerMediaItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PickerMediaItem {
    #[serde(default)]
    media_file: Option<PickerMediaFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PickerMediaFile {
    #[serde(default)]
    base_url: Option<String>,
}

pub fn detect_image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() >= 8 && &bytes[0..8] == b"\x89PNG\r\n\x1a\n" {
        return Some("png");
    }
    if bytes.len() >= 3 && &bytes[0..3] == b"\xFF\xD8\xFF" {
        return Some("jpg");
    }
    if bytes.len() >= 6 && (&bytes[0..6] == b"GIF87a" || &bytes[0..6] == b"GIF89a") {
        return Some("gif");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    if bytes.len() >= 2 && &bytes[0..2] == b"BM" {
        return Some("bmp");
    }
    None
}

pub fn validate_subfolder(subfolder: Option<&str>) -> Result<Option<String>, String> {
    let Some(raw) = subfolder else {
        return Ok(None);
    };
    let trimmed = raw.trim().trim_matches(|c| c == '/' || c == '\\');
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.len() > 32
        || trimmed == "."
        || trimmed == ".."
        || !trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid asset subfolder".to_string());
    }
    Ok(Some(trimmed.to_string()))
}

pub fn resolve_assets_dir_and_prefix(
    notes_folder: &str,
    subfolder: Option<&str>,
) -> Result<(PathBuf, String), String> {
    let sub = validate_subfolder(subfolder)?;
    let mut dir = PathBuf::from(notes_folder).join("assets");
    let prefix = if let Some(ref s) = sub {
        dir = dir.join(s);
        format!("assets/{}", s)
    } else {
        "assets".to_string()
    };
    Ok((dir, prefix))
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to locate app data directory: {}", e))?;
    Ok(dir.join("google_photos_auth.json"))
}

async fn load_config(app: &AppHandle) -> Result<GooglePhotosConfig, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(GooglePhotosConfig::default());
    }
    let raw = fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read Google Photos config: {}", e))?;
    serde_json::from_str(&raw).map_err(|e| format!("Invalid Google Photos config: {}", e))
}

async fn save_config(app: &AppHandle, config: &GooglePhotosConfig) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to prepare config directory: {}", e))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize Google Photos config: {}", e))?;
    fs::write(&path, json)
        .await
        .map_err(|e| format!("Failed to save Google Photos config: {}", e))?;
    Ok(())
}

fn to_status(config: &GooglePhotosConfig) -> GooglePhotosStatus {
    let has_client_id = !config.client_id.trim().is_empty();
    let connected = has_client_id
        && (config.refresh_token.is_some() || config.access_token.is_some());
    GooglePhotosStatus {
        has_client_id,
        client_id: config.client_id.trim().to_string(),
        has_client_secret: config
            .client_secret
            .as_deref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false),
        connected,
    }
}

fn random_base64url(num_bytes: usize) -> String {
    let mut buf = vec![0u8; num_bytes];
    OsRng.fill_bytes(&mut buf);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(buf)
}

fn encode_form(pairs: &[(&str, &str)]) -> String {
    pairs
        .iter()
        .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

fn wait_for_oauth_callback(
    listener: TcpListener,
    expected_state: &str,
    port: u16,
) -> Result<String, String> {
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Failed to configure OAuth listener: {}", e))?;
    let deadline = Instant::now() + Duration::from_secs(180);

    loop {
        if Instant::now() >= deadline {
            return Err("Google sign-in timed out after 3 minutes".to_string());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buf = [0u8; 4096];
                let n = stream.read(&mut buf).unwrap_or(0);
                if n == 0 {
                    continue;
                }
                let req = String::from_utf8_lossy(&buf[..n]);
                let first_line = req.lines().next().unwrap_or("");
                let target = first_line.split_whitespace().nth(1).unwrap_or("/");
                if !target.starts_with("/callback") {
                    let _ = stream.write_all(
                        b"HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
                    );
                    continue;
                }

                let full_url = format!("http://127.0.0.1:{}{}", port, target);
                let parsed = url::Url::parse(&full_url)
                    .map_err(|_| "Invalid OAuth callback URL".to_string())?;
                let mut code: Option<String> = None;
                let mut state: Option<String> = None;
                let mut error: Option<String> = None;
                for (k, v) in parsed.query_pairs() {
                    match k.as_ref() {
                        "code" => code = Some(v.into_owned()),
                        "state" => state = Some(v.into_owned()),
                        "error" => error = Some(v.into_owned()),
                        _ => {}
                    }
                }

                let html = if error.is_some() {
                    "<!doctype html><html><body style=\"font-family:system-ui,sans-serif;max-width:440px;margin:64px auto;padding:0 16px;color:#111\"><h2>Google Photos sign-in failed</h2><p>You can close this window and return to Scratch.</p></body></html>"
                } else {
                    "<!doctype html><html><body style=\"font-family:system-ui,sans-serif;max-width:440px;margin:64px auto;padding:0 16px;color:#111\"><h2>Connected to Google Photos</h2><p>You can close this tab and return to Scratch.</p></body></html>"
                };
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    html.len(),
                    html
                );
                let _ = stream.write_all(resp.as_bytes());
                let _ = stream.flush();

                if let Some(err) = error {
                    return Err(format!("Google sign-in declined: {}", err));
                }
                if state.as_deref() != Some(expected_state) {
                    return Err("Google OAuth state mismatch".to_string());
                }
                return code.ok_or_else(|| "Authorization code missing".to_string());
            }
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(err) => {
                return Err(format!("OAuth callback listener failed: {}", err));
            }
        }
    }
}

async fn ensure_access_token(
    app: &AppHandle,
    client: &reqwest::Client,
) -> Result<String, String> {
    let mut config = load_config(app).await?;
    let client_id = config.client_id.trim().to_string();
    if client_id.is_empty() {
        return Err("Google Photos OAuth Client ID is not configured".to_string());
    }
    let now = chrono::Utc::now().timestamp();
    if let (Some(token), Some(exp)) = (config.access_token.as_ref(), config.expires_at) {
        if !token.is_empty() && exp > now + 60 {
            return Ok(token.clone());
        }
    }

    let refresh_token = config
        .refresh_token
        .clone()
        .ok_or_else(|| "Google Photos session expired. Please reconnect in Settings.".to_string())?;

    let mut form = vec![
        ("client_id", client_id.as_str()),
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token.as_str()),
    ];
    let secret_owned = config.client_secret.clone().unwrap_or_default();
    if !secret_owned.trim().is_empty() {
        form.push(("client_secret", secret_owned.trim()));
    }

    let res = client
        .post(GOOGLE_TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(encode_form(&form))
        .send()
        .await
        .map_err(|e| format!("Failed to refresh Google token: {}", e))?;

    if !res.status().is_success() {
        if res.status().as_u16() == 400 || res.status().as_u16() == 401 {
            config.access_token = None;
            config.refresh_token = None;
            config.expires_at = None;
            let _ = save_config(app, &config).await;
            return Err("Google Photos authorization revoked or expired. Please reconnect in Settings.".to_string());
        }
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Google token refresh failed: {}", body));
    }

    let tok: TokenResponse = res
        .json()
        .await
        .map_err(|e| format!("Invalid token refresh response: {}", e))?;

    config.access_token = Some(tok.access_token.clone());
    if let Some(new_refresh) = tok.refresh_token {
        config.refresh_token = Some(new_refresh);
    }
    config.expires_at = Some(chrono::Utc::now().timestamp() + tok.expires_in.unwrap_or(3600));
    save_config(app, &config).await?;
    Ok(tok.access_token)
}

#[tauri::command]
pub async fn get_google_photos_status(app: AppHandle) -> Result<GooglePhotosStatus, String> {
    let config = load_config(&app).await?;
    Ok(to_status(&config))
}

#[tauri::command]
pub async fn set_google_photos_client_id(
    app: AppHandle,
    client_id: String,
    client_secret: Option<String>,
) -> Result<GooglePhotosStatus, String> {
    let mut config = load_config(&app).await?;
    let trimmed_id = client_id.trim().to_string();
    if config.client_id.trim() != trimmed_id {
        config.access_token = None;
        config.refresh_token = None;
        config.expires_at = None;
    }
    config.client_id = trimmed_id;
    config.client_secret = client_secret
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    save_config(&app, &config).await?;
    Ok(to_status(&config))
}

#[tauri::command]
pub async fn connect_google_photos(app: AppHandle) -> Result<GooglePhotosStatus, String> {
    let mut config = load_config(&app).await?;
    let client_id = config.client_id.trim().to_string();
    if client_id.is_empty() {
        return Err("Enter your Google OAuth Desktop Client ID first".to_string());
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to start local OAuth callback server: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to inspect callback port: {}", e))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);

    let code_verifier = random_base64url(32);
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(Sha256::digest(code_verifier.as_bytes()));
    let oauth_state = random_base64url(16);

    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent&state={}",
        GOOGLE_AUTH_URL,
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(PICKER_SCOPE),
        urlencoding::encode(&challenge),
        urlencoding::encode(&oauth_state),
    );

    open::that(&auth_url).map_err(|e| format!("Failed to open browser for Google sign-in: {}", e))?;

    let state_clone = oauth_state.clone();
    let code = tokio::task::spawn_blocking(move || wait_for_oauth_callback(listener, &state_clone, port))
        .await
        .map_err(|e| format!("OAuth callback task failed: {}", e))??;

    let mut form = vec![
        ("client_id", client_id.as_str()),
        ("code", code.as_str()),
        ("code_verifier", code_verifier.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri.as_str()),
    ];
    let secret_owned = config.client_secret.clone().unwrap_or_default();
    if !secret_owned.trim().is_empty() {
        form.push(("client_secret", secret_owned.trim()));
    }

    let client = reqwest::Client::new();
    let res = client
        .post(GOOGLE_TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(encode_form(&form))
        .send()
        .await
        .map_err(|e| format!("Failed to exchange Google auth code: {}", e))?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Google sign-in token exchange failed: {}", body));
    }

    let tok: TokenResponse = res
        .json()
        .await
        .map_err(|e| format!("Invalid Google token response: {}", e))?;

    config.access_token = Some(tok.access_token);
    if tok.refresh_token.is_some() {
        config.refresh_token = tok.refresh_token;
    }
    config.expires_at = Some(chrono::Utc::now().timestamp() + tok.expires_in.unwrap_or(3600));
    save_config(&app, &config).await?;
    Ok(to_status(&config))
}

#[tauri::command]
pub async fn disconnect_google_photos(app: AppHandle) -> Result<GooglePhotosStatus, String> {
    let mut config = load_config(&app).await?;
    config.access_token = None;
    config.refresh_token = None;
    config.expires_at = None;
    save_config(&app, &config).await?;
    Ok(to_status(&config))
}

#[tauri::command]
pub async fn pick_google_photo(
    app: AppHandle,
    state: State<'_, AppState>,
    subfolder: Option<String>,
) -> Result<String, String> {
    let notes_folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };
    let (assets_dir, prefix) = resolve_assets_dir_and_prefix(&notes_folder, subfolder.as_deref())?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let access_token = ensure_access_token(&app, &client).await?;

    let create_res = client
        .post(PICKER_SESSIONS_URL)
        .bearer_auth(&access_token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| format!("Failed to start Google Photos Picker session: {}", e))?;

    if !create_res.status().is_success() {
        let body = create_res.text().await.unwrap_or_default();
        return Err(format!("Google Photos Picker error: {}", body));
    }

    let session: PickerSessionResponse = create_res
        .json()
        .await
        .map_err(|e| format!("Invalid Google Photos Picker session response: {}", e))?;

    let picker_uri = session
        .picker_uri
        .as_deref()
        .filter(|u| u.starts_with("https://"))
        .ok_or_else(|| "Google Photos Picker URL missing or invalid".to_string())?;

    open::that(picker_uri)
        .map_err(|e| format!("Failed to open Google Photos Picker in browser: {}", e))?;

    let session_url = format!("{}/{}", PICKER_SESSIONS_URL, urlencoding::encode(&session.id));
    let deadline = Instant::now() + Duration::from_secs(180);
    let mut selected_ready = session.media_items_set.unwrap_or(false);

    while !selected_ready {
        if Instant::now() >= deadline {
            let _ = client.delete(&session_url).bearer_auth(&access_token).send().await;
            return Err("Google Photos Picker timed out waiting for selection".to_string());
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
        let poll_res = client
            .get(&session_url)
            .bearer_auth(&access_token)
            .send()
            .await
            .map_err(|e| format!("Failed polling Google Photos Picker: {}", e))?;
        if !poll_res.status().is_success() {
            let body = poll_res.text().await.unwrap_or_default();
            return Err(format!("Google Photos Picker polling error: {}", body));
        }
        let status: PickerSessionResponse = poll_res
            .json()
            .await
            .map_err(|e| format!("Invalid Picker status response: {}", e))?;
        selected_ready = status.media_items_set.unwrap_or(false);
    }

    let items_url = format!(
        "{}?sessionId={}",
        PICKER_MEDIA_ITEMS_URL,
        urlencoding::encode(&session.id)
    );
    let items_res = client
        .get(&items_url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to list picked Google Photos: {}", e))?;

    let items_status = items_res.status();
    if !items_status.is_success() {
        let body = items_res.text().await.unwrap_or_default();
        return Err(format!("Failed to read picked photos: {}", body));
    }

    let items: PickerMediaItemsResponse = items_res
        .json()
        .await
        .map_err(|e| format!("Invalid picked photos payload: {}", e))?;

    let base_url = items
        .media_items
        .into_iter()
        .find_map(|item| item.media_file.and_then(|f| f.base_url))
        .ok_or_else(|| "No photo was selected".to_string())?;

    let download_url = format!("{}=d", base_url);
    let img_res = client
        .get(&download_url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to download photo from Google Photos: {}", e))?;

    if !img_res.status().is_success() {
        return Err("Failed to download selected photo from Google Photos".to_string());
    }

    let bytes = img_res
        .bytes()
        .await
        .map_err(|e| format!("Failed to read downloaded photo bytes: {}", e))?;
    if bytes.is_empty() || bytes.len() > MAX_DOWNLOAD_BYTES {
        return Err("Downloaded photo size is empty or too large".to_string());
    }

    let ext = detect_image_extension(&bytes)
        .ok_or_else(|| "Downloaded file is not a supported image (PNG, JPEG, GIF, WEBP, BMP)".to_string())?;

    fs::create_dir_all(&assets_dir)
        .await
        .map_err(|e| format!("Failed to prepare assets directory: {}", e))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let suffix = random_base64url(4)
        .replace(['-', '_'], "")
        .to_lowercase();

    let mut filename = format!("photo-{}-{}.{}", timestamp, suffix, ext);
    let mut counter = 1;
    let mut target_path = assets_dir.join(&filename);
    while target_path.exists() {
        filename = format!("photo-{}-{}-{}.{}", timestamp, suffix, counter, ext);
        target_path = assets_dir.join(&filename);
        counter += 1;
    }

    fs::write(&target_path, &bytes)
        .await
        .map_err(|e| format!("Failed to save downloaded photo locally: {}", e))?;

    let _ = client.delete(&session_url).bearer_auth(&access_token).send().await;

    Ok(format!("{}/{}", prefix, filename))
}
