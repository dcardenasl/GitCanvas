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
        ImageFormat::Gif => {
            raw.windows(2)
                .filter(|bytes| bytes.first() == Some(&0x2c))
                .count()
                > 1
        }
        ImageFormat::Webp => {
            raw.get(12..16) == Some(b"VP8X") && raw.get(20).is_some_and(|flags| flags & 0x02 != 0)
        }
        _ => false,
    }
}
