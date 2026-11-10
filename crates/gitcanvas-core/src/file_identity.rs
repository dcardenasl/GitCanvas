//! Cross-platform identity checks for files opened by bounded readers.

use std::{
    fs::{File, Metadata},
    path::Path,
};

#[cfg(unix)]
pub(crate) fn same_file_identity(
    _file: &File,
    _path: &Path,
    opened: &Metadata,
    current: &Metadata,
) -> bool {
    use std::os::unix::fs::MetadataExt;

    opened.dev() == current.dev() && opened.ino() == current.ino()
}

#[cfg(windows)]
pub(crate) fn same_file_identity(
    file: &File,
    path: &Path,
    _opened: &Metadata,
    _current: &Metadata,
) -> bool {
    // MetadataExt::file_index is unstable; compare the actual handles instead.
    let Ok(clone) = file.try_clone() else {
        return false;
    };
    match (
        same_file::Handle::from_file(clone),
        same_file::Handle::from_path(path),
    ) {
        (Ok(opened), Ok(current)) => opened == current,
        _ => false,
    }
}

#[cfg(not(any(unix, windows)))]
pub(crate) fn same_file_identity(
    _file: &File,
    _path: &Path,
    opened: &Metadata,
    current: &Metadata,
) -> bool {
    opened.is_file()
        && current.is_file()
        && opened.len() == current.len()
        && opened.modified().ok() == current.modified().ok()
}
