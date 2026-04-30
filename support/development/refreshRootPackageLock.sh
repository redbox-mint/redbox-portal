#! /bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

function show_step(){
    echo "-------------------------------------------"
    echo "Running step: ${1}"
    echo "-------------------------------------------"
}

if [[ "$#" -gt 0 ]]; then
    LOCK_DIRS=("$@")
else
    LOCK_DIRS=(".")
fi

for lock_dir in "${LOCK_DIRS[@]}"; do
    package_dir="${ROOT_DIR}/${lock_dir}"

    if [[ ! -f "${package_dir}/package.json" ]]; then
        echo "Missing package.json in ${lock_dir}" >&2
        exit 1
    fi

    if [[ ! -f "${package_dir}/package-lock.json" ]]; then
        echo "Missing package-lock.json in ${lock_dir}" >&2
        exit 1
    fi

    show_step "Refresh package lock in ${lock_dir}"
    (
        cd "${package_dir}"
        npm install --package-lock-only --ignore-scripts --strict-peer-deps --no-audit --fund=false
    )
done

show_step 'Finished.'
