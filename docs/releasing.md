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

## Update the README

The README presents the product and only its latest release; the history lives in
`CHANGELOG.md`. Do this before the `chore: release` commit. `src/docs/readme.test.ts`
fails the build when the version, the images or the language drift.

1. **Replace, do not accumulate.** Rewrite the `## Latest: X.Y — …` section for the new
   version: a title, at most five lines and one demo GIF. There is always exactly one.
2. **Promote the previous release.** Turn what the old Latest section described into a
   bullet of **Features**, in present tense and without a version number.
3. **Keep the hero GIF** (graph, then a file diff). Re-record it only when that experience
   changes.
4. **Record the new GIF in English** from the real app with the demo harness (about
   800 px wide and under 1 MB), then delete the previous version's GIF. `docs/assets/`
   holds only what the README shows.
5. **Review Known limitations.** Add what affects users, remove what no longer applies.
6. **Write everything in English**, and keep version numbers out of the README except in
   Latest and Install.

The roadmap is updated in the same step, following
[`protocolo-roadmap.md`](protocolo-roadmap.md#al-publicar-una-versión).

The full pre-release checklist (manifests, CHANGELOG, README, roadmap, tasks, archives, ADR
and verification) is in [`protocolo-trabajo.md`](protocolo-trabajo.md#3-cierre-de-versión-una-sola-lista).

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
