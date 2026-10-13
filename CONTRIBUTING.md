# Contributing and Security

## Security reports

Do not disclose vulnerabilities, credentials, private keys, tokens, or production details in a public issue. Report security concerns privately through GitHub's private vulnerability reporting feature when it is available, or contact the repository maintainer through a private channel. Revoke and replace any credential that may have been exposed.

## Runtime safety

- Use `platform/start.sh` for the optional development stack.
- Use `scripts/home-server-compose.sh` for the production home-server stack so locking and environment isolation remain intact.
- Never commit environment files, credentials, private keys, Terraform state or plan files, or Docker volumes.
- If a PostgreSQL volume exists but its matching environment file is missing, stop and recover the original environment file. Do not generate replacement database credentials for that volume.
- Keep the production gateway bound to loopback; public traffic must enter through a reviewed TLS tunnel or reverse proxy.

Run the focused tests and configuration checks relevant to a change before submitting it.
