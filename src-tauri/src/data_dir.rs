//! Where the application keeps its own data: logs, cached clones and the
//! workspace file.

use std::{ffi::OsString, path::PathBuf};

use gitcanvas_core::error::AppError;

/// Names a directory to use instead of the platform's application data
/// directory.
///
/// It exists so the end-to-end suite runs against a throwaway directory and can
/// neither read nor overwrite the workspace of the person running it. It follows
/// the same convention as `GITCANVAS_REPOSITORY`: an environment variable for
/// callers that cannot pass arguments.
pub const DATA_DIR_ENV: &str = "GITCANVAS_DATA_DIR";

/// Chooses the data directory: the override when one is set, otherwise the
/// platform default.
///
/// An empty override counts as unset, which is what an exported-but-blank
/// variable means. A relative one is refused rather than resolved, because it
/// would silently depend on the directory the process started in.
///
/// # Errors
/// Returns [`AppError::InvalidInput`] when the override is not an absolute path.
pub fn resolve(override_dir: Option<OsString>, default: PathBuf) -> Result<PathBuf, AppError> {
    match override_dir {
        Some(value) if !value.is_empty() => {
            let path = PathBuf::from(value);
            if path.is_absolute() {
                Ok(path)
            } else {
                Err(AppError::InvalidInput(format!(
                    "{DATA_DIR_ENV} must be an absolute path"
                )))
            }
        }
        _ => Ok(default),
    }
}

#[cfg(test)]
mod tests {
    use std::{ffi::OsString, path::PathBuf};

    use super::resolve;
    use gitcanvas_core::error::AppError;

    fn default() -> PathBuf {
        std::env::temp_dir().join("default-data")
    }

    #[test]
    fn without_an_override_the_platform_default_is_used() {
        assert_eq!(resolve(None, default()).unwrap(), default());
    }

    #[test]
    fn a_blank_override_counts_as_unset() {
        assert_eq!(
            resolve(Some(OsString::new()), default()).unwrap(),
            default()
        );
    }

    #[test]
    fn an_absolute_override_replaces_the_default() {
        let chosen = std::env::temp_dir().join("chosen");

        let resolved = resolve(Some(chosen.clone().into_os_string()), default()).unwrap();

        assert_eq!(resolved, chosen);
    }

    #[test]
    fn a_relative_override_is_refused() {
        let result = resolve(Some(OsString::from("relative/dir")), default());

        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }
}
