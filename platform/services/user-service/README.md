# user-service

Roadmap step: 3

REST CRUD service for user profile data. It persists records in PostgreSQL through Prisma.

## Endpoints

- `GET /health`
- `GET /users`
- `GET /users/:id`
- `POST /users`
- `PUT /users/:id`
- `DELETE /users/:id`

## Configuration

`DATABASE_URL` is required. Use the platform `.env` file when running with Docker Compose.

## Local commands

```bash
npm ci
npx prisma migrate deploy
npm test
npm start
```

## Docker commands

```bash
docker build -t internship/user-service:0.1.0 .
docker run --rm --env-file ../../.env internship/user-service:0.1.0
```

## Smoke test

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","name":"Demo User"}'
```

Status: implemented.
