#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]
//! The GitHub client, exercised against a local HTTP server rather than the
//! real API: no network, no token, no rate limit, and every failure path can
//! actually be provoked.

use std::{
    io::{BufRead, BufReader, Write},
    net::{TcpListener, TcpStream},
    sync::mpsc,
    thread,
};

use gitcanvas_core::github::api::GitHubClient;

/// A single-threaded HTTP server that replies with canned responses in order.
struct FakeGitHub {
    base_url: String,
    requests: mpsc::Receiver<String>,
}

impl FakeGitHub {
    fn start(responses: Vec<(u16, String)>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let (tx, requests) = mpsc::channel();

        thread::spawn(move || {
            for (index, (status, body)) in responses.into_iter().enumerate() {
                let Ok((stream, _)) = listener.accept() else {
                    return;
                };
                let _ = index;
                serve(stream, status, &body, &tx);
            }
        });

        Self { base_url, requests }
    }

    fn client(&self, token: &str) -> GitHubClient {
        GitHubClient::with_base_url(token.to_owned(), self.base_url.clone())
    }

    fn next_request(&self) -> String {
        self.requests
            .recv_timeout(std::time::Duration::from_secs(5))
            .expect("the client should have made a request")
    }
}

fn serve(mut stream: TcpStream, status: u16, body: &str, tx: &mpsc::Sender<String>) {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut head = String::new();
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap_or(0) == 0 {
            break;
        }
        if line == "\r\n" {
            break;
        }
        head.push_str(&line);
    }
    let _ = tx.send(head);

    let reason = if status == 200 { "OK" } else { "ERR" };
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

#[test]
fn verify_reports_the_authenticated_account() {
    let server = FakeGitHub::start(vec![(
        200,
        r#"{"login":"dcardenasl","name":"David Cardenas"}"#.to_owned(),
    )]);

    let account = server.client("token-abc").verify().unwrap();

    assert_eq!(account.login, "dcardenasl");
    assert_eq!(account.name.as_deref(), Some("David Cardenas"));
}

#[test]
fn the_token_travels_only_in_the_authorization_header() {
    let server = FakeGitHub::start(vec![(200, r#"{"login":"x","name":null}"#.to_owned())]);
    server.client("super-secret").verify().unwrap();

    let head = server.next_request();
    let request_line = head.lines().next().unwrap();
    // Header names are case-insensitive per RFC 9110, and ureq normalises them
    // to lowercase the way HTTP/2 requires, so the comparison must not care.
    let lowered = head.to_lowercase();

    assert!(
        lowered.contains("authorization: bearer super-secret"),
        "the token belongs in the header"
    );
    assert!(
        !request_line.contains("super-secret"),
        "a token in the URL would end up in server logs and history"
    );
    assert!(lowered.contains("user-agent: gitcanvas/"));
}

#[test]
fn a_rejected_token_is_reported_as_invalid_input_not_an_internal_error() {
    let server = FakeGitHub::start(vec![(401, r#"{"message":"Bad credentials"}"#.to_owned())]);

    let error = server.client("expired").verify().unwrap_err();

    assert!(
        format!("{error:?}").contains("InvalidInput"),
        "an expired token is the user's problem to fix, not a crash: {error:?}"
    );
}

#[test]
fn missing_scopes_are_reported_the_same_way_as_a_bad_token() {
    let server = FakeGitHub::start(vec![(403, r#"{"message":"Forbidden"}"#.to_owned())]);
    let error = server.client("no-scopes").verify().unwrap_err();
    assert!(format!("{error:?}").contains("InvalidInput"));
}

#[test]
fn repositories_are_listed_with_the_fields_the_picker_needs() {
    let body = r#"[
      {"full_name":"dcardenasl/gitcanvas","clone_url":"https://github.com/dcardenasl/gitcanvas.git","private":true,"default_branch":"main","description":"Visual git client"},
      {"full_name":"dcardenasl/other","clone_url":"https://github.com/dcardenasl/other.git","private":false,"default_branch":null,"description":null}
    ]"#;
    let server = FakeGitHub::start(vec![(200, body.to_owned())]);

    let repos = server.client("t").list_repositories().unwrap();

    assert_eq!(repos.len(), 2);
    assert_eq!(repos[0].full_name, "dcardenasl/gitcanvas");
    assert!(repos[0].private);
    assert_eq!(
        repos[1].default_branch, "main",
        "a repository without a default branch still needs a usable one"
    );
}

#[test]
fn pagination_stops_on_the_first_short_page() {
    // A full page must be followed by another request; a short one must not.
    let full: String = format!(
        "[{}]",
        (0..100)
            .map(|index| format!(
                r#"{{"full_name":"o/r{index}","clone_url":"https://x/{index}.git","private":false,"default_branch":"main","description":null}}"#
            ))
            .collect::<Vec<_>>()
            .join(",")
    );
    let server = FakeGitHub::start(vec![(200, full), (200, "[]".to_owned())]);

    let repos = server.client("t").list_repositories().unwrap();

    assert_eq!(repos.len(), 100);
    let first = server.next_request();
    let second = server.next_request();
    assert!(first.contains("page=1"));
    assert!(second.contains("page=2"));
}

#[test]
fn a_malformed_payload_is_an_error_not_a_panic() {
    let server = FakeGitHub::start(vec![(200, "not json at all".to_owned())]);
    assert!(server.client("t").verify().is_err());
}
