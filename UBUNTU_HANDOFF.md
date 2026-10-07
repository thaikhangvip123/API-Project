# Ubuntu 24.04 Home-Server Handoff

This file is the durable context for continuing the project when the previous Codex chat is unavailable.

## User Goal

Run the project directly on a physical home computer with Ubuntu Desktop 24.04 installed on its own drive. Ubuntu remains usable as a normal desktop while Docker runs the services in the background.

The intended architecture is:

```text
Physical computer
  -> Ubuntu Desktop 24.04
  -> Docker Engine and Docker Compose
  -> production application containers
  -> systemd autostart after boot/reboot
  -> Cloudflare Tunnel for later public HTTPS access
```

There is no virtual machine in this path. AWS/EC2 is not a runtime dependency. Remote power-on is intentionally postponed.

## Git State And Branching

- `main` is the preserved Windows checkpoint at `428a1a7`.
- `linux-os` is the active Ubuntu branch.
- Home-server autostart was added in `6f7e961`.
- The Ubuntu clone/handoff instructions were clarified in `9c525c0`.
- Always confirm the current remote state with `git status --short --branch` and `git log -3 --oneline --decorate` after cloning.

## Completed Preparation

- `scripts/bootstrap-ubuntu-24.04.sh` installs Docker Engine/Compose v2, Node.js 20, Terraform 1.x, ShellCheck, and required utilities from official repositories.
- `scripts/verify-ubuntu-24.04.sh` checks the OS, native Linux filesystem, branch, tool versions, Docker access, executable bits, LF normalization, and ignore rules.
- `platform/docker-compose.home.yml` adds local build contexts and local application image names to the production Compose definition.
- `scripts/home-server-compose.sh` provides `config`, `build`, `deploy`, `up`, `restart`, `stop`, `status`, `verify`, and `logs` operations; all deployment mutations are serialized with a host-wide lock.
- Boot-time `up` uses existing local images with `--no-build --pull never`.
- `scripts/install-home-server-autostart.sh` creates private production configuration, deploys the stack, installs `internship-api-platform.service`, and enables it for boot.
- `scripts/verify-home-server-autostart.sh` checks systemd enablement/activity, all expected containers, container health, local gateway health, and optionally the public HTTPS endpoint.
- Production secrets are generated locally in `platform/.env.production` with mode `0600` and are ignored by Git.
- The production gateway binds only to `127.0.0.1:8080` in preparation for Cloudflare Tunnel.

## First Actions On Ubuntu

Install Git and clone into the native Ubuntu filesystem, not an NTFS/Windows mount:

```bash
sudo apt-get update
sudo apt-get install -y git
cd "$HOME"
git clone --branch linux-os --single-branch https://github.com/thaikhangvip123/API-Project.git
cd "$HOME/API-Project"
git status --short --branch
bash scripts/bootstrap-ubuntu-24.04.sh
```

If the bootstrap adds the user to the `docker` group, log out of the Ubuntu desktop session and log in again. Then run:

```bash
cd "$HOME/API-Project"
bash scripts/verify-ubuntu-24.04.sh
```

The optional development smoke run is:

```bash
cd "$HOME/API-Project/platform"
bash start.sh
bash start.sh --stop
```

Do not leave the development stack running when switching to the production home-server stack.

## Install Production Autostart

Choose the real public hostname before running the installer. Do not use `demo.example.com` if a real domain will be used later, because the installer protects an existing hostname/configuration from accidental replacement.

```bash
cd "$HOME/API-Project"
bash scripts/install-home-server-autostart.sh api.your-domain.example
```

Only after the installer reports that autostart is installed and healthy, reboot explicitly:

```bash
sudo reboot
```

After Ubuntu returns:

```bash
cd "$HOME/API-Project"
bash scripts/verify-home-server-autostart.sh
sudo systemctl status internship-api-platform.service
```

Record the native Ubuntu result in `platform/docs/VERIFICATION.md`. The Windows-side preparation cannot prove systemd or real reboot behavior.

## Data And Secret Rules

- Do not copy `.env`, `.env.production`, `node_modules`, `.terraform`, `*.tfplan`, Terraform state, SSH keys, Docker volumes, or cloud credentials from Windows.
- The development stack and production stack use different Compose projects, environment files, images, and PostgreSQL volumes.
- If `internship-api-platform-home_pgdata` exists but `platform/.env.production` is missing, restore the original environment file. Do not rerun secret generation.
- Back up `platform/.env.production` securely together with the PostgreSQL data. Never store the backup in Git.
- Changing the public hostname later requires a deliberate update of `platform/.env.production`, browser origin settings, and Cloudflare Tunnel/DNS configuration.

## Work Still Pending

1. Run the native Ubuntu bootstrap and readiness verification.
2. Build/deploy the production stack on Ubuntu and confirm every service is healthy.
3. Reboot the physical machine and verify automatic recovery through systemd.
4. Configure Cloudflare Tunnel, DNS, and its systemd service for public HTTPS access.
5. Verify the public endpoint and cross-protocol application behavior from an external device.
6. Define backup and restore procedures for PostgreSQL and `platform/.env.production`.
7. Continue later roadmap work such as CI/CD only after the home-server runtime is proven.

Cloudflare Tunnel is not yet configured. Until it is active, the application can run locally after boot but is not publicly reachable. If the physical computer is powered off or boots into Windows, the Ubuntu home server is unavailable.

## Terraform Decision

Do not use Terraform to create a VM for this home-server path. Bash handles Ubuntu package/bootstrap work, Docker Compose handles containers, and systemd handles boot lifecycle.

Terraform can be used later for a real API-managed resource such as Cloudflare DNS/Tunnel configuration. The existing AWS Terraform remains a learning/reference deployment target and must not be applied as part of home-server setup.

## Validation Already Completed Before Handoff

- Bash syntax checks passed for the Ubuntu and home-server scripts.
- ShellCheck 0.10.0 reported no warning-or-higher findings.
- The merged production plus home-server Compose configuration parsed successfully with sanitized temporary values.
- `git diff --check` passed.
- Production environment and private-key paths remain ignored.
- Independent review found no remaining High, Medium, or Low findings in the autostart implementation.

Native Ubuntu package installation, Docker runtime, systemd execution, physical reboot recovery, and public Cloudflare reachability remain intentionally unverified until the Ubuntu session.
