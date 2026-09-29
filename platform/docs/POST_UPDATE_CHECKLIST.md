# Post-Update Checklist

Use this file after each system update. The project has completed source implementation through roadmap step 5; each entry records its own verification status.

## 2026-09-29 - Architecture Readiness Review Through Roadmap Step 5

Change: Reviewed the implemented architecture, all source/configuration changes, service contracts, environment variables, dependency locks, tests, Compose definitions, gateway routing, and operations documentation before roadmap step 6. Fixed GraphQL malformed-JSON handling, upstream error disclosure, gRPC deadline mapping, timeout validation/fallback, duplicated protobuf drift, production JWT secret validation, JWT duration edge cases, and documentation inconsistencies. Added GraphQL HTTP adapter regression coverage and an implemented runtime-flow summary.

Directly affected services: auth-service, graphql-service, grpc-service, gateway/configuration documentation, and the shared environment example.

Architecture result: the implemented path is coherent: gateway routes public REST/GraphQL traffic; user-service persists through PostgreSQL; graphql-service uses user-service REST for lists and grpc-service for single-user lookup; grpc-service bridges to user-service over the private network. WebSocket, webhook, SOAP, and WebRTC remain scaffold-only for roadmap steps 6-9.

Automated tests: PASS, 25/25 total (`auth-service` 7/7, `user-service` 4/4, `grpc-service` 5/5, `graphql-service` 9/9).

Static/configuration validation: PASS. All JavaScript source files passed `node --check`; local and production Compose files passed `docker compose config --quiet`; `git diff --check` passed; GraphQL and gRPC protobuf contracts are identical.

Dependency validation: PASS. Clean lockfile installs completed for user-service, grpc-service, and graphql-service using a sandbox-local cache. `npm audit --omit=dev` reported 0 vulnerabilities for all three dependency-bearing services. Auth-service has no third-party runtime dependencies.

Security/error-handling result: production auth now rejects placeholder or shorter-than-32-byte JWT secrets; invalid or overflowing JWT durations are rejected; malformed GraphQL JSON returns HTTP 400; unknown upstream 500 details and gRPC connection details are not exposed to clients; gRPC deadline/unavailable errors map to GraphQL service-unavailable behavior.

Docker runtime result: BLOCKED in this run. Sandbox access to the Docker named pipe required escalation, but automatic approval failed because 9router returned `404 No active credentials for provider: openai`. The previously recorded step-5 gateway runtime checks remain the latest successful end-to-end evidence. The pending gateway CRUD-by-ID correction still requires container rebuild and GET/PUT/DELETE smoke tests.

Independent review result: BLOCKED in this run. The configured subagent alias `cx/gpt-5.6-luna-review` was not recognized by the multi-agent runtime; a fallback reviewer also failed because 9router returned the same missing-provider-credentials error. A full primary-agent review was completed, but the independent-review hard gate must be rerun after the router credential/model mapping is repaired.

CI result: not run; CI starts in roadmap step 13.

Cloud deploy result: not run; cloud deploy starts in roadmap step 15.

Readiness decision: source, tests, dependency audit, contracts, and static configuration are ready for roadmap step 6. Do not treat the system as fully runtime-cleared until the blocked Docker CRUD smoke test and independent subagent review are rerun successfully.

Executor: Codex

## 2026-09-29 - Gateway User CRUD Route Correction (pending runtime verification)

Change: Split the user-service gateway routes so `/api/users/health` remains `/health` upstream while `/api/users/:id` reaches `/users/:id`. This restores GET, PUT, and DELETE user CRUD calls through the public gateway.

Directly affected services: gateway and user-service API access.

Focused validation: static configuration review and local/prod `docker compose config --quiet` passed. Runtime confirmation must exercise `GET /api/users/1`, `PUT /api/users/1`, and `DELETE /api/users/1` after the gateway is rebuilt.

Executor: Codex

## 2026-09-13 - Roadmap Step 5 GraphQL Service

Change: Implemented `graphql-service` with supported Apollo Server 5, GraphQL 16.14.2, and a bounded native HTTP adapter. The `users` query calls user-service REST; the `user(id)` query calls grpc-service. Added Dockerfile, Compose dependency/healthcheck metadata, documentation, and automated tests.

Directly affected services: graphql-service, gateway route `/graphql`, and Compose metadata.

Services requiring retest due to dependencies: gateway, user-service, grpc-service, and postgres.

Focused validation: syntax checks passed for GraphQL source files; unit tests passed 5/5 before dependency cleanup; a local HTTP smoke test returned the expected `/health` response and GraphQL `Query` type. Local/prod Compose configs parse successfully; `git diff --check` passed. Primary-agent review fixed GraphQL bad-input error mapping, replaced the EOL Apollo Server 4/Express 4 adapter with the supported Apollo Server 5 plus native adapter, and prevents unexpected server errors from leaking internal messages.

Dependency/runtime result: host installation completed; the GraphQL dependency tree was revised to Apollo Server 5.5.1 and GraphQL 16.14.2 after removing the EOL Apollo 4/Express 4 stack. `npm audit --omit=dev` reports 0 vulnerabilities. Through the Nginx gateway, `users` returned the persisted GraphQL demo user via user-service REST and `user(id: 1)` returned the same user via grpc-service.

CI result: not run; CI starts in roadmap step 13.

Cloud deploy result: not run; cloud deploy starts in roadmap step 15.

Executor: Codex

## 2026-09-12 - Roadmap Step 4 gRPC Service

Change: Completed `grpc-service` implementation with a versioned protobuf user-lookup contract, internal REST bridge to user-service, gRPC health RPC, Dockerfile, README, and automated tests.

Directly affected services: grpc-service and its user-service dependency.

Services requiring retest due to dependencies: user-service, postgres, and future graphql-service.

Focused validation: `npm test` passed 5/5; syntax checks passed for all gRPC source files; `git diff --check` passed.

Review result: primary-agent review was used under user authorization because 9Router cannot start subagents. It found and fixed the proto-loader lower-camel-case method registration bug and ensured gRPC errors are actual `Error` objects with status codes.

Build and runtime result: user-confirmed OK. Docker Compose built and started `postgres`, `user-service`, and `grpc-service`; all three containers reported `healthy`. `grpcurl` on the private `internship-api-platform_platform-net` returned the expected user from `UserLookupService/ListUsers` and `UserLookupService/GetUser`.

CI result: not run; CI starts in roadmap step 13.

Cloud deploy result: not run; cloud deploy starts in roadmap step 15.

Executor: Codex

## 2026-09-09 - Roadmap Step 3 User Service

Change: Implemented `user-service` REST CRUD with a PostgreSQL Prisma schema, initial SQL migration, JSON logging, Dockerfile, README, unit/API tests, and Compose healthchecks.

Directly affected services: user-service, postgres dependency metadata, gateway route `/api/users/*`, Compose healthcheck metadata.

Services requiring retest due to dependencies: postgres and gateway; future gRPC and GraphQL services will depend on user-service.

Build result: user-confirmed OK. `npm install` completed with 0 vulnerabilities, produced the committed `package-lock.json`, and Docker Compose created the gateway successfully.

Health-check result: user-confirmed OK for the two gateway-routed user-service API checks; both returned HTTP `200`.

API checklist result: local automated CRUD and HTTP API tests passed 4/4 using an in-memory repository. User-confirmed gateway runtime checks returned HTTP `200` for two user-service APIs. Full create/update/delete PostgreSQL smoke tests remain pending.

Syntax result: passed for all user-service source files.

Version matrix: updated with Prisma CLI/client `5.22.0`.

CI result: not run; CI starts in roadmap step 13.

Cloud deploy result: not run; cloud deploy starts in roadmap step 15.

Executor: Codex

## 2026-09-02 - Step 1 Scaffold

Change: Created platform architecture scaffold, gateway route design, compose skeleton, environment example, and docs.

Directly affected services: all service folders created as scaffold only.

Services requiring retest due to dependencies: not applicable yet; no service code exists.

Build result: not run; Dockerfiles are intentionally deferred to per-service roadmap steps.

Health-check result: not run; `/health` endpoints start in step 2.

API checklist result: not run; API implementations start in step 2.

Version matrix: updated with pinned infrastructure images and TBD application dependencies.

CI result: not run; CI starts in roadmap step 13.

Cloud deploy result: not run; cloud deploy starts in roadmap step 15.

Executor: Codex

## 2026-09-05 - Roadmap Step 2 Auth Service

Change: Implemented `auth-service` REST + JWT with health, registration, login, token verification, JSON logging, tests, service Dockerfile, and service README.

Directly affected services: auth-service, gateway route `/api/auth/*`, compose healthcheck metadata.

Services requiring retest due to dependencies: gateway path `/api/auth/*`; future graphql-service and websocket-service should retest JWT integration when those steps are implemented.

Build result: OK. `docker build -t internship/auth-service:0.1.0 .` passed from `platform/services/auth-service`.

Standalone run result: OK. Local Node run passed, Docker standalone container run passed, and direct smoke test on `127.0.0.1:3000` passed.

Health-check result: OK after fix. Initial Compose healthchecks were unhealthy because `localhost` inside containers returned connection refused; changed gateway/auth-service healthchecks to `127.0.0.1`. Final `docker compose ps auth-service gateway` showed both containers `healthy`.

API checklist result: OK. Local Node, standalone Docker, and gateway-routed Compose smoke tests passed for `/health`, `/register`, `/login`, and `/verify`.

Automated tests: `npm test` passed 6/6 tests.

Dependency install/audit: `npm ci --omit=dev` passed with 0 vulnerabilities.

Compose config result: OK for `docker-compose.yml` and `docker-compose.prod.yml`; `docker compose up -d --build auth-service gateway` passed after healthcheck fix.

Version matrix: updated; auth-service has no third-party runtime dependencies.

CI result: not run; CI starts in roadmap step 13.

Cloud deploy result: not run; cloud deploy starts in roadmap step 15.

Executor: Codex

## 2026-09-05 - Docker Architecture Readiness Check

Change: Prepared Docker/Nginx scaffold for incremental roadmap execution before starting step 2.

Directly affected services: gateway, compose definitions, environment files, documentation.

Services requiring retest due to dependencies: auth-service first in step 2; remaining services still scaffold-only.

Build result: not run; service Dockerfiles are still deferred to per-service roadmap steps.

Compose config result: OK for `docker-compose.yml` and `docker-compose.prod.yml`.

Gateway config result: static review completed; containerized `nginx -t` not run because Docker Desktop daemon is not currently available.

Health-check result: not run; gateway healthcheck added, service `/health` endpoints start in step 2.

API checklist result: not run; API implementations start in step 2.

Version matrix: no dependency version changes.

CI result: not run; CI starts in roadmap step 13.

Cloud deploy result: not run; cloud deploy starts in roadmap step 15.

Executor: Codex
