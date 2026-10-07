#!/usr/bin/env bash

set -Eeuo pipefail

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

version_at_least() {
  local actual="$1"
  local minimum="$2"
  [[ "$(printf '%s\n%s\n' "${minimum}" "${actual}" | sort -V | head -n 1)" == "${minimum}" ]]
}

[[ "$(uname -s)" == "Linux" ]] || fail "Run this verification on native Ubuntu 24.04."
[[ -r /etc/os-release ]] || fail "/etc/os-release is unavailable."

# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] || fail "Ubuntu 24.04 LTS is required; detected ${PRETTY_NAME:-unknown OS}."

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "Run this script from the cloned repository."
[[ "$(git -C "${repo_root}" branch --show-current)" == "linux-os" ]] || fail "The linux-os branch must be checked out."

filesystem_type="$(stat -f -c '%T' "${repo_root}")"
case "${filesystem_type}" in
  9p|drvfs|fuseblk|ntfs*)
    fail "The repository is on a Windows-mounted filesystem (${filesystem_type})."
    ;;
esac

for command_name in git docker node npm terraform aws stat flock od openssl curl; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "Missing required command: ${command_name}"
done

docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is unavailable."
docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable to the current user. Re-login after joining the docker group."

node_version="$(node --version | sed 's/^v//')"
node_major="${node_version%%.*}"
[[ "${node_major}" == "20" ]] || fail "Node.js 20.x is required; detected ${node_version}."
version_at_least "${node_version}" "20.11.0" || fail "Node.js 20.11.0 or newer is required; detected ${node_version}."

terraform_version="$(terraform version -json | jq -r '.terraform_version')"
terraform_major="${terraform_version%%.*}"
[[ "${terraform_major}" == "1" ]] || fail "Terraform 1.x is required; detected ${terraform_version}."
version_at_least "${terraform_version}" "1.7.0" || fail "Terraform 1.7.0 or newer is required; detected ${terraform_version}."

for script_path in platform/start.sh scripts/bootstrap-ubuntu-24.04.sh scripts/verify-ubuntu-24.04.sh infrastructure/scripts/verify-ec2.sh; do
  tracked_mode="$(git -C "${repo_root}" ls-files --stage -- "${script_path}" | awk '{print $1}')"
  [[ "${tracked_mode}" == "100755" ]] || fail "Git executable mode is missing for ${script_path}."
  [[ "$(git -C "${repo_root}" check-attr eol -- "${script_path}" | awk '{print $3}')" == "lf" ]] || fail "Git LF normalization is missing for ${script_path}."
done

git -C "${repo_root}" check-ignore --quiet platform/.env || fail "platform/.env must remain ignored."
git -C "${repo_root}" check-ignore --quiet infrastructure/terraform/step12-ubuntu24.tfplan || fail "Terraform plan files must remain ignored."

printf 'Ubuntu 24.04 readiness verification passed.\n'
printf 'Node.js: %s\n' "${node_version}"
printf 'Terraform: %s\n' "${terraform_version}"
docker compose version
