#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-sandbox-survival}"
PROJECT_ROOT="/workspace/${APP_DIR}"

if [[ ! -d "${PROJECT_ROOT}" ]]; then
  echo "[container-test] app directory not found: ${PROJECT_ROOT}" >&2
  echo "[container-test] set APP_DIR to the game module path (for example APP_DIR=bird-physics)." >&2
  exit 1
fi

cd "${PROJECT_ROOT}"

if [[ ! -f package.json ]]; then
  echo "[container-test] package.json missing in ${PROJECT_ROOT}" >&2
  exit 1
fi

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

has_script() {
  local script_name="$1"
  node -e "const pkg=require('./package.json'); const scripts=(pkg && pkg.scripts) || {}; process.exit(Object.prototype.hasOwnProperty.call(scripts, process.argv[1]) ? 0 : 1);" "${script_name}"
}

run_script_if_present() {
  local script_name="$1"
  if has_script "${script_name}"; then
    echo "[container-test] npm run ${script_name}"
    npm run "${script_name}"
  else
    echo "[container-test] skip ${script_name} (not defined)"
  fi
}

run_script_if_present typecheck
run_script_if_present test:unit
run_script_if_present test:integration

if has_script test:e2e; then
  echo "[container-test] xvfb-run -a npm run test:e2e"
  xvfb-run -a npm run test:e2e
else
  echo "[container-test] skip test:e2e (not defined)"
fi
