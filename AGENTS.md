# Repository Agent Instructions

Before changing this repository, read `UBUNTU_HANDOFF.md`, `README.md`, and the relevant files under `platform/docs/`.

## Active Direction

- Continue home-server work on branch `linux-os`.
- Keep `main` as the Windows checkpoint unless the user explicitly requests a merge.
- The deployment target is a physical machine running Ubuntu Desktop 24.04 from its own Linux filesystem.
- Do not introduce a virtual machine. Docker containers are the intended isolation layer.
- The home-server runtime must not depend on AWS, EC2, or `terraform apply`.
- Terraform AWS remains optional learning/reference material. Do not apply it without an explicit user request and a reviewed cost/security plan.
- Remote power-on is deferred. Do not configure Wake-on-LAN or similar features unless the user explicitly resumes that task.

## Safe Operations

- Never commit `.env`, `.env.production`, private keys, credentials, Terraform state, plan files, or Docker volumes.
- Do not copy runtime secrets or database volumes from Windows. Generate fresh Ubuntu runtime data.
- If a PostgreSQL volume exists and its matching environment file is missing, stop and request recovery of the original file. Do not generate replacement database credentials.
- Use `platform/start.sh` for the optional development stack.
- Use `scripts/home-server-compose.sh` for the production home-server stack. Do not bypass its lock and environment isolation with ad hoc Compose mutation commands.
- Preserve the loopback-only production gateway binding. Public access should go through a reviewed TLS tunnel or reverse proxy.

## Required Validation And Review

For changes to application code, configuration, tests, dependencies, deployment scripts, or operational instructions:

1. Inspect the current Git status and preserve unrelated user changes.
2. Run focused validation appropriate to the change.
3. For shell/configuration changes, run Bash syntax checks, ShellCheck, Compose validation, and `git diff --check` where applicable.
4. Obtain an independent review of the final diff. Findings must be grouped as High, Medium, or Low.
5. Fix all confirmed High and Medium findings, then rerun validation. Stop after two unsuccessful fix attempts and report the blocker.
6. State any validation that can only be completed on native Ubuntu.
7. Do not commit or push unless the user requests it.

## First Ubuntu Session

Do not repeat completed Windows-side preparation. Start with the commands and pending checks in `UBUNTU_HANDOFF.md`. The first important evidence is native Ubuntu bootstrap success, followed by an actual reboot test of `internship-api-platform.service`.
