# webrtc-signaling

Roadmap step: 9

API type: WebRTC signaling

Purpose: exchange offer, answer, and ICE candidate messages for a browser 1-1 video call demo.

Endpoints:

- `GET /health`
- `GET /config`
- `GET /` for the browser client
- `WS /signal` for room signaling

The Nginx gateway exposes these under `/webrtc/`. Rooms accept exactly two
participants. Media flows peer-to-peer; the service only relays signaling
metadata.

## Run tests

```bash
npm ci
npm test
```

## Browser verification

1. Start `webrtc-signaling` and `gateway` with Docker Compose.
2. Open `http://localhost/webrtc/` in two browser tabs.
3. Use the same room code in both tabs and allow camera/microphone access.
4. Confirm local and remote video appear, then test camera/microphone toggles.

The default ICE server is `stun:stun.l.google.com:19302`. A STUN server helps
peers discover network paths but does not relay media. Calls across restrictive
NAT or enterprise networks may require a TURN server in a future production
deployment.

Browser camera and microphone APIs require a secure context. `localhost` works
over HTTP for development, but an EC2/domain deployment must use HTTPS. Set
`SIGNALING_ALLOWED_ORIGINS` to the exact public HTTPS origin in production;
wildcard origins are rejected when `NODE_ENV=production`.

The signaling server also bounds each payload, each client's message rate, and
the outbound WebSocket queue. Tune the `SIGNALING_MAX_*` and
`SIGNALING_RATE_LIMIT_*` variables only after load testing.
