fn main() {
    #[cfg(windows)]
    build_windows();
    #[cfg(not(windows))]
    tauri_build::build();
}

#[cfg(windows)]
fn build_windows() {
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    if let Err(error) = tauri_build::try_build(attributes) {
        println!("{error:#}");
        std::process::exit(1);
    }
    embed_manifest_for_msvc();
}

/// `cargo test` links a harness binary that tauri-build's own per-`[[bin]]`
/// manifest embedding never reaches, so on Windows/MSVC it starts without the
/// Common Controls v6 dependency the webview needs and crashes with
/// `STATUS_ENTRYPOINT_NOT_FOUND` before any test runs. Embedding the same
/// manifest tauri-build would have used, through a link argument that
/// applies to every target instead of a per-binary resource, covers the test
/// binary too.
/// <https://github.com/tauri-apps/tauri/pull/4383#issuecomment-1212221864>
#[cfg(windows)]
fn embed_manifest_for_msvc() {
    let Ok(target_env) = std::env::var("CARGO_CFG_TARGET_ENV") else {
        return;
    };
    if target_env != "msvc" {
        return;
    }
    let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") else {
        return;
    };
    let manifest = std::path::Path::new(&manifest_dir).join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
}
