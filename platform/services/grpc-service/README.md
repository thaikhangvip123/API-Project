# grpc-service

Roadmap step: 4

Internal gRPC service that exposes user lookups to future internal consumers such as `graphql-service`. It obtains user data from `user-service` over the private Docker network.

## Contract

The protobuf contract is at `proto/user_lookup.proto`.

Services:

- `platform.user.v1.UserLookupService/GetUser`
- `platform.user.v1.UserLookupService/ListUsers`
- `platform.user.v1.Health/Check`

The service listens on `50051` and is intentionally not published to the host.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `GRPC_SERVICE_PORT` | `50051` | gRPC listen port |
| `USER_SERVICE_URL` | required | Internal base URL of `user-service` |
| `USER_SERVICE_TIMEOUT_MS` | `5000` | Timeout for REST calls to `user-service` |

## Local commands

```bash
npm ci
npm test
npm start
```

## Docker commands

```bash
docker build -t internship/grpc-service:0.1.0 .
docker compose up -d --build postgres user-service grpc-service
```

## gRPC smoke test

Run `grpcurl` from a container on `platform-net` because this service is internal-only:

```bash
docker run --rm --network internship-api-platform_platform-net \
  -v "$(pwd)/proto:/protos:ro" fullstorydev/grpcurl:v1.9.1 \
  -plaintext -import-path /protos -proto user_lookup.proto -d '{}' \
  grpc-service:50051 platform.user.v1.UserLookupService.ListUsers
```

Status: implemented and runtime verified on Docker Compose.
