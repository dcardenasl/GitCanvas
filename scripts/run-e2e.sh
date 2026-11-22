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
run_authors_release_spec() {
    local spec="$1"
    local output_file
    output_file="$(mktemp "${TMPDIR:-/tmp}/gitcanvas-e2e-release-server.XXXXXX")"
    node scripts/e2e-release-server.mjs >"${output_file}" &
    local server_pid=$!
    local api_base_url=""
    local attempt
    for attempt in $(seq 1 100); do
        if [[ -s "${output_file}" ]]; then
            IFS= read -r api_base_url <"${output_file}" || true
            break
        fi
        if ! kill -0 "${server_pid}" 2>/dev/null; then
            break
        fi
        sleep 0.1
    done

    local result=0
    if [[ "${api_base_url}" != http://127.0.0.1:* ]]; then
        echo "E2E release server did not provide a valid loopback origin" >&2
        result=1
    elif GITCANVAS_E2E_API_BASE_URL="${api_base_url}" \
        GITCANVAS_E2E_FIXTURE_KIND=authors-releases \
        npx wdio run ./wdio.conf.ts --spec "${spec}"; then
        result=0
    else
        result=$?
    fi

    kill "${server_pid}" 2>/dev/null || true
    wait "${server_pid}" 2>/dev/null || true
    rm -f "${output_file}"
    return "${result}"
}

for spec in e2e/*.spec.ts; do
    echo "==> ${spec}"
    if [[ "${spec}" == "e2e/local-changes.spec.ts" ]]; then
        if ! GITCANVAS_E2E_FIXTURE_KIND=local-changes npx wdio run ./wdio.conf.ts --spec "${spec}"; then
            status=1
        fi
    elif [[ "${spec}" == "e2e/graph-performance.spec.ts" ]]; then
        if ! GITCANVAS_E2E_FIXTURE_KIND=graph-performance npx wdio run ./wdio.conf.ts --spec "${spec}"; then
            status=1
        fi
    elif [[ "${spec}" == "e2e/file-history.spec.ts" ]]; then
        if ! GITCANVAS_E2E_FIXTURE_KIND=file-history npx wdio run ./wdio.conf.ts --spec "${spec}"; then
            status=1
        fi
    elif [[ "${spec}" == "e2e/images.spec.ts" ]]; then
        if ! GITCANVAS_E2E_FIXTURE_KIND=images npx wdio run ./wdio.conf.ts --spec "${spec}"; then
            failed=1
        fi
    elif [[ "${spec}" == "e2e/stash.spec.ts" ]]; then
        if ! GITCANVAS_E2E_FIXTURE_KIND=stash npx wdio run ./wdio.conf.ts --spec "${spec}"; then
            status=1
        fi
    elif [[ "${spec}" == "e2e/workspace.spec.ts" ]]; then
        if ! GITCANVAS_E2E_FIXTURE_KIND=workspace npx wdio run ./wdio.conf.ts --spec "${spec}"; then
            status=1
        fi
    elif [[ "${spec}" == "e2e/authors-releases.spec.ts" ]]; then
        if ! run_authors_release_spec "${spec}"; then
            status=1
        fi
    elif ! npx wdio run ./wdio.conf.ts --spec "${spec}"; then
        status=1
    fi
done

exit "${status}"
