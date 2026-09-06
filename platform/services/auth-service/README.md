# auth-service

Roadmap step: 2

API type: REST + JWT

Purpose: authenticate users, issue JWTs, and provide a health endpoint.

## Endpoints

- `GET /health`
- `POST /login`
- `POST /register`
- `GET /verify`

## Configuration

Copy `.env.example` or use the platform-level `.env`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `JWT_SECRET` | required | HMAC secret used to sign JWTs |
| `JWT_EXPIRES_IN` | `1h` | Token lifetime, supports `s`, `m`, `h`, `d` |
| `LOG_LEVEL` | `info` | Reserved for consistent platform logging |

## Local Commands

```bash
npm test
npm start
```

## Docker Commands

```bash
docker build -t internship/auth-service:0.1.0 .
docker run --rm -p 3000:3000 --env-file .env.example internship/auth-service:0.1.0
```

## Smoke Test

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"demo@example.com\",\"password\":\"password123\",\"name\":\"Demo User\"}"
```

Status: implemented.
