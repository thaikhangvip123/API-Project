#!/usr/bin/env bash

set -Eeuo pipefail

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

[[ $# -le 1 ]] || fail "Usage: $0 [https://public-hostname]"
public_url="${1:-}"

[[ "$(uname -s)" == "Linux" ]] || fail "Run this verification on the Ubuntu home server."

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${repo_root}/platform/.env.production"
unit_name="internship-api-platform.service"

for command_name in curl docker env stat systemctl; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "Missing required command: ${command_name}"
done

[[ -f "${env_file}" && ! -L "${env_file}" ]] || fail "${env_file} must be a regular file, not a symlink."
[[ "$(stat -c '%a' "${env_file}")" == "600" ]] || fail "${env_file} must have mode 0600."

systemctl is-enabled --quiet "${unit_name}" || fail "${unit_name} is not enabled for boot."
systemctl is-active --quiet "${unit_name}" || fail "${unit_name} is not active."

gateway_http_port="$(sed -n 's/^GATEWAY_HTTP_PORT=//p' "${env_file}" | head -n 1)"
[[ "${gateway_http_port}" =~ ^[0-9]+$ && "${gateway_http_port}" -ge 1 && "${gateway_http_port}" -le 65535 ]] \
  || fail "GATEWAY_HTTP_PORT must be a valid TCP port."

env -u HOME_SERVER_ENV_FILE "${repo_root}/scripts/home-server-compose.sh" verify
curl --fail --silent --show-error "http://127.0.0.1:${gateway_http_port}/health" >/dev/null \
  || fail "The local gateway health endpoint is unavailable."

if [[ -n "${public_url}" ]]; then
  [[ "${public_url}" =~ ^https://[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] \
    || fail "The public URL must look like https://demo.example.com with no path."
  systemctl is-enabled --quiet cloudflared.service || fail "cloudflared.service is not enabled for boot."
  systemctl is-active --quiet cloudflared.service || fail "cloudflared.service is not active."
  curl --fail --silent --show-error "${public_url}/health" >/dev/null \
    || fail "The public gateway health endpoint is unavailable."
fi

printf 'Home-server boot verification passed.\n'
