//! Shared byte budgets for the UTF-8 text actually sent to the renderer.

/// Counts replacement expansion before allocation. Source byte limits alone
/// are insufficient: one invalid byte can become a three-byte replacement.
pub(crate) fn bounded_utf8(raw: &[u8], maximum: usize) -> Option<String> {
    raw.utf8_chunks().try_fold(0usize, |size, chunk| {
        let size = size.saturating_add(chunk.valid().len()).saturating_add(
            if chunk.invalid().is_empty() {
                0
            } else {
                '\u{fffd}'.len_utf8()
            },
        );
        (size <= maximum).then_some(size)
    })?;
    Some(String::from_utf8_lossy(raw).into_owned())
}
