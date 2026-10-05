# websocket-service

Roadmap step: 6

Socket.IO chat service that broadcasts messages to all connected clients and serves a small browser client for two-tab testing. Clients automatically reconnect after transient transport failures and receive the bounded in-memory message history after reconnecting.

## Endpoints and socket events

- `GET /health`: service status and current connection count.
- `GET /`: browser chat client.
- Socket.IO path: `/socket.io` directly or `/ws/socket.io` through the gateway.
- Client event `chat:username`: update the display name before sending a message.
- Client event `chat:message`: send a string and receive an acknowledgement.
- Server events `chat:message`, `chat:history`, and `chat:presence`.

The chat is deliberately ephemeral: messages are kept only in bounded process memory and disappear after a restart.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `PORT` | `3000` | HTTP and WebSocket listen port |
| `SOCKET_IO_CORS_ORIGIN` | `*` | Allowed browser origin or comma-separated origin list; enforced during the Socket.IO handshake |
| `CHAT_HISTORY_LIMIT` | `50` | Maximum messages retained in memory |
| `CHAT_MESSAGE_MAX_LENGTH` | `1000` | Maximum message length |

## Local commands

```bash
npm ci
npm test
npm start
```

Open `http://127.0.0.1:3000` in two browser tabs and send messages between them.

Production rejects `*`, plain HTTP origins, and origins containing paths. Configure the exact canonical HTTPS origin, for example `https://api.example.com`.

## Docker and gateway test

```bash
docker build -t internship/websocket-service:0.1.0 .
docker run --rm -p 3000:3000 --env-file /secure/path/websocket-service.env internship/websocket-service:0.1.0

bash ../../start.sh websocket-service gateway
```

Open `http://127.0.0.1/ws/` in two browser tabs. The gateway removes the `/ws` prefix and proxies the Socket.IO upgrade to the service.

Status: implemented with automated unit, HTTP, two-client broadcast, history, reconnect, handshake-origin enforcement, and production-origin validation tests.
