use super::{header, ImageFormat};

pub(super) fn sniff(raw: &[u8]) -> Option<ImageFormat> {
    if raw.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some(ImageFormat::Png);
    }
    if raw.starts_with(b"\xff\xd8\xff") {
        return Some(ImageFormat::Jpeg);
    }
    if raw.starts_with(b"GIF87a") || raw.starts_with(b"GIF89a") {
        return Some(ImageFormat::Gif);
    }
    if raw.len() >= 12 && raw.get(..4) == Some(b"RIFF") && raw.get(8..12) == Some(b"WEBP") {
        return Some(ImageFormat::Webp);
    }
    if raw.starts_with(b"BM") && header::bmp_dimensions(raw).is_some() {
        return Some(ImageFormat::Bmp);
    }
    if raw.len() >= 6 && raw.get(..4) == Some(b"\0\0\x01\0") {
        let count = raw
            .get(4..6)
            .and_then(|bytes| bytes.try_into().ok())
            .map(u16::from_le_bytes);
        if let Some(count) = count.filter(|value| *value > 0) {
            let entries = usize::from(count).checked_mul(16);
            let minimum_length = entries.and_then(|value| value.checked_add(6));
            if minimum_length.is_some_and(|length| raw.len() >= length) {
                return Some(ImageFormat::Ico);
            }
        }
    }
    if svg_prefix(raw) {
        return Some(ImageFormat::Svg);
    }
    None
}

fn svg_prefix(raw: &[u8]) -> bool {
    let mut input = raw.get(..8_192).unwrap_or(raw);
    if input.starts_with(&[0xef, 0xbb, 0xbf]) {
        input = input.get(3..).unwrap_or_default();
    }
    loop {
        input = input.trim_ascii_start();
        if input.starts_with(b"<?xml") {
            let Some(end) = input.windows(2).position(|part| part == b"?>") else {
                return false;
            };
            input = end
                .checked_add(2)
                .and_then(|next| input.get(next..))
                .unwrap_or_default();
        } else if input.starts_with(b"<!--") {
            let Some(end) = input.windows(3).position(|part| part == b"-->") else {
                return false;
            };
            input = end
                .checked_add(3)
                .and_then(|next| input.get(next..))
                .unwrap_or_default();
        } else if input.starts_with(b"<!DOCTYPE") {
            let Some(end) = input.iter().position(|byte| *byte == b'>') else {
                return false;
            };
            input = end
                .checked_add(1)
                .and_then(|next| input.get(next..))
                .unwrap_or_default();
        } else {
            return input.starts_with(b"<svg")
                && input
                    .get(4)
                    .is_some_and(|byte| byte.is_ascii_whitespace() || *byte == b'>');
        }
    }
}
