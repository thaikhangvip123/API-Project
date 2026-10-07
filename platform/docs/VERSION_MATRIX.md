# Version Matrix

Last updated: 2026-10-07

| Component | Version pin | Where declared | Notes |
|---|---:|---|---|
| Ubuntu host | `24.04 LTS` | Ubuntu bootstrap/autostart scripts; Terraform AMI reference | Native home-server target on `linux-os`; EC2 is optional |
| Node.js base image | `node:20.11-alpine` | Implemented Node service Dockerfiles | Required by blueprint |
| Python base image | `python:3.11.6-slim` | `soap-service/Dockerfile` | Matches the verified local Python 3.11.6 runtime |
| Nginx | `nginx:1.27-alpine` | `docker-compose.yml`, `docker-compose.prod.yml` | Gateway image |
| PostgreSQL | `postgres:16.4-alpine` | `docker-compose.yml`, `docker-compose.prod.yml` | Local/prod database container |
| Platform service image reference | commit SHA tag resolved to registry digest | Production Compose/CD | CI must prevent tag overwrite; deployment and rollback records store the resolved digest, never a mutable release tag |
| Apollo Server | `5.5.1` | `graphql-service/package.json`, `package-lock.json` | Supported GraphQL HTTP server |
| GraphQL | `16.14.2` | `graphql-service/package.json`, `package-lock.json` | Apollo Server 5-compatible schema and execution runtime |
| Socket.IO server/client | `4.8.4` | `websocket-service/package.json`, `package-lock.json` | Exact security-patched pin for chat runtime and integration tests |
| Express | `5.2.1` | `webhook-service/package.json`, `package-lock.json` | Exact pin for the webhook HTTP runtime |
| ws | `8.22.0` | `webrtc-signaling/package.json`, `package-lock.json` | WebRTC offer/answer/ICE signaling transport |
| auth-service runtime dependencies | none | `auth-service/package.json` | JWT HS256 uses Node.js built-in `crypto` |
| Prisma CLI and client | `5.22.0` | `user-service/package.json` | Pinned for PostgreSQL migration and ORM access |
| `@grpc/grpc-js` | `1.14.5` | `grpc-service` and `graphql-service` package manifests/lockfiles | Exact security-patched gRPC client/server runtime pin |
| `@grpc/proto-loader` | `0.7.13` | `grpc-service` and `graphql-service` package manifests/lockfiles | Exact protobuf runtime loader pin |
| protobuf tooling | `.proto` runtime loading | `grpc-service/proto` | Code generation is intentionally deferred; contract is loaded at startup |
| Spyne | `2.14.0` | `soap-service/requirements.txt` | SOAP service and WSDL generation |
| lxml | `6.1.3` | `soap-service/requirements.txt` | Spyne XML parsing and schema validation |
| pytz | `2026.4` | `soap-service/requirements.txt` | Exact Spyne transitive runtime dependency |
| Gunicorn | `23.0.0` | `soap-service/requirements.txt` | Production WSGI server |
| Packaging | `25.0` | `soap-service/requirements.txt` | Exact Gunicorn transitive runtime dependency |
