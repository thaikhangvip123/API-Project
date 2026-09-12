# Operations

## Daily Commands

```bash
docker compose up -d --build auth-service gateway
docker compose logs -f auth-service
docker compose restart soap-service
docker compose ps
docker compose down -v
```

## Rules

- Do not SSH into containers to edit code directly.
- Every service must expose `/health` when implemented.
- Logs must go to `stdout`/`stderr`.
- Runtime configuration must come from `.env`.
- After every system update, run the post-update workflow and append the result to `docs/POST_UPDATE_CHECKLIST.md`.
- Codex should run fast local checks before handoff: syntax checks, unit tests, lightweight service smoke tests, and `docker compose config --quiet`.
- Long-running system tests, Docker daemon-dependent runs, full compose startup, cloud deploy checks, and multi-service verification are user-run unless explicitly requested otherwise.
- After each roadmap step, Codex records what passed, what was not run, and the exact user-run commands in `docs/POST_UPDATE_CHECKLIST.md`.

## Local Startup

The current state has completed steps 1-3. Run services incrementally while following the roadmap:

- Step 2: `docker compose up -d --build auth-service gateway`
- Step 3: `docker compose up -d --build postgres user-service gateway`
- Step 10: `docker compose up -d --build`

The gateway is intentionally not hard-dependent on every service so it can start while later roadmap services are still scaffold-only.

## User-Run System Tests

Run these commands from `E:\API_Project\platform` unless a service-specific command says otherwise.

### Gateway

```bash
docker compose up -d gateway
curl http://localhost/health
docker compose logs --tail=100 gateway
```

Expected result: `gateway ok`, no Nginx startup errors.

### auth-service

```bash
docker compose up -d --build auth-service gateway
curl http://localhost/api/auth/health
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"demo@example.com\",\"password\":\"password123\",\"name\":\"Demo User\"}"
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"demo@example.com\",\"password\":\"password123\"}"
docker compose ps auth-service gateway
docker compose logs --tail=100 auth-service gateway
```

Expected result: health returns `ok`, register returns `201`, login returns a Bearer token, containers stay `Up`.

### user-service

```bash
docker compose up -d --build postgres user-service gateway
curl http://localhost/api/users/health
curl http://localhost/api/users
docker compose ps postgres user-service gateway
docker compose logs --tail=100 postgres user-service gateway
```

Expected result: health returns `ok`, CRUD endpoints return correct `200/201/400/404` statuses.

### grpc-service

```bash
docker compose up -d --build postgres user-service grpc-service
grpcurl -plaintext localhost:50051 list
docker compose ps grpc-service
docker compose logs --tail=100 grpc-service
```

Expected result: `grpcurl` can list or call the demo service. If the gRPC port remains internal-only, run `grpcurl` from a temporary container on `platform-net`.

### graphql-service

```bash
docker compose up -d --build postgres user-service grpc-service graphql-service gateway
curl -X POST http://localhost/graphql \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"{ __typename }\"}"
docker compose ps graphql-service gateway
docker compose logs --tail=100 graphql-service gateway
```

Expected result: GraphQL returns valid JSON and resolvers can reach their internal REST/gRPC dependencies.

### websocket-service

```bash
docker compose up -d --build websocket-service gateway
curl http://localhost/ws/health
wscat -c ws://localhost/ws
docker compose ps websocket-service gateway
docker compose logs --tail=100 websocket-service gateway
```

Expected result: health returns `ok`, two clients can exchange or receive broadcast messages.

### webhook-service

```bash
docker compose up -d --build webhook-service gateway
curl http://localhost/webhook/health
curl -X POST http://localhost/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: <signature>" \
  -d "{\"event\":\"demo.created\",\"id\":\"evt_demo\"}"
docker compose ps webhook-service gateway
docker compose logs --tail=100 webhook-service gateway
```

Expected result: valid signatures are accepted, invalid signatures return `401`, repeated event IDs are idempotent.

### soap-service

```bash
docker compose up -d --build soap-service gateway
curl "http://localhost/soap?wsdl"
curl -X POST http://localhost/soap \
  -H "Content-Type: text/xml" \
  -d @sample-request.xml
docker compose ps soap-service gateway
docker compose logs --tail=100 soap-service gateway
```

Expected result: WSDL is reachable and the demo SOAP method returns a valid XML response.

### webrtc-signaling

```bash
docker compose up -d --build webrtc-signaling gateway
curl http://localhost/webrtc/health
docker compose ps webrtc-signaling gateway
docker compose logs --tail=100 webrtc-signaling gateway
```

Expected result: health returns `ok`; browser two-tab signaling test can exchange offer, answer, and ICE candidates.

### Full System

```bash
docker compose down
docker compose up -d --build
docker compose ps
docker compose logs --tail=200
```

Run the API-specific checks above after full startup. Record results in `docs/POST_UPDATE_CHECKLIST.md`.
