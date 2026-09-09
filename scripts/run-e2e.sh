#!/usr/bin/env bash
#
# Run each E2E spec file as its own `wdio run` process.
#
# `wdio run ./wdio.conf.ts` with no `--spec` filter sequences every spec file
# inside one Node process (`maxInstances: 1` keeps app launches sequential, not
# the process itself). Only the first app launch in that process reliably
# finishes setting up Tauri's `core.invoke` bridge; every launch after it
# sometimes never does, and `specFileRetries` does not help — a retry is a
# fresh app process, not a fresh Node process, so it inherits whatever leaves
# the bridge broken. A separate `wdio run` per file gives every spec file the
# "first launch" the bridge actually needs. See TASKS.md R-3.1.
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

status=0
for spec in e2e/*.spec.ts; do
    echo "==> ${spec}"
    if ! npx wdio run ./wdio.conf.ts --spec "${spec}"; then
        status=1
    fi
done

exit "${status}"
