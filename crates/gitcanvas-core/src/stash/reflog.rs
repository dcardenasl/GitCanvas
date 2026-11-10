//! A bounded decoder for the file-backed stash reflog, not a general reflog API.

use git2::Oid;
use sha2::{Digest, Sha256};

use super::{recorded_branch, StashEntry, MAX_STASH_ENTRIES, MAX_STASH_ENTRY_BYTES};
use crate::{error::AppError, repository::parse_commit_id};

pub(super) struct Record<'a> {
    pub(super) id: Oid,
    raw: &'a [u8],
    message: Option<&'a [u8]>,
    seconds: i64,
    offset_minutes: i32,
}

impl Record<'_> {
    pub(super) fn matches(&self, search: &str) -> bool {
        search.is_empty()
            || self.message.is_some_and(|message| {
                String::from_utf8_lossy(message)
                    .to_lowercase()
                    .contains(search)
            })
    }

    pub(super) fn anchor(&self, index: usize) -> String {
        let mut digest = Sha256::new();
        digest.update(index.to_le_bytes());
        digest.update(self.raw);
        format!("{:x}", digest.finalize())
    }

    pub(super) fn entry(&self, index: u32) -> StashEntry {
        let message = self.message.map(String::from_utf8_lossy);
        let lossy = matches!(message, Some(std::borrow::Cow::Owned(_)));
        StashEntry {
            stash_id: self.id.to_string(),
            index,
            branch: recorded_branch(message.as_deref(), lossy),
            message: message.map(std::borrow::Cow::into_owned),
            message_lossy: lossy,
            recorded_at: self.seconds.to_string(),
            offset_minutes: self.offset_minutes,
        }
    }
}

pub(super) fn parse(bytes: &[u8]) -> Result<Vec<Record<'_>>, AppError> {
    let mut records = Vec::new();
    for line in bytes.split_inclusive(|byte| *byte == b'\n') {
        if records.len() >= MAX_STASH_ENTRIES as usize {
            return Err(AppError::ResourceLimitExceeded(format!(
                "Stash reflog exceeds {MAX_STASH_ENTRIES} entries"
            )));
        }
        if line.len() > MAX_STASH_ENTRY_BYTES as usize {
            return Err(AppError::ResourceLimitExceeded(format!(
                "Stash reflog entry exceeds {MAX_STASH_ENTRY_BYTES} bytes"
            )));
        }
        let body = line
            .strip_suffix(b"\n")
            .filter(|line| !line.contains(&0))
            .ok_or_else(|| corrupt("unterminated entry or NUL byte"))?;
        let mut fields = body.splitn(3, |byte| *byte == b' ');
        let old = fields.next().ok_or_else(|| corrupt("missing old id"))?;
        let new = fields.next().ok_or_else(|| corrupt("missing stash id"))?;
        decode_oid(old)?;
        let id = decode_oid(new)?;
        if id.is_zero() {
            return Err(corrupt("zero stash id"));
        }
        let remainder = fields.next().ok_or_else(|| corrupt("missing signature"))?;
        let mut parts = remainder.splitn(2, |byte| *byte == b'\t');
        let signature = parts.next().ok_or_else(|| corrupt("missing signature"))?;
        let message = parts.next();
        let (seconds, offset_minutes) = decode_time(signature)?;
        records.push(Record {
            id,
            raw: line,
            message,
            seconds,
            offset_minutes,
        });
    }
    Ok(records)
}

fn decode_oid(bytes: &[u8]) -> Result<Oid, AppError> {
    let text = std::str::from_utf8(bytes).map_err(|_| corrupt("non-ASCII object id"))?;
    parse_commit_id(text).map_err(|_| corrupt("invalid full object id"))
}

fn decode_time(signature: &[u8]) -> Result<(i64, i32), AppError> {
    let mut parts = signature.rsplitn(2, |byte| *byte == b'>');
    let time = parts
        .next()
        .ok_or_else(|| corrupt("missing signature timestamp"))?;
    let identity = parts
        .next()
        .ok_or_else(|| corrupt("missing signature email"))?;
    if !identity.contains(&b'<') {
        return Err(corrupt("invalid signature email"));
    }
    let time = time
        .strip_prefix(b" ")
        .and_then(|value| std::str::from_utf8(value).ok())
        .ok_or_else(|| corrupt("invalid signature timestamp"))?;
    let (seconds, offset) = time
        .split_once(' ')
        .ok_or_else(|| corrupt("missing signature timezone"))?;
    let seconds = seconds
        .parse::<i64>()
        .map_err(|_| corrupt("invalid signature timestamp"))?;
    let (sign, digits) = match offset.as_bytes().split_first() {
        Some((b'+', digits)) => (1i32, digits),
        Some((b'-', digits)) => (-1i32, digits),
        _ => return Err(corrupt("invalid signature timezone")),
    };
    if digits.len() != 4 || !digits.iter().all(u8::is_ascii_digit) {
        return Err(corrupt("invalid signature timezone"));
    }
    let value = std::str::from_utf8(digits)
        .ok()
        .and_then(|text| text.parse::<i32>().ok())
        .ok_or_else(|| corrupt("invalid signature timezone"))?;
    let hours = value.saturating_div(100);
    let minutes = value.rem_euclid(100);
    if hours > 23 || minutes > 59 {
        return Err(corrupt("invalid signature timezone"));
    }
    Ok((
        seconds,
        hours
            .saturating_mul(60)
            .saturating_add(minutes)
            .saturating_mul(sign),
    ))
}

fn corrupt(reason: &str) -> AppError {
    AppError::Git(format!("Cannot read stash reflog: {reason}"))
}
