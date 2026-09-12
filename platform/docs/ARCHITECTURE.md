# Architecture

## Goal

This project is a compact 7-API microservice platform for a DevOps internship demo. The main design rule is: one container owns one API responsibility.

## Entry Point

All external traffic enters through the Nginx gateway. Internal services communicate on the private Docker network `platform-net`.

| Public path | Service | API type |
|---|---|---|
| `/api/auth/*` | `auth-service` | REST + JWT |
| `/api/users/*` | `user-service` | REST CRUD |
| `/graphql` | `graphql-service` | GraphQL |
| `/ws/*` | `websocket-service` | WebSocket |
| `/webhook/*` | `webhook-service` | Webhook receiver |
| `/soap` | `soap-service` | SOAP |
| `/webrtc/*` | `webrtc-signaling` | WebRTC signaling |
| internal only | `grpc-service` | gRPC |

## Service Responsibilities

| Service | Responsibility | Exposed outside gateway |
|---|---|---|
| `auth-service` | Login, JWT creation, JWT validation endpoint | Yes |
| `user-service` | User CRUD and profile data | Yes |
| `graphql-service` | Unified query layer calling REST/gRPC internally | Yes |
| `grpc-service` | Internal order-style API demo | No |
| `websocket-service` | Chat or real-time event broadcast demo | Yes |
| `webhook-service` | Signed webhook validation and idempotency demo | Yes |
| `soap-service` | WSDL and one SOAP method demo | Yes |
| `webrtc-signaling` | Offer/answer/ICE signaling for a 1-1 demo | Yes |
| `postgres` | Shared demo persistence for local development | No |

## Network Rules

- `gateway` is the only container exposing an HTTP port to the host.
- `grpc-service` is only reachable inside `platform-net`.
- `postgres` is only reachable inside `platform-net`.
- Service configuration is read from `.env`, based on `.env.example`.
- Gateway DNS lookup is deferred until request time, so it can run while only the current roadmap service has been implemented.

## Current Roadmap Status

- Step 1 complete: folder structure, gateway routing design, compose skeleton, version matrix, and operation/checklist docs.
- Step 2 implemented: `auth-service` REST + JWT code, tests, Dockerfile, README, and Compose healthcheck are in place.
- Step 2 Docker runtime verification complete: standalone image/container and Compose gateway flow pass.
- Step 3 implemented: `user-service` REST CRUD uses PostgreSQL through Prisma, with an initial migration, tests, Dockerfile, README, and Compose healthcheck.
- Step 3 runtime verification complete: the pinned Prisma packages installed with no reported vulnerabilities, and the Compose gateway plus user-service API checks passed.
