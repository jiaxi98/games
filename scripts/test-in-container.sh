#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKERFILE_PATH="${ROOT_DIR}/infra/docker/Dockerfile.test"

APP_DIR="sandbox-survival"
IMAGE_TAG="games-test-env:local"

usage() {
  cat <<USAGE
Usage: bash scripts/test-in-container.sh [options]

Options:
  --app-dir <path>   Game module directory inside repository (default: sandbox-survival)
  --image <tag>      Docker image tag (default: games-test-env:local)
  -h, --help         Show this help message
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir)
      APP_DIR="$2"
      shift 2
      ;;
    --image)
      IMAGE_TAG="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "${DOCKERFILE_PATH}" ]]; then
  echo "Dockerfile not found: ${DOCKERFILE_PATH}" >&2
  exit 1
fi

echo "[host-test] build ${IMAGE_TAG}"
docker build -f "${DOCKERFILE_PATH}" -t "${IMAGE_TAG}" "${ROOT_DIR}"

container_id="$(docker create -e APP_DIR="${APP_DIR}" "${IMAGE_TAG}")"
cleanup() {
  docker rm -f "${container_id}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

set +e
echo "[host-test] run container for APP_DIR=${APP_DIR}"
docker start -a "${container_id}"
status=$?
set -e

artifact_root="${ROOT_DIR}/artifacts/container/${APP_DIR}"
mkdir -p "${artifact_root}"

copy_artifact_dir() {
  local src_dir="$1"
  local dst_dir="$2"

  rm -rf "${dst_dir}"
  mkdir -p "${dst_dir}"
  docker cp "${container_id}:${src_dir}/." "${dst_dir}" >/dev/null 2>&1 || true
}

copy_artifact_dir "/workspace/${APP_DIR}/coverage" "${artifact_root}/coverage"
copy_artifact_dir "/workspace/${APP_DIR}/playwright-report" "${artifact_root}/playwright-report"
copy_artifact_dir "/workspace/${APP_DIR}/test-results" "${artifact_root}/test-results"
copy_artifact_dir "/workspace/${APP_DIR}/artifacts/screenshots" "${artifact_root}/screenshots"

echo "[host-test] artifacts (if produced): ${artifact_root}"
exit "${status}"
