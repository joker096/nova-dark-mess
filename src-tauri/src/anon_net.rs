//! Minimal HTTP-over-SOCKS5 bridge for `.onion` relay endpoints.
//!
//! A webview cannot open a SOCKS circuit on its own, so the anonymous stack
//! asks this command to send its small JSON requests through the local Tor
//! SOCKS listener (`127.0.0.1:9050` by default). Only plain `http://` onion
//! endpoints are accepted: a v3 onion service address is authenticated by Tor
//! itself and the connection is encrypted end-to-end inside the Tor circuit,
//! so a TLS stack is not required and no dependency is added here.
//!
//! The implementation is intentionally tiny: SOCKS5 CONNECT to the onion host,
//! one HTTP/1.1 request with `Connection: close`, read the response, decode
//! chunked bodies. It never follows redirects and never leaves `.onion`.

use serde::{Deserialize, Serialize};
use std::fmt::Write as _;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

const DEFAULT_SOCKS_PORT: u16 = 9050;
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const IO_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocksHttpRequest {
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub socks_port: Option<u16>,
}

#[derive(Debug, Serialize)]
pub struct SocksHttpResponse {
    pub status: u16,
    pub body: String,
}

#[tauri::command]
pub async fn anon_socks_request(request: SocksHttpRequest) -> Result<SocksHttpResponse, String> {
    tauri::async_runtime::spawn_blocking(move || request_over_socks(request))
        .await
        .map_err(|err| format!("Tor request task failed: {err}"))?
}

#[derive(Debug, Serialize)]
pub struct TorCheckResponse {
    pub ok: bool,
    pub port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/** Lightweight liveness probe: opens a TCP connection to the local SOCKS
 * listener and completes the unauthenticated SOCKS5 greeting. Returns ok only
 * when a Tor-compatible proxy actually answers, so the app can refuse Tor mode
 * instead of silently failing every request. */
#[tauri::command]
pub async fn anon_tor_check(socks_port: Option<u16>) -> Result<TorCheckResponse, String> {
    let port = socks_port.unwrap_or(DEFAULT_SOCKS_PORT);
    if port == 0 {
        return Ok(TorCheckResponse { ok: false, port, error: Some("invalid SOCKS port".into()) });
    }
    match TcpStream::connect(("127.0.0.1", port)) {
        Ok(mut stream) => {
            let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
            let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
            match socks5_greeting(&mut stream) {
                Ok(()) => Ok(TorCheckResponse { ok: true, port, error: None }),
                Err(err) => Ok(TorCheckResponse { ok: false, port, error: Some(err) }),
            }
        }
        Err(err) => Ok(TorCheckResponse { ok: false, port, error: Some(format!("{err}")) }),
    }
}

fn socks5_greeting(stream: &mut TcpStream) -> Result<(), String> {
    stream
        .write_all(&[0x05, 0x01, 0x00])
        .map_err(|err| format!("SOCKS greeting failed: {err}"))?;
    let mut reply = [0u8; 2];
    stream
        .read_exact(&mut reply)
        .map_err(|err| format!("SOCKS greeting reply failed: {err}"))?;
    if reply != [0x05, 0x00] {
        return Err("proxy does not accept unauthenticated connections".into());
    }
    Ok(())
}

struct Target {
    host: String,
    port: u16,
    path: String,
}

fn parse_target(url: &str) -> Result<Target, String> {
    let rest = url
        .strip_prefix("http://")
        .ok_or_else(|| "only http:// .onion endpoints are supported".to_string())?;
    if rest.contains('@') || rest.contains(char::is_whitespace) {
        return Err("invalid onion URL".to_string());
    }
    let (authority, path) = match rest.find('/') {
        Some(index) => (&rest[..index], &rest[index..]),
        None => (rest, "/"),
    };
    if authority.is_empty() {
        return Err("invalid onion URL".to_string());
    }
    let (host, port) = match authority.rsplit_once(':') {
        Some((host, port)) => {
            let parsed = port
                .parse::<u16>()
                .map_err(|_| "invalid onion port".to_string())?;
            (host, parsed)
        }
        None => (authority, 80),
    };
    let host = host.to_ascii_lowercase();
    if host.len() < 7 || !host.ends_with(".onion") || host.contains(char::is_whitespace) {
        return Err("Tor transport requires a .onion hostname".to_string());
    }
    Ok(Target {
        host,
        port,
        path: path.to_string(),
    })
}

fn request_over_socks(request: SocksHttpRequest) -> Result<SocksHttpResponse, String> {
    let method = request.method.to_ascii_uppercase();
    if method != "GET" && method != "POST" {
        return Err("only GET and POST are supported".to_string());
    }
    let target = parse_target(&request.url)?;
    let socks_port = request.socks_port.unwrap_or(DEFAULT_SOCKS_PORT);
    if socks_port == 0 {
        return Err("invalid SOCKS port".to_string());
    }

    let mut stream = TcpStream::connect(("127.0.0.1", socks_port))
        .map_err(|err| format!("Tor SOCKS proxy is not reachable on 127.0.0.1:{socks_port}: {err}"))?;
    stream
        .set_read_timeout(Some(IO_TIMEOUT))
        .map_err(|err| format!("failed to set read timeout: {err}"))?;
    stream
        .set_write_timeout(Some(IO_TIMEOUT))
        .map_err(|err| format!("failed to set write timeout: {err}"))?;

    socks5_connect(&mut stream, &target.host, target.port)?;

    let body = request.body.unwrap_or_default();
    let mut http = String::new();
    let _ = write!(http, "{method} {} HTTP/1.1\r\n", target.path);
    let _ = write!(http, "Host: {}\r\n", target.host);
    let _ = write!(http, "Accept: application/json\r\n");
    let _ = write!(http, "Connection: close\r\n");
    if method == "POST" || !body.is_empty() {
        let _ = write!(http, "Content-Type: application/json\r\n");
        let _ = write!(http, "Content-Length: {}\r\n", body.len());
    }
    http.push_str("\r\n");
    http.push_str(&body);

    stream
        .write_all(http.as_bytes())
        .map_err(|err| format!("failed to send request through Tor: {err}"))?;

    let raw = read_until_close(&mut stream)?;
    parse_http_response(&raw)
}

fn socks5_connect(stream: &mut TcpStream, host: &str, port: u16) -> Result<(), String> {
    stream
        .write_all(&[0x05, 0x01, 0x00])
        .map_err(|err| format!("SOCKS greeting failed: {err}"))?;
    let mut greeting = [0u8; 2];
    stream
        .read_exact(&mut greeting)
        .map_err(|err| format!("SOCKS greeting reply failed: {err}"))?;
    if greeting != [0x05, 0x00] {
        return Err("Tor SOCKS proxy does not accept unauthenticated connections".to_string());
    }

    let host_bytes = host.as_bytes();
    if host_bytes.len() > u8::MAX as usize {
        return Err("onion hostname is too long".to_string());
    }
    let mut connect = Vec::with_capacity(7 + host_bytes.len());
    connect.extend_from_slice(&[0x05, 0x01, 0x00, 0x03, host_bytes.len() as u8]);
    connect.extend_from_slice(host_bytes);
    connect.extend_from_slice(&port.to_be_bytes());
    stream
        .write_all(&connect)
        .map_err(|err| format!("SOCKS connect failed: {err}"))?;

    let mut head = [0u8; 4];
    stream
        .read_exact(&mut head)
        .map_err(|err| format!("SOCKS connect reply failed: {err}"))?;
    if head[0] != 0x05 {
        return Err("unexpected SOCKS version".to_string());
    }
    if head[1] != 0x00 {
        return Err(format!("Tor could not reach the onion service (SOCKS status {})", head[1]));
    }
    match head[3] {
        0x01 => skip_bytes(stream, 4 + 2)?,
        0x03 => {
            let mut length = [0u8; 1];
            stream
                .read_exact(&mut length)
                .map_err(|err| format!("SOCKS address reply failed: {err}"))?;
            skip_bytes(stream, length[0] as usize + 2)?;
        }
        0x04 => skip_bytes(stream, 16 + 2)?,
        other => return Err(format!("unexpected SOCKS address type {other}")),
    }
    Ok(())
}

fn skip_bytes(stream: &mut TcpStream, count: usize) -> Result<(), String> {
    let mut buf = vec![0u8; count];
    stream
        .read_exact(&mut buf)
        .map_err(|err| format!("SOCKS reply truncated: {err}"))
}

fn read_until_close(stream: &mut TcpStream) -> Result<Vec<u8>, String> {
    let mut raw = Vec::new();
    let mut buf = [0u8; 4096];
    loop {
        let read = match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(read) => read,
            Err(err) if err.kind() == std::io::ErrorKind::ConnectionReset => break,
            Err(err) => return Err(format!("failed to read Tor response: {err}")),
        };
        raw.extend_from_slice(&buf[..read]);
        if raw.len() > MAX_RESPONSE_BYTES {
            return Err("Tor response is too large".to_string());
        }
    }
    Ok(raw)
}

fn parse_http_response(raw: &[u8]) -> Result<SocksHttpResponse, String> {
    let split = find_header_end(raw).ok_or_else(|| "malformed HTTP response".to_string())?;
    let head = std::str::from_utf8(&raw[..split]).map_err(|_| "malformed HTTP headers".to_string())?;
    let body = &raw[split + 4..];

    let mut lines = head.split("\r\n");
    let status_line = lines.next().ok_or_else(|| "missing HTTP status line".to_string())?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or_else(|| "malformed HTTP status line".to_string())?;

    let mut chunked = false;
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            if name.trim().eq_ignore_ascii_case("transfer-encoding")
                && value.to_ascii_lowercase().contains("chunked")
            {
                chunked = true;
            }
        }
    }

    let body = if chunked { decode_chunked(body)? } else { body.to_vec() };
    Ok(SocksHttpResponse {
        status,
        body: String::from_utf8_lossy(&body).into_owned(),
    })
}

fn find_header_end(raw: &[u8]) -> Option<usize> {
    raw.windows(4).position(|window| window == b"\r\n\r\n")
}

fn decode_chunked(mut input: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    loop {
        let line_end = input
            .windows(2)
            .position(|window| window == b"\r\n")
            .ok_or_else(|| "truncated chunk header".to_string())?;
        let size_line = std::str::from_utf8(&input[..line_end])
            .map_err(|_| "malformed chunk header".to_string())?;
        let size_text = size_line.split(';').next().unwrap_or("").trim();
        let size = usize::from_str_radix(size_text, 16)
            .map_err(|_| "malformed chunk size".to_string())?;
        input = &input[line_end + 2..];
        if size == 0 {
            return Ok(out);
        }
        if input.len() < size + 2 {
            return Err("truncated chunk body".to_string());
        }
        out.extend_from_slice(&input[..size]);
        input = &input[size + 2..];
        if out.len() > MAX_RESPONSE_BYTES {
            return Err("Tor response is too large".to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_clearnet_hosts() {
        assert!(parse_target("http://example.com/api").is_err());
        assert!(parse_target("https://abcd.onion/api").is_err());
        assert!(parse_target("http://user@abcd.onion/api").is_err());
    }

    #[test]
    fn parses_onion_host_and_port() {
        let target = parse_target("http://abc234.onion:8080/api/anon/enqueue").unwrap();
        assert_eq!(target.host, "abc234.onion");
        assert_eq!(target.port, 8080);
        assert_eq!(target.path, "/api/anon/enqueue");
    }

    #[test]
    fn decodes_chunked_bodies() {
        let body = b"4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n";
        assert_eq!(decode_chunked(body).unwrap(), b"Wikipedia");
    }

    #[test]
    fn parses_status_and_body() {
        let response = parse_http_response(b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n")
            .unwrap();
        assert_eq!(response.status, 204);
        assert_eq!(response.body, "");
    }
}
