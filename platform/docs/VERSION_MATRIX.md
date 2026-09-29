# Version Matrix

Last updated: 2026-09-13

| Component | Version pin | Where declared | Notes |
|---|---:|---|---|
| Node.js base image | `node:20.11-alpine` | Implemented Node service Dockerfiles | Required by blueprint |
| Python base image | `python:3.12-slim` | Future `soap-service` Dockerfile | Required by blueprint |
| Nginx | `nginx:1.27-alpine` | `docker-compose.yml`, `docker-compose.prod.yml` | Gateway image |
| PostgreSQL | `postgres:16.4-alpine` | `docker-compose.yml`, `docker-compose.prod.yml` | Local/prod database container |
| Platform service image tags | `0.1.0` | Compose files | Initial scaffold tag |
| Apollo Server | `5.5.1` | `graphql-service/package.json`, `package-lock.json` | Supported GraphQL HTTP server |
| GraphQL | `16.14.2` | `graphql-service/package.json`, `package-lock.json` | Apollo Server 5-compatible schema and execution runtime |
| Socket.IO | TBD in step 6 | `websocket-service/package.json` | Pin exact version when implemented |
| auth-service runtime dependencies | none | `auth-service/package.json` | JWT HS256 uses Node.js built-in `crypto` |
| Prisma CLI and client | `5.22.0` | `user-service/package.json` | Pinned for PostgreSQL migration and ORM access |
| `@grpc/grpc-js` | `1.14.4` | `grpc-service/package.json`, `package-lock.json` | Pinned gRPC server and client runtime |
| `@grpc/proto-loader` | `0.7.13` | `grpc-service/package.json`, `package-lock.json` | Pinned protobuf runtime loader |
| protobuf tooling | `.proto` runtime loading | `grpc-service/proto` | Code generation is intentionally deferred; contract is loaded at startup |
| Spyne | TBD in step 8 | `soap-service/requirements.txt` | Pin exact version when implemented |
