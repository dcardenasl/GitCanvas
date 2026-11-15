use super::ImageFormat;

pub(super) fn dimensions(format: ImageFormat, raw: &[u8]) -> Option<(u32, u32)> {
    match format {
        ImageFormat::Png => Some((be32(raw, 16)?, be32(raw, 20)?)),
        ImageFormat::Gif => Some((u32::from(le16(raw, 6)?), u32::from(le16(raw, 8)?))),
        ImageFormat::Bmp => bmp_dimensions(raw),
        ImageFormat::Ico => {
            let width = raw.get(6).copied()?.max(1);
            let height = raw.get(7).copied()?.max(1);
            Some((u32::from(width), u32::from(height)))
        }
        ImageFormat::Webp => webp_dimensions(raw),
        ImageFormat::Jpeg => jpeg_dimensions(raw),
        ImageFormat::Svg => None,
    }
}

pub(super) fn bmp_dimensions(raw: &[u8]) -> Option<(u32, u32)> {
    let dib_size = le32(raw, 14)?;
    if dib_size == 12 {
        return Some((u32::from(le16(raw, 18)?), u32::from(le16(raw, 20)?)));
    }
    if dib_size < 40 {
        return None;
    }
    let width = le32(raw, 18)?;
    let signed_height = i32::from_le_bytes(raw.get(22..26)?.try_into().ok()?);
    Some((width, signed_height.unsigned_abs()))
}

fn webp_dimensions(raw: &[u8]) -> Option<(u32, u32)> {
    let chunk = raw.get(12..16)?;
    match chunk {
        b"VP8X" => Some((
            le24(raw, 24)?.saturating_add(1),
            le24(raw, 27)?.saturating_add(1),
        )),
        b"VP8 " => {
            let marker = raw.get(23..26)?;
            if marker != [0x9d, 0x01, 0x2a] {
                return None;
            }
            Some((
                u32::from(le16(raw, 26)? & 0x3fff),
                u32::from(le16(raw, 28)? & 0x3fff),
            ))
        }
        b"VP8L" => {
            if raw.get(20).copied()? != 0x2f {
                return None;
            }
            let bits = u32::from_le_bytes(raw.get(21..25)?.try_into().ok()?);
            Some((
                (bits & 0x3fff).saturating_add(1),
                ((bits >> 14) & 0x3fff).saturating_add(1),
            ))
        }
        _ => None,
    }
}

fn jpeg_dimensions(raw: &[u8]) -> Option<(u32, u32)> {
    if !raw.starts_with(b"\xff\xd8") {
        return None;
    }
    let mut offset = 2_usize;
    while offset < raw.len() {
        while raw.get(offset) == Some(&0xff) {
            offset = offset.checked_add(1)?;
        }
        let marker = *raw.get(offset)?;
        offset = offset.checked_add(1)?;
        if marker == 0xd9 || marker == 0xda {
            return None;
        }
        if matches!(marker, 0x01 | 0xd0..=0xd8) {
            continue;
        }
        let length = usize::from(u16::from_be_bytes(
            raw.get(offset..offset.checked_add(2)?)?.try_into().ok()?,
        ));
        if length < 2 {
            return None;
        }
        let segment = offset.checked_add(2)?;
        let end = offset.checked_add(length)?;
        if end > raw.len() {
            return None;
        }
        if matches!(marker, 0xc0..=0xc3 | 0xc5..=0xc7 | 0xc9..=0xcb | 0xcd..=0xcf) {
            let height = u32::from(u16::from_be_bytes(
                raw.get(segment.checked_add(1)?..segment.checked_add(3)?)?
                    .try_into()
                    .ok()?,
            ));
            let width = u32::from(u16::from_be_bytes(
                raw.get(segment.checked_add(3)?..segment.checked_add(5)?)?
                    .try_into()
                    .ok()?,
            ));
            return Some((width, height));
        }
        offset = end;
    }
    None
}

fn be32(raw: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_be_bytes(
        raw.get(offset..offset.checked_add(4)?)?.try_into().ok()?,
    ))
}
fn le32(raw: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_le_bytes(
        raw.get(offset..offset.checked_add(4)?)?.try_into().ok()?,
    ))
}
fn le16(raw: &[u8], offset: usize) -> Option<u16> {
    Some(u16::from_le_bytes(
        raw.get(offset..offset.checked_add(2)?)?.try_into().ok()?,
    ))
}
fn le24(raw: &[u8], offset: usize) -> Option<u32> {
    let b = raw.get(offset..offset.checked_add(3)?)?;
    Some(u32::from(*b.first()?) | (u32::from(*b.get(1)?) << 8) | (u32::from(*b.get(2)?) << 16))
}

pub(super) fn animated(format: ImageFormat, raw: &[u8]) -> bool {
    match format {
        ImageFormat::Png => raw
            .windows(4)
            .position(|chunk| chunk == b"acTL")
            .is_some_and(|at| {
                raw.get(..at)
                    .is_some_and(|prefix| prefix.windows(4).any(|chunk| chunk == b"IDAT"))
            }),
        ImageFormat::Gif => gif_animated(raw),
        ImageFormat::Webp => {
            raw.get(12..16) == Some(b"VP8X") && raw.get(20).is_some_and(|flags| flags & 0x02 != 0)
        }
        _ => false,
    }
}

/// Walks GIF blocks so compressed image bytes cannot impersonate frame markers.
fn gif_animated(raw: &[u8]) -> bool {
    if raw.len() < 13 || !(raw.starts_with(b"GIF87a") || raw.starts_with(b"GIF89a")) {
        return false;
    }
    let mut offset = 13_usize;
    let screen_packed = raw.get(10).copied().unwrap_or_default();
    if screen_packed & 0x80 != 0 {
        let entries = 1_usize.checked_shl(u32::from(screen_packed & 0x07) + 1);
        let Some(bytes) = entries.and_then(|count| count.checked_mul(3)) else {
            return false;
        };
        let Some(next) = offset.checked_add(bytes).filter(|next| *next <= raw.len()) else {
            return false;
        };
        offset = next;
    }

    let mut frames = 0_u8;
    loop {
        let Some(marker) = raw.get(offset).copied() else {
            return false;
        };
        let Some(next) = offset.checked_add(1) else {
            return false;
        };
        offset = next;
        match marker {
            0x21 => {
                // Extension label, then its size-prefixed data sub-blocks.
                if raw.get(offset).is_none() {
                    return false;
                }
                let Some(next) = offset.checked_add(1) else {
                    return false;
                };
                offset = next;
                let Some(next) = gif_skip_sub_blocks(raw, offset) else {
                    return false;
                };
                offset = next;
            }
            0x2c => {
                let Some(descriptor) = raw.get(offset..offset.saturating_add(9)) else {
                    return false;
                };
                let Some(packed) = descriptor.get(8).copied() else {
                    return false;
                };
                let Some(next) = offset.checked_add(9) else {
                    return false;
                };
                offset = next;
                if packed & 0x80 != 0 {
                    let entries = 1_usize.checked_shl(u32::from(packed & 0x07) + 1);
                    let Some(bytes) = entries.and_then(|count| count.checked_mul(3)) else {
                        return false;
                    };
                    let Some(next) = offset.checked_add(bytes).filter(|next| *next <= raw.len())
                    else {
                        return false;
                    };
                    offset = next;
                }
                // LZW minimum code size precedes the image data sub-blocks.
                if raw.get(offset).is_none() {
                    return false;
                }
                let Some(next) = offset.checked_add(1) else {
                    return false;
                };
                offset = next;
                let Some(next) = gif_skip_sub_blocks(raw, offset) else {
                    return false;
                };
                offset = next;
                frames = frames.saturating_add(1);
                if frames > 1 {
                    return true;
                }
            }
            _ => return false,
        }
    }
}

fn gif_skip_sub_blocks(raw: &[u8], mut offset: usize) -> Option<usize> {
    loop {
        let length = usize::from(*raw.get(offset)?);
        offset = offset.checked_add(1)?;
        if length == 0 {
            return Some(offset);
        }
        offset = offset
            .checked_add(length)
            .filter(|next| *next <= raw.len())?;
    }
}

#[cfg(test)]
mod tests {
    use super::gif_animated;

    fn gif_with_frames(frames: u8) -> Vec<u8> {
        let still = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            "R0lGODlhAQABAIAAAP///////yH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
        )
        .expect("valid fixture base64");
        if frames < 2 {
            return still;
        }
        let frame_start = still
            .iter()
            .position(|byte| *byte == 0x2c)
            .expect("image separator");
        let trailer = still.len().checked_sub(1).expect("GIF trailer");
        [
            still.get(..trailer).unwrap_or_default(),
            still.get(frame_start..trailer).unwrap_or_default(),
            &[0x3b],
        ]
        .concat()
    }

    #[test]
    fn counts_gif_frames_from_blocks_not_compressed_byte_values() {
        assert!(!gif_animated(&gif_with_frames(1)));
        assert!(gif_animated(&gif_with_frames(2)));
    }
}
