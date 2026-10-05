# webhook-service

Roadmap step: 7

Express webhook receiver that verifies the exact raw request body with an HMAC-SHA256 signature before parsing JSON. It demonstrates bounded in-memory idempotency and permits retry when event processing fails.

## Endpoints

- `GET /health`
- `POST /webhook`

## Required headers

- `Content-Type: application/json`
- `X-Webhook-Id`: unique event identifier. `X-GitHub-Delivery` is also accepted.
- `X-Webhook-Signature`: `sha256=<hex digest>`. `X-Hub-Signature-256` is also accepted.
- `X-Webhook-Event`: optional event type. `X-GitHub-Event` or payload field `event` is used as fallback.

The signature is calculated from the exact bytes sent in the HTTP body:

```text
sha256=HMAC_SHA256(WEBHOOK_SECRET, raw_request_body)
```

Accepted events return HTTP `202`. Repeated completed event IDs return HTTP `200` with status `duplicate`; an event that is still processing returns retryable HTTP `503` with `Retry-After`. Idempotency state is process-local and resets when the container restarts.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `PORT` | `3000` | HTTP listen port |
| `WEBHOOK_SECRET` | required | HMAC secret; minimum 32 bytes in production |
| `WEBHOOK_BODY_LIMIT_BYTES` | `1048576` | Maximum raw payload size |
| `WEBHOOK_IDEMPOTENCY_TTL_SECONDS` | `86400` | Duplicate retention time |
| `WEBHOOK_IDEMPOTENCY_MAX_ENTRIES` | `10000` | Maximum in-memory event entries |

## Commands

```bash
npm ci
npm test
npm start

docker build -t internship/webhook-service:0.1.0 .
docker run --rm -p 3000:3000 --env-file /secure/path/webhook-service.env internship/webhook-service:0.1.0
bash ../../start.sh webhook-service gateway
```

See `docs/OPERATIONS.md` for a signed request example through the gateway.

Status: implemented with signature, validation, duplicate, retry, payload-limit, and health tests.
