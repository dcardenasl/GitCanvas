//! Process-wide resource limits required by a long-lived desktop Git client.

/// Raises the soft open-file limit up to the hard limit when the platform
/// permits it. macOS applications launched from Finder commonly inherit a
/// soft limit of 256 even though the hard limit is unlimited; that is too low
/// for libgit2 plus a native filesystem watcher.
#[cfg(unix)]
pub(crate) fn raise_file_descriptor_limit() -> Result<(), String> {
    let (soft, hard) = rlimit::getrlimit(rlimit::Resource::NOFILE)
        .map_err(|error| format!("could not read RLIMIT_NOFILE: {error}"))?;
    if soft >= hard {
        return Ok(());
    }
    rlimit::setrlimit(rlimit::Resource::NOFILE, hard, hard)
        .map_err(|error| format!("could not raise RLIMIT_NOFILE from {soft} to {hard}: {error}"))
}

/// Windows has no `RLIMIT_NOFILE`; handle limits are not raised per process.
#[cfg(not(unix))]
#[allow(clippy::unnecessary_wraps)]
pub(crate) fn raise_file_descriptor_limit() -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_limit_helper_is_callable() {
        super::raise_file_descriptor_limit().unwrap();
    }
}
