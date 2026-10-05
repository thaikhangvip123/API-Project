# Verification

This document contains only public-safe verification results. Hostnames, usernames, local paths, credentials, provider errors, agent metadata, and raw infrastructure output are intentionally excluded.

## Current Local Baseline

- Application tests: 68/68 passed across all eight services.
- Cross-protocol gateway smoke tests: 9/9 passed.
- Runtime health: all ten containers reached healthy state with zero restarts during the latest complete local run.
- Protocol coverage: REST/JWT, PostgreSQL CRUD, GraphQL over REST and gRPC, Socket.IO, signed webhook handling, SOAP, and WebRTC signaling.
- Container security: application images run as non-root users; only the gateway publishes a host port.
- Configuration security: runtime environment files are ignored, generated with random secrets, restricted to mode `0600` on Linux, and injected through per-service allowlists.
- Production configuration: required credentials and browser origins fail during Compose validation when missing.
- Production exposure: the gateway binds to loopback by default and requires a trusted TLS terminator before public access.
- Repository scan: no runtime `.env`, private key, cloud credential file, or common credential signature is included in the public snapshot.

## Reproduction

On native Ubuntu/Linux, from the `platform` directory:

```bash
bash start.sh
```

Then run the automated tests for each service and the cross-protocol smoke test documented in `OPERATIONS.md`.

## Scope

These results cover local integration through roadmap step 10. Terraform, CI, CD, EC2 deployment, TLS termination, cloud backup, and production rollback verification belong to later roadmap steps and are not claimed complete here.
