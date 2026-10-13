#!/usr/bin/env bash

set -Eeuo pipefail

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

[[ "$(uname -s)" == "Linux" ]] || fail "Run this command on native Ubuntu Linux."

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
platform_dir="${repo_root}/platform"
env_file="${HOME_SERVER_ENV_FILE:-${platform_dir}/.env.production}"
compose_project="internship-api-platform-home"
compose_args=(
  --project-name "${compose_project}"
  --file "${platform_dir}/docker-compose.prod.yml"
  --file "${platform_dir}/docker-compose.home.yml"
  --env-file "${env_file}"
)

[[ -d /run/lock && -w /run/lock ]] || fail "/run/lock must exist and be writable."
[[ -f "${env_file}" && ! -L "${env_file}" ]] || fail "${env_file} must be a regular file, not a symlink."

env_mode="$(stat -c '%a' "${env_file}")"
[[ "${env_mode}" == "600" ]] || fail "Expected mode 0600 on ${env_file}, got ${env_mode}."

command -v docker >/dev/null 2>&1 || fail "Docker is unavailable."
command -v flock >/dev/null 2>&1 || fail "flock is unavailable."
command -v stat >/dev/null 2>&1 || fail "stat is unavailable."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is unavailable."
docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable to the current user."

run_compose() {
  env \
    -u IMAGE_REGISTRY -u IMAGE_TAG -u GATEWAY_BIND_ADDRESS -u GATEWAY_HTTP_PORT \
    -u NODE_ENV -u LOG_LEVEL \
    -u POSTGRES_DB -u POSTGRES_USER -u POSTGRES_PASSWORD -u DATABASE_URL \
    -u JWT_SECRET -u JWT_EXPIRES_IN \
    -u USER_SERVICE_URL -u USER_SERVICE_TIMEOUT_MS -u GRPC_SERVICE_HOST -u GRPC_SERVICE_PORT -u UPSTREAM_TIMEOUT_MS \
    -u SOCKET_IO_CORS_ORIGIN -u CHAT_HISTORY_LIMIT -u CHAT_MESSAGE_MAX_LENGTH \
    -u WEBHOOK_SECRET -u WEBHOOK_BODY_LIMIT_BYTES -u WEBHOOK_IDEMPOTENCY_TTL_SECONDS -u WEBHOOK_IDEMPOTENCY_MAX_ENTRIES \
    -u STUN_URL -u SIGNALING_ALLOWED_ORIGINS -u SIGNALING_MAX_CONNECTIONS -u SIGNALING_MAX_PAYLOAD_BYTES \
    -u SIGNALING_MAX_BUFFERED_BYTES -u SIGNALING_RATE_LIMIT_MESSAGES -u SIGNALING_RATE_LIMIT_WINDOW_MS -u SIGNALING_HEARTBEAT_MS \
    docker compose "${compose_args[@]}" "$@"
}

operation="${1:-}"
shift || true

case "${operation}" in
  config)
    run_compose config --quiet
    ;;
  build)
    exec 9>"/run/lock/${compose_project}.lock"
    flock -n 9 || fail "Another home-server deployment operation is running."
    run_compose config --quiet
    run_compose build --pull "$@"
    ;;
  deploy)
    [[ $# -eq 0 ]] || fail "deploy does not accept service names."
    exec 9>"/run/lock/${compose_project}.lock"
    flock -n 9 || fail "Another home-server deployment operation is running."
    run_compose config --quiet
    run_compose build --pull
    run_compose up -d --no-build --remove-orphans --wait
    ;;
  up)
    [[ $# -eq 0 ]] || fail "up does not accept service names."
    exec 9>"/run/lock/${compose_project}.lock"
    flock -n 9 || fail "Another home-server deployment operation is running."
    run_compose config --quiet
    run_compose up -d --no-build --pull never --remove-orphans --wait
    ;;
  restart)
    [[ $# -eq 0 ]] || fail "restart does not accept service names."
    exec 9>"/run/lock/${compose_project}.lock"
    flock -n 9 || fail "Another home-server deployment operation is running."
    run_compose config --quiet
    run_compose up -d --no-build --pull never --force-recreate --remove-orphans --wait
    ;;
  stop)
    [[ $# -eq 0 ]] || fail "stop does not accept service names."
    exec 9>"/run/lock/${compose_project}.lock"
    flock -n 9 || fail "Another home-server deployment operation is running."
    run_compose stop
    ;;
  status)
    [[ $# -eq 0 ]] || fail "status does not accept service names."
    run_compose ps
    ;;
  verify)
    [[ $# -eq 0 ]] || fail "verify does not accept service names."
    mapfile -t expected_services < <(run_compose config --services)
    [[ ${#expected_services[@]} -gt 0 ]] || fail "The home-server Compose project has no services."

    for service_name in "${expected_services[@]}"; do
      mapfile -t container_ids < <(run_compose ps --all --quiet "${service_name}")
      [[ ${#container_ids[@]} -eq 1 && -n "${container_ids[0]}" ]] \
        || fail "Expected exactly one container for ${service_name}, found ${#container_ids[@]}."

      read -r container_state health_state < <(
        docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${container_ids[0]}"
      )
      [[ "${container_state}" == "running" ]] || fail "${service_name} is ${container_state}, not running."
      [[ "${health_state}" == "none" || "${health_state}" == "healthy" ]] \
        || fail "${service_name} health is ${health_state}."
    done

    printf 'All %s home-server services are running and healthy where healthchecks are defined.\n' "${#expected_services[@]}"
    ;;
  logs)
    run_compose logs --tail 200 "$@"
    ;;
  *)
    fail "Usage: $0 {config|build|deploy|up|restart|stop|status|verify|logs}"
    ;;
esac
