# Verification

This document contains only public-safe verification results. Hostnames, usernames, local paths, credentials, provider errors, agent metadata, and raw infrastructure output are intentionally excluded.

## Step 11 Pre-Infrastructure Gate

- Application tests: 68/68 passed across all eight services after the dependency security update.
- Dependency audit: all seven Node.js services report zero known vulnerabilities; the SOAP image reports a consistent Python dependency set.
- Build and restart: all eight application images rebuilt successfully, followed by a full-stack restart and health wait.
- Cross-protocol gateway smoke tests: 9/9 passed after both initial startup and restart.
- Runtime health: all ten containers reached healthy state with zero unexpected restarts during the completed local run.
- Protocol coverage: REST/JWT, PostgreSQL CRUD, GraphQL over REST and gRPC, Socket.IO, signed webhook handling, SOAP, and WebRTC signaling.
- Container security: application images run as non-root users; only the gateway publishes a host port.
- Configuration security: runtime environment files are ignored, generated with random secrets, restricted to mode `0600` on Linux, and injected through per-service allowlists.
- Production configuration: required credentials and browser origins fail during Compose validation when missing; a complete sanitized configuration validates successfully.
- Production exposure: the gateway binds to loopback by default and requires a trusted TLS terminator before public access.
- Repository scan: Gitleaks 8.24.3 scanned the complete public history and found no leaks; no runtime `.env`, private key, cloud credential file, or common credential signature is tracked.

## Reproduction

On native Ubuntu/Linux, from the `platform` directory:

```bash
bash start.sh
```

Then run the automated tests for each service and the cross-protocol smoke test documented in `OPERATIONS.md`.

Reproduce the remaining gate checks from the `platform` directory:

```bash
bash start.sh --restart
docker compose ps
docker compose logs --tail 100

for service in auth-service user-service graphql-service grpc-service websocket-service webhook-service webrtc-signaling; do
  (cd "services/${service}" && npm audit --omit=dev --audit-level=high)
done

docker run --rm internship/soap-service:0.1.0 pip check
docker compose -f docker-compose.prod.yml --env-file "${PRIVATE_PROD_ENV:?set PRIVATE_PROD_ENV to a private env-file path}" config --quiet
docker run --rm -v "$(cd .. && pwd):/repo:ro" zricethezav/gitleaks:v8.24.3 git /repo --no-banner --redact --exit-code 1

# After staging only the intended public files, scan the exact pre-commit diff too.
git diff --cached --binary | docker run --rm -i zricethezav/gitleaks:v8.24.3 stdin --no-banner --redact --exit-code 1
```

The private production environment file must remain outside Git and must provide the required exact HTTPS origins and credentials. Never print the rendered production configuration because it contains resolved secrets.

Verify fail-fast behavior in an environment that cannot inherit production values from the current shell:

```bash
empty_env="$(mktemp)"
if env \
  -u POSTGRES_DB -u POSTGRES_USER -u POSTGRES_PASSWORD -u DATABASE_URL \
  -u JWT_SECRET -u WEBHOOK_SECRET \
  -u SOCKET_IO_CORS_ORIGIN -u SIGNALING_ALLOWED_ORIGINS \
  docker compose -f docker-compose.prod.yml --env-file "${empty_env}" config --quiet >/dev/null 2>&1; then
  rm -f -- "${empty_env}"
  echo 'ERROR: production Compose accepted missing required configuration' >&2
  exit 1
fi
rm -f -- "${empty_env}"
```

## Scope

These results complete the local and repository-security portions of roadmap step 11. The GitHub CI check in the full post-update workflow becomes applicable after CI is implemented in step 13. Terraform, CD, EC2 deployment, TLS termination, cloud backup, and production rollback verification belong to later roadmap steps and are not claimed complete here.
