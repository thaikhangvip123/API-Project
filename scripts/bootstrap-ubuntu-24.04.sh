#!/usr/bin/env bash

set -Eeuo pipefail

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

tmp_dir=""

cleanup() {
  if [[ -n "${tmp_dir}" && -d "${tmp_dir}" ]]; then
    rm -rf -- "${tmp_dir}"
  fi
}

trap cleanup EXIT

[[ "$(uname -s)" == "Linux" ]] || fail "Run this script on native Ubuntu 24.04."
[[ -r /etc/os-release ]] || fail "/etc/os-release is unavailable."

# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] || fail "Ubuntu 24.04 LTS is required; detected ${PRETTY_NAME:-unknown OS}."
[[ "$(id -u)" -ne 0 ]] || fail "Run as a regular sudo-enabled user, not as root."

command -v sudo >/dev/null 2>&1 || fail "sudo is required."
command -v git >/dev/null 2>&1 || fail "Git is required before running this bootstrap."

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "Run this script from the cloned repository."
current_branch="$(git -C "${repo_root}" branch --show-current)"
[[ "${current_branch}" == "linux-os" ]] || fail "Checkout the linux-os branch before bootstrapping Ubuntu."
current_user="$(id -un)"

filesystem_type="$(stat -f -c '%T' "${repo_root}")"
case "${filesystem_type}" in
  9p|drvfs|fuseblk|ntfs*)
    fail "The repository is on a Windows-mounted filesystem (${filesystem_type}); clone it into the Ubuntu filesystem."
    ;;
esac

sudo -v
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  ca-certificates curl git gnupg jq openssl shellcheck unzip util-linux

tmp_dir="$(mktemp -d)"
architecture="$(dpkg --print-architecture)"

curl --fail --silent --show-error --location \
  https://download.docker.com/linux/ubuntu/gpg \
  --output "${tmp_dir}/docker.asc"
sudo install -d -m 0755 /etc/apt/keyrings
sudo install -m 0644 "${tmp_dir}/docker.asc" /etc/apt/keyrings/docker.asc
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable\n' "${architecture}" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

curl --fail --silent --show-error --location \
  https://apt.releases.hashicorp.com/gpg \
  --output "${tmp_dir}/hashicorp.asc"
gpg --dearmor --yes --output "${tmp_dir}/hashicorp.gpg" "${tmp_dir}/hashicorp.asc"
sudo install -m 0644 "${tmp_dir}/hashicorp.gpg" /etc/apt/keyrings/hashicorp.gpg
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/hashicorp.gpg] https://apt.releases.hashicorp.com noble main\n' "${architecture}" \
  | sudo tee /etc/apt/sources.list.d/hashicorp.list >/dev/null

curl --fail --silent --show-error --location \
  https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  --output "${tmp_dir}/nodesource.asc"
gpg --dearmor --yes --output "${tmp_dir}/nodesource.gpg" "${tmp_dir}/nodesource.asc"
sudo install -m 0644 "${tmp_dir}/nodesource.gpg" /etc/apt/keyrings/nodesource.gpg
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main\n' "${architecture}" \
  | sudo tee /etc/apt/sources.list.d/nodesource.list >/dev/null

sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  containerd.io docker-buildx-plugin docker-ce docker-ce-cli docker-compose-plugin nodejs terraform

sudo systemctl enable --now docker

if ! id -nG "${current_user}" | tr ' ' '\n' | grep -Fx docker >/dev/null; then
  sudo usermod --append --groups docker "${current_user}"
  printf '\nDocker group membership was added for %s. Log out and log in again before verification.\n' "${current_user}"
else
  printf '\n%s already belongs to the docker group.\n' "${current_user}"
fi

printf 'Bootstrap packages installed for Ubuntu 24.04.\n'
printf 'Next: reopen the session, return to %s, and run bash scripts/verify-ubuntu-24.04.sh\n' "${repo_root}"
