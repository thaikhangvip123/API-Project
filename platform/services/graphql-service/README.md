# graphql-service

Roadmap step: 5

GraphQL gateway that presents user data through one schema while using REST and gRPC internally. It uses the supported Apollo Server 5 runtime with a minimal `node:http` adapter.

## Endpoints

- `POST /graphql`
- `GET /health`

## Schema

```graphql
type Query {
  users: [User!]!
  user(id: Int!): User
}
```

- `users` obtains the complete collection from `user-service` REST API.
- `user(id)` obtains a single user from `grpc-service`.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `PORT` | `4000` | HTTP listen port |
| `USER_SERVICE_URL` | required | Internal REST base URL |
| `GRPC_SERVICE_HOST` | `grpc-service` | Internal gRPC host |
| `GRPC_SERVICE_PORT` | `50051` | Internal gRPC port |
| `UPSTREAM_TIMEOUT_MS` | `5000` | REST and gRPC timeout |

## Local commands

```bash
npm ci
npm test
npm start
```

## Docker commands

```bash
docker compose up -d --build postgres user-service grpc-service graphql-service gateway
```

## Query example

```bash
curl -X POST http://localhost/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ users { id email name } }"}'
```

Status: implemented and runtime verified through the Nginx gateway; local HTTP adapter regression tests are included.
