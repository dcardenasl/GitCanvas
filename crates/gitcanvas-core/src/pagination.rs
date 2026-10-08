//! Shared validation for caller-controlled page sizes.

use crate::error::AppError;

/// Validates a page size against the inclusive range `1..=maximum`.
pub(crate) fn validate_page_size(size: usize, maximum: usize) -> Result<(), AppError> {
    if size == 0 || size > maximum {
        return Err(AppError::InvalidInput(format!(
            "Page size must be between 1 and {maximum}"
        )));
    }
    Ok(())
}

/// Resolves an optional page size and validates the selected value.
pub(crate) fn resolve_page_size(
    requested: Option<u16>,
    default: usize,
    maximum: usize,
) -> Result<usize, AppError> {
    let size = requested.map_or(default, usize::from);
    validate_page_size(size, maximum)?;
    Ok(size)
}

#[cfg(test)]
mod tests {
    use super::{resolve_page_size, validate_page_size};
    use crate::error::AppError;

    #[test]
    fn accepts_page_size_boundaries_and_default() {
        assert_eq!(validate_page_size(1, 250), Ok(()));
        assert_eq!(validate_page_size(250, 250), Ok(()));
        assert_eq!(resolve_page_size(None, 250, 250), Ok(250));
    }

    #[test]
    fn rejects_zero_and_oversized_pages_instead_of_clamping() {
        assert!(matches!(
            validate_page_size(0, 250),
            Err(AppError::InvalidInput(_))
        ));
        assert!(matches!(
            resolve_page_size(Some(251), 250, 250),
            Err(AppError::InvalidInput(_))
        ));
    }
}
