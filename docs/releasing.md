# Releasing GitCanvas

## Publish a release

1. Prepare and merge the release PR into `main`, including the matching version
   in the application manifests and a `CHANGELOG.md` section.
2. Create and push an annotated `vX.Y.Z` tag on the merged `main` commit.
3. The `release.yml` workflow validates the tag, creates a draft, builds the
   platform installers, and publishes the draft only after every build passes.

The updater uses Tauri's own artifact-signing key. This is a free key pair and
does not require an Apple Developer account or a Windows code-signing
certificate. Keep the private key out of the repository and configure it as the
GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`. If the private key has a
password, configure `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as well. The matching
public key belongs in `src-tauri/tauri.conf.json` and must stay stable for
installed clients to accept future updates.

## Retry a release

Do not delete or move a published tag to retry a failed build. After the
workflow change is merged into `main`, run **Actions → release → Run workflow**
from the `main` branch and enter the existing tag, such as `v0.5.0`. The
workflow checks that the tag is already reachable from `main`, reuses its
draft, and rebuilds the release assets. The Tauri action updates assets on
reruns.

The release stays in draft until all platform builds and the macOS bundle seal
check pass. A failed build requires fixing the reported cause and retrying the
same tag; it does not require changing the application version.
