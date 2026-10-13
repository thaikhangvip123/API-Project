#!/usr/bin/env bash

set -Eeuo pipefail

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

env_tmp=""
unit_tmp=""

cleanup() {
  [[ -z "${env_tmp}" || ! -f "${env_tmp}" ]] || rm -f -- "${env_tmp}"
  [[ -z "${unit_tmp}" || ! -f "${unit_tmp}" ]] || rm -f -- "${unit_tmp}"
}

trap cleanup EXIT

[[ $# -eq 1 ]] || fail "Usage: $0 <public-hostname>"
public_hostname="$1"
[[ "${public_hostname}" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] \
  || fail "Provide a lowercase public hostname such as demo.example.com."

[[ "$(uname -s)" == "Linux" ]] || fail "Run this installer on native Ubuntu 24.04."
[[ -r /etc/os-release ]] || fail "/etc/os-release is unavailable."

# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] || fail "Ubuntu 24.04 LTS is required."
[[ "$(id -u)" -ne 0 ]] || fail "Run as a regular sudo-enabled user, not as root."

for command_name in curl docker env flock git od stat sudo systemctl systemd-analyze; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "Missing required command: ${command_name}"
done

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "Run this installer from the cloned repository."
[[ "$(git -C "${repo_root}" branch --show-current)" == "linux-os" ]] || fail "The linux-os branch must be checked out."
[[ "${repo_root}" != *[[:space:]]* ]] || fail "The repository path must not contain whitespace for the systemd unit."

filesystem_type="$(stat -f -c '%T' "${repo_root}")"
case "${filesystem_type}" in
  9p|drvfs|fuseblk|ntfs*)
    fail "Clone the repository into the native Ubuntu filesystem, not ${filesystem_type}."
    ;;
esac

current_user="$(id -un)"
current_group="$(id -gn)"
[[ "${current_user}" =~ ^[a-z_][a-z0-9_-]*$ ]] || fail "Unsupported username for the systemd unit."
[[ "${current_group}" =~ ^[a-z_][a-z0-9_-]*$ ]] || fail "Unsupported group name for the systemd unit."
id -nG "${current_user}" | tr ' ' '\n' | grep -Fx docker >/dev/null \
  || fail "${current_user} must belong to the docker group. Re-login after running the Ubuntu bootstrap."

docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is unavailable."
docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable to the current user."

platform_dir="${repo_root}/platform"
env_file="${platform_dir}/.env.production"
runner="${repo_root}/scripts/home-server-compose.sh"
compose_project="internship-api-platform-home"
unit_name="internship-api-platform.service"
unit_path="/etc/systemd/system/${unit_name}"

[[ -d /run/lock && -w /run/lock ]] || fail "/run/lock must exist and be writable."
exec 8>"/run/lock/${compose_project}-install.lock"
flock -n 8 || fail "Another home-server installer is running."

if [[ -e "${env_file}" || -L "${env_file}" ]]; then
  [[ -f "${env_file}" && ! -L "${env_file}" ]] || fail "${env_file} must be a regular file, not a symlink."
  chmod 600 "${env_file}"
  configured_hostname="$(sed -n 's/^PUBLIC_HOSTNAME=//p' "${env_file}" | head -n 1)"
  [[ "${configured_hostname}" == "${public_hostname}" ]] \
    || fail "Existing production configuration targets ${configured_hostname:-an unknown hostname}; refusing to replace it."
  printf 'Using existing private production configuration at %s.\n' "${env_file}"
else
  if docker volume inspect "${compose_project}_pgdata" >/dev/null 2>&1; then
    fail "The home-server PostgreSQL volume exists but .env.production is missing. Restore the original file instead of generating new database credentials."
  fi

  umask 077
  postgres_password="$(od -An -N24 -tx1 /dev/urandom | tr -d '[:space:]')"
  jwt_secret="$(od -An -N32 -tx1 /dev/urandom | tr -d '[:space:]')"
  webhook_secret="$(od -An -N32 -tx1 /dev/urandom | tr -d '[:space:]')"

  [[ ${#postgres_password} -eq 48 ]] || fail "Could not generate the PostgreSQL password."
  [[ ${#jwt_secret} -eq 64 ]] || fail "Could not generate the JWT secret."
  [[ ${#webhook_secret} -eq 64 ]] || fail "Could not generate the webhook secret."

  env_tmp="$(mktemp "${platform_dir}/.env.production.tmp.XXXXXX")"
  chmod 600 "${env_tmp}"
  {
    printf 'PUBLIC_HOSTNAME=%s\n' "${public_hostname}"
    printf 'GATEWAY_BIND_ADDRESS=127.0.0.1\n'
    printf 'GATEWAY_HTTP_PORT=8080\n'
    printf 'LOG_LEVEL=info\n'
    printf 'POSTGRES_DB=platform_demo\n'
    printf 'POSTGRES_USER=platform_user\n'
    printf 'POSTGRES_PASSWORD=%s\n' "${postgres_password}"
    printf 'DATABASE_URL=postgresql://platform_user:%s@postgres:5432/platform_demo\n' "${postgres_password}"
    printf 'JWT_SECRET=%s\n' "${jwt_secret}"
    printf 'JWT_EXPIRES_IN=1h\n'
    printf 'WEBHOOK_SECRET=%s\n' "${webhook_secret}"
    printf 'SOCKET_IO_CORS_ORIGIN=https://%s\n' "${public_hostname}"
    printf 'SIGNALING_ALLOWED_ORIGINS=https://%s\n' "${public_hostname}"
  } > "${env_tmp}"
  mv -- "${env_tmp}" "${env_file}"
  env_tmp=""
  unset postgres_password jwt_secret webhook_secret
  printf 'Created private production configuration at %s.\n' "${env_file}"
fi

gateway_bind_address="$(sed -n 's/^GATEWAY_BIND_ADDRESS=//p' "${env_file}" | head -n 1)"
gateway_http_port="$(sed -n 's/^GATEWAY_HTTP_PORT=//p' "${env_file}" | head -n 1)"
[[ "${gateway_bind_address}" == "127.0.0.1" ]] || fail "The production gateway must remain bound to 127.0.0.1."
[[ "${gateway_http_port}" =~ ^[0-9]+$ && "${gateway_http_port}" -ge 1 && "${gateway_http_port}" -le 65535 ]] \
  || fail "GATEWAY_HTTP_PORT must be a valid TCP port."

env -u HOME_SERVER_ENV_FILE "${runner}" deploy

unit_tmp="$(mktemp --suffix=.service)"
{
  printf '[Unit]\n'
  printf 'Description=Internship API Platform home server\n'
  printf 'Wants=network-online.target\n'
  printf 'After=network-online.target docker.service\n'
  printf 'Before=cloudflared.service\n'
  printf 'Requires=docker.service\n'
  printf 'PartOf=docker.service\n\n'
  printf '[Service]\n'
  printf 'Type=oneshot\n'
  printf 'RemainAfterExit=yes\n'
  printf 'User=%s\n' "${current_user}"
  printf 'Group=%s\n' "${current_group}"
  printf 'SupplementaryGroups=docker\n'
  printf 'WorkingDirectory=%s\n' "${platform_dir}"
  printf 'ExecStart=%s up\n' "${runner}"
  printf 'ExecStop=%s stop\n' "${runner}"
  printf 'ExecReload=%s up\n' "${runner}"
  printf 'TimeoutStartSec=600\n'
  printf 'TimeoutStopSec=180\n'
  printf 'UMask=0077\n\n'
  printf '[Install]\n'
  printf 'WantedBy=multi-user.target\n'
} > "${unit_tmp}"

systemd-analyze verify "${unit_tmp}"
sudo install -m 0644 "${unit_tmp}" "${unit_path}"
sudo systemctl daemon-reload
sudo systemctl enable --now "${unit_name}"
sudo systemctl is-enabled --quiet "${unit_name}" || fail "The home-server unit is not enabled."
sudo systemctl is-active --quiet "${unit_name}" || fail "The home-server unit is not active."

env -u HOME_SERVER_ENV_FILE "${runner}" verify
curl --fail --silent --show-error "http://127.0.0.1:${gateway_http_port}/health" >/dev/null \
  || fail "The gateway health endpoint is unavailable after startup."

printf '\nHome-server autostart is installed and healthy.\n'
printf 'Systemd unit: %s\n' "${unit_name}"
printf 'Local gateway: http://127.0.0.1:%s\n' "${gateway_http_port}"

if systemctl list-unit-files --type=service cloudflared.service --no-legend 2>/dev/null | grep -q '^cloudflared.service'; then
  printf 'cloudflared is installed; ensure its tunnel service is enabled and healthy before testing the public hostname.\n'
else
  printf 'Cloudflare Tunnel is not installed yet. The application will auto-start, but public Internet access remains pending.\n'
fi
