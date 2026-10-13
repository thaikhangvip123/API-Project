# Internship API Platform

## Mục tiêu

Internship API Platform là một hệ thống microservice minh họa nhiều kiểu giao tiếp API trong cùng một nền tảng. Dự án tập trung vào ba mục tiêu chính:

- Minh họa cách REST, GraphQL, gRPC, WebSocket, Webhook, SOAP và WebRTC cùng hoạt động trong một kiến trúc thống nhất.
- Tách mỗi trách nhiệm thành một service và container độc lập, có healthcheck và giới hạn giao tiếp rõ ràng.
- Xây dựng một môi trường thực hành DevOps có thể kiểm thử, triển khai và vận hành trên Ubuntu home server bằng Docker.

Hệ thống được thiết kế cho mục đích học tập, trình diễn kiến trúc và làm nền tảng cho các bài thực hành CI/CD, bảo mật, quan sát hệ thống và tự động hóa triển khai.

## Kiến trúc xây dựng

### Kiến trúc tổng thể

```text
Người dùng / API client
          |
          v
Cloudflare Access
          |
          v
Cloudflare Tunnel + HTTPS
          |
          v
Nginx API Gateway (127.0.0.1:8080)
          |
          v
Docker network: platform-net
          |
          |-- auth-service
          |-- user-service ---------> PostgreSQL
          |-- graphql-service ------> user-service (REST)
          |          `--------------> grpc-service (gRPC)
          |                                `-------> user-service (REST)
          |-- websocket-service
          |-- webhook-service
          |-- soap-service
          `-- webrtc-signaling
```

Mọi lưu lượng từ bên ngoài đi qua Cloudflare và Nginx gateway. Các application service không publish port trực tiếp ra host; chúng giao tiếp qua Docker network riêng `platform-net`.

Gateway chỉ bind vào loopback `127.0.0.1:8080`. Cloudflare Tunnel tạo kênh kết nối outbound từ home server tới Cloudflare, nhờ đó không cần publish cổng HTTP của máy chủ trực tiếp ra Internet. Cloudflare Access đóng vai trò lớp kiểm soát truy cập phía trước gateway.

### Nguyên tắc thiết kế

- Mỗi container đảm nhiệm một trách nhiệm API chính.
- Nginx là entry point HTTP duy nhất của nền tảng.
- PostgreSQL và gRPC chỉ khả dụng trong mạng Docker nội bộ.
- Service discovery sử dụng tên service của Docker Compose.
- Healthcheck được khai báo cho gateway, database và các application service phù hợp.
- Dữ liệu User được lưu trong PostgreSQL volume; các thành phần demo in-memory được tách biệt khỏi dữ liệu persistent.
- Secret và production environment được nạp từ host, không đóng gói trong image hoặc source code.
- WebSocket và WebRTC signaling dùng HTTP Upgrade qua cùng gateway.
- WebRTC media truyền peer-to-peer; signaling server chỉ trao đổi room state, offer, answer và ICE candidate.

### Công nghệ chính

| Lớp | Công nghệ |
|---|---|
| Host | Ubuntu Desktop 24.04 LTS, systemd |
| Container | Docker Engine, Docker Compose |
| Gateway | Nginx |
| Node.js services | Node.js, Express, Apollo Server, Socket.IO, `ws`, gRPC |
| SOAP service | Python, Spyne, Gunicorn |
| Database | PostgreSQL, Prisma |
| Public connectivity | Cloudflare Tunnel, Cloudflare Access, HTTPS |
| Infrastructure reference | Terraform AWS |

## Các service

| Service | Loại giao tiếp | Public route | Trách nhiệm |
|---|---|---|---|
| `gateway` | HTTP + static portal | `/`, `/assets/*`, `/health` và toàn bộ proxied public route | Portal, entry point, routing và WebSocket upgrade |
| `auth-service` | REST + JWT | `/api/auth/*` | Đăng ký, đăng nhập, phát hành và xác minh JWT |
| `user-service` | REST CRUD | `/api/users`, `/api/users/:id` | Quản lý user và truy cập PostgreSQL qua Prisma |
| `graphql-service` | GraphQL | `/graphql` | Cung cấp query hợp nhất trên REST và gRPC |
| `grpc-service` | gRPC | Internal only | Tra cứu user nội bộ cho GraphQL service |
| `websocket-service` | Socket.IO/WebSocket | `/ws/*` | Chat realtime, presence và lịch sử tin nhắn giới hạn |
| `webhook-service` | Signed webhook | `/webhook` | Xác minh HMAC-SHA256, idempotency và xử lý retry |
| `soap-service` | SOAP/WSDL | `/soap`, `/soap?wsdl` | Chuyển số nguyên thành chữ tiếng Anh |
| `webrtc-signaling` | WebSocket signaling | `/webrtc/*` | Room hai peer và trao đổi offer/answer/ICE |
| `postgres` | PostgreSQL | Internal only | Lưu trữ dữ liệu user persistent |

## API Portal

Nginx phục vụ một portal tĩnh tại `/` bằng HTML, CSS và JavaScript thuần, không dùng CDN hoặc frontend framework. Portal cung cấp:

- Dashboard trạng thái service với refresh và polling có kiểm soát.
- Register, login và verify JWT; token chỉ tồn tại trong memory của tab browser.
- User CRUD trên PostgreSQL với validation và xác nhận trước khi xóa.
- GraphQL Explorer, SOAP `NumberToWords` và tài liệu signed webhook an toàn.
- Liên kết tới Chat và WebRTC, mô tả gRPC nội bộ và endpoint catalog.

Preview bằng development stack:

```bash
cd platform
bash start.sh
```

Sau đó mở `http://localhost/`. Dừng preview bằng `bash start.sh --stop` để không để development stack chạy song song khi quay lại vận hành production.

Portal và API cùng origin. Cloudflare Access tiếp tục bảo vệ toàn bộ hostname public; JWT demo không thay thế phiên Cloudflare Access.

### Auth REST

`auth-service` minh họa quy trình authentication bằng JWT:

- `POST /api/auth/register`: tạo tài khoản demo và phát hành token.
- `POST /api/auth/login`: xác minh thông tin đăng nhập và phát hành token.
- `GET /api/auth/verify`: xác minh Bearer token.

Tài khoản của auth-service được lưu trong memory cho phạm vi demo và tách biệt với dữ liệu User persistent.

### User REST và PostgreSQL

`user-service` cung cấp các thao tác tạo, liệt kê, truy vấn, cập nhật và xóa user. Service sử dụng Prisma để giao tiếp với PostgreSQL và lưu dữ liệu trong Docker volume.

### GraphQL và gRPC

`graphql-service` cung cấp một schema truy vấn thống nhất:

- Query danh sách user gọi `user-service` qua REST.
- Query một user theo ID gọi `grpc-service` qua gRPC.
- `grpc-service` tiếp tục truy vấn dữ liệu từ `user-service` trong mạng nội bộ.

Cổng gRPC không được expose qua gateway hay ra Internet.

### WebSocket Chat

`websocket-service` cung cấp chat realtime bằng Socket.IO, bao gồm broadcast giữa các client, presence, reconnect và giới hạn lịch sử tin nhắn trong memory. Browser client được phục vụ qua `/ws/`.

### Webhook

`webhook-service` tiếp nhận JSON webhook và xác minh chữ ký HMAC-SHA256 trên raw request body trước khi parse dữ liệu. Service có kiểm soát payload size, event ID và idempotency giới hạn trong memory.

### SOAP

`soap-service` cung cấp WSDL và operation `NumberToWords`, chuyển số nguyên trong phạm vi hỗ trợ thành chữ tiếng Anh. SOAP request và WSDL được truy cập qua cùng Nginx gateway.

### WebRTC Signaling

`webrtc-signaling` quản lý room hai người và chuyển tiếp offer, answer, ICE candidate giữa hai browser. Video/audio media được truyền trực tiếp giữa các peer, không đi qua signaling server.
