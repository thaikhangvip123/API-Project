#!/usr/bin/env bash

set -Eeuo pipefail

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

[[ "$(uname -s)" == "Linux" ]] || fail "Run this verification script from native Linux."
[[ $# -ge 2 && $# -le 3 ]] || fail "Usage: $0 <deploy-user> <ec2-host> [project-name]"

deploy_user="$1"
ec2_host="$2"
project_name="${3:-internship-api-platform}"

[[ "${deploy_user}" =~ ^[a-z_][a-z0-9_-]{0,30}$ ]] || fail "Invalid deploy user."
[[ "${ec2_host}" =~ ^[A-Za-z0-9.-]+$ ]] || fail "EC2 host must be an IPv4 address or DNS name."
[[ "${project_name}" =~ ^[a-z][a-z0-9-]{2,31}$ ]] || fail "Invalid project name."

ssh_options=(
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes
)

if [[ -n "${SSH_IDENTITY_FILE:-}" ]]; then
  [[ -f "${SSH_IDENTITY_FILE}" ]] || fail "SSH_IDENTITY_FILE does not point to a regular file."
  ssh_options+=(-i "${SSH_IDENTITY_FILE}")
fi

ssh \
  "${ssh_options[@]}" \
  "${deploy_user}@${ec2_host}" \
  "PROJECT_NAME=${project_name}" 'set -Eeuo pipefail
   test -f /var/lib/cloud/instance/bootstrap-complete
   test "$(id -u)" -ne 0
   id -nG | tr " " "\n" | grep -Fx docker >/dev/null
   docker info >/dev/null
   docker compose version >/dev/null
   test -d "/opt/${PROJECT_NAME}/releases"
   test -d "/opt/${PROJECT_NAME}/shared"
   printf "EC2 bootstrap verification passed on %s as %s.\n" "$(uname -sr)" "$(id -un)"'
