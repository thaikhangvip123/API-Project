#!/usr/bin/env bash

set -Eeuo pipefail

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

env_tmp=""

cleanup() {
  if [[ -n "${env_tmp}" && -f "${env_tmp}" ]]; then
    rm -f -- "${env_tmp}"
  fi
}

trap cleanup EXIT

require_native_linux() {
  [[ "$(uname -s)" == "Linux" ]] || fail "This startup script supports native Linux only. Use Ubuntu 24.04 for the deployment-compatible workflow."
}

require_linux_filesystem() {
  local filesystem_type

  filesystem_type="$(stat -f -c '%T' "${platform_dir}")"
  case "${filesystem_type}" in
    9p|drvfs|fuseblk|ntfs*)
      fail "The project is on a Windows-mounted filesystem (${filesystem_type}). Move it to a native Linux filesystem before creating secrets."
      ;;
  esac
}

harden_env_permissions() {
  local target="$1"
  local mode

  chmod 600 "${target}" || fail "Could not restrict permissions on ${target}."
  mode="$(stat -c '%a' "${target}")"
  [[ "${mode}" == "600" ]] || fail "Expected mode 0600 on ${target}, got ${mode}."
}

run_compose() {
  env \
    -u NODE_ENV -u LOG_LEVEL \
    -u POSTGRES_DB -u POSTGRES_USER -u POSTGRES_PASSWORD -u DATABASE_URL \
    -u JWT_SECRET -u JWT_EXPIRES_IN \
    -u USER_SERVICE_URL -u USER_SERVICE_TIMEOUT_MS -u GRPC_SERVICE_HOST -u GRPC_SERVICE_PORT -u UPSTREAM_TIMEOUT_MS \
    -u SOCKET_IO_CORS_ORIGIN -u CHAT_HISTORY_LIMIT -u CHAT_MESSAGE_MAX_LENGTH \
    -u WEBHOOK_SECRET -u WEBHOOK_BODY_LIMIT_BYTES -u WEBHOOK_IDEMPOTENCY_TTL_SECONDS -u WEBHOOK_IDEMPOTENCY_MAX_ENTRIES \
    -u STUN_URL -u SIGNALING_ALLOWED_ORIGINS -u SIGNALING_MAX_CONNECTIONS -u SIGNALING_MAX_PAYLOAD_BYTES \
    -u SIGNALING_MAX_BUFFERED_BYTES -u SIGNALING_RATE_LIMIT_MESSAGES -u SIGNALING_RATE_LIMIT_WINDOW_MS -u SIGNALING_HEARTBEAT_MS \
    docker compose --project-name "${compose_project}" --file "${compose_file}" --env-file "${env_file}" "$@"
}

require_native_linux
command -v stat >/dev/null 2>&1 || fail "The 'stat' utility is required."
command -v flock >/dev/null 2>&1 || fail "The 'flock' utility is required."
platform_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
env_file="${platform_dir}/.env"
compose_file="${platform_dir}/docker-compose.yml"
compose_project="internship-api-platform"
require_linux_filesystem

[[ -d /run/lock && -w /run/lock ]] || fail "/run/lock must exist and be writable for the host-wide startup lock."
exec 9>"/run/lock/internship-api-platform-start.lock"
flock -n 9 || fail "Another start.sh process is already configuring this platform."

operation="up"
case "${1:-}" in
  --stop)
    operation="stop"
    shift
    [[ $# -eq 0 ]] || fail "--stop does not accept service names."
    ;;
  --restart)
    operation="restart"
    shift
    ;;
  --rebuild)
    operation="rebuild"
    shift
    ;;
esac

command -v docker >/dev/null 2>&1 || fail "Docker is not installed or not available in PATH."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is not available."
docker info >/dev/null 2>&1 || fail "Docker daemon is not running."

cd "${platform_dir}"

if [[ -e "${env_file}" || -L "${env_file}" ]]; then
  [[ -f "${env_file}" && ! -L "${env_file}" ]] || fail "${env_file} must be a regular file, not a directory or symbolic link."
fi

if [[ ! -f "${env_file}" ]]; then
  command -v od >/dev/null 2>&1 || fail "The 'od' utility is required to generate local secrets."

  if docker volume inspect "${compose_project}_pgdata" >/dev/null 2>&1; then
    fail "The PostgreSQL volume exists but .env is missing. Restore the original .env to preserve database access, or explicitly remove the volume before generating new credentials."
  fi

  umask 077
  postgres_password="$(od -An -N24 -tx1 /dev/urandom | tr -d '[:space:]')"
  jwt_secret="$(od -An -N32 -tx1 /dev/urandom | tr -d '[:space:]')"
  webhook_secret="$(od -An -N32 -tx1 /dev/urandom | tr -d '[:space:]')"

  [[ ${#postgres_password} -eq 48 ]] || fail "Could not generate the database password."
  [[ ${#jwt_secret} -eq 64 ]] || fail "Could not generate the JWT secret."
  [[ ${#webhook_secret} -eq 64 ]] || fail "Could not generate the webhook secret."

  env_tmp="$(mktemp "${platform_dir}/.env.tmp.XXXXXX")"
  harden_env_permissions "${env_tmp}"

  {
    printf 'NODE_ENV=development\n'
    printf 'LOG_LEVEL=info\n'
    printf 'POSTGRES_DB=platform_demo\n'
    printf 'POSTGRES_USER=platform_user\n'
    printf 'POSTGRES_PASSWORD=%s\n' "${postgres_password}"
    printf 'DATABASE_URL=postgresql://platform_user:%s@postgres:5432/platform_demo\n' "${postgres_password}"
    printf 'JWT_SECRET=%s\n' "${jwt_secret}"
    printf 'JWT_EXPIRES_IN=1h\n'
    printf 'WEBHOOK_SECRET=%s\n' "${webhook_secret}"
  } > "${env_tmp}"

  mv -- "${env_tmp}" "${env_file}"
  env_tmp=""
  harden_env_permissions "${env_file}"
  unset postgres_password jwt_secret webhook_secret
  printf 'Created private local configuration at %s.\n' "${env_file}"
else
  harden_env_permissions "${env_file}"
  printf 'Using existing private local configuration at %s.\n' "${env_file}"
fi

run_compose config --quiet

case "${operation}" in
  stop)
    run_compose down
    printf '\nPlatform stopped; PostgreSQL data was preserved.\n'
    exit 0
    ;;
  restart)
    run_compose restart "$@"
    run_compose up -d --wait "$@"
    ;;
  rebuild)
    run_compose build --no-cache "$@"
    run_compose up -d --force-recreate --wait "$@"
    ;;
  up)
    run_compose up -d --build --wait "$@"
    ;;
esac

if [[ $# -eq 0 ]]; then
  printf '\nPlatform is ready.\n'
  printf 'Health:  http://localhost/health\n'
  printf 'Chat:    http://localhost/ws/\n'
  printf 'WebRTC:  http://localhost/webrtc/\n'
else
  printf '\nRequested service group is ready after %s: %s\n' "${operation}" "$*"
fi
