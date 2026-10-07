# DevOps Internship Project — 7-API Microservice Blueprint

---

## 0. Nguyên tắc bao trùm toàn dự án

1. **1 container = 1 trách nhiệm = 1 loại API.** Không gộp logic của hai loại API vào cùng một service.
2. **Mọi thứ đều pin version cụ thể** — không dùng tag `latest` cho image, không dùng version range mở (`^`, `~`) mà không có lock file commit vào Git.
3. **Không tối ưu sớm.** Bỏ qua Canary deploy, WAF, chaos engineering, service mesh — những thứ này để dành cho phần "định hướng mở rộng" khi trình bày, không bắt buộc phải build.
4. **Sau MỖI lần cập nhật hệ thống (thêm tính năng, đổi version, sửa cấu hình), bắt buộc chạy lại toàn bộ Post-Update Verification Workflow ở Mục 8** trước khi coi là hoàn thành. Không có ngoại lệ, kể cả thay đổi nhỏ như sửa biến môi trường.

---

## 1. Kiến trúc tổng thể

```text
                              ┌─────────────┐
                              │   Client    │
                              └──────┬──────┘
                                     │
                              ┌──────▼──────┐
                              │ Nginx Gateway│   ← điểm vào duy nhất, route theo path
                              └──────┬──────┘
      ┌───────────┬───────────┬─────┼─────┬───────────┬───────────┐
      │           │           │     │     │           │           │
 ┌────▼───┐  ┌────▼────┐ ┌────▼┐ ┌──▼───┐┌────▼───┐┌────▼────┐┌────▼────┐
 │  REST  │  │ GraphQL │ │  WS │ │Webhook││  SOAP  ││ WebRTC  ││  gRPC   │
 │auth/user│  │ Gateway │ │Chat │ │Receiver││Adapter ││Signaling││ (nội bộ)│
 └────┬───┘  └────┬────┘ └─────┘ └───────┘└────────┘└─────────┘└────┬────┘
      │           │                                                  │
      │      (gọi nội bộ qua REST/gRPC)                               │
      │                                                                │
      └───────────────────────┬───────────────────────────────────────┘
                               │
                        ┌──────▼──────┐
                        │  PostgreSQL │
                        │  (hoặc SQLite│
                        │  cho local)  │
                        └─────────────┘
```

**Quy tắc route qua Gateway (Nginx):**

| Path | Container xử lý | Ghi chú |
|---|---|---|
| `/api/auth/*` | `auth-service` | REST + JWT |
| `/api/users/*` | `user-service` | REST CRUD |
| `/graphql` | `graphql-service` | Gộp dữ liệu từ REST/gRPC |
| `/ws` | `websocket-service` | Cần header `Upgrade` cho proxy |
| `/webhook/*` | `webhook-service` | Nhận sự kiện GitHub/Stripe |
| `/soap` | `soap-service` | 1 endpoint SOAP demo |
| `/webrtc/*` | `webrtc-signaling` | Signaling, dùng STUN công khai |
| — | `grpc-service` | Không expose qua Nginx, chỉ giao tiếp nội bộ trong Docker network |

---

## 2. Thành phần hệ thống

### 2.1 Cấu trúc thư mục

```text
platform/
├── docker-compose.yml
├── docker-compose.prod.yml
├── start.sh
├── gateway/
│   └── nginx.conf
├── services/
│   ├── auth-service/          # REST + JWT
│   ├── user-service/          # REST CRUD
│   ├── graphql-service/       # Apollo Server, gọi sang REST/gRPC
│   ├── grpc-service/          # Order gọi User qua gRPC
│   ├── websocket-service/     # Socket.IO chat demo
│   ├── webhook-service/       # Nhận & xác thực webhook
│   ├── soap-service/          # Endpoint SOAP demo
│   └── webrtc-signaling/      # Signaling server + static client
├── infrastructure/
│   ├── terraform/             # EC2, Security Group, VPC tối giản
│   └── scripts/               # deploy.sh, healthcheck.sh
├── .github/workflows/
│   ├── ci.yml
│   └── cd.yml
└── docs/
    ├── VERSION_MATRIX.md
    ├── OPERATIONS.md
    └── VERIFICATION.md
```

### 2.2 Bảng công nghệ & version pin

| Service | Stack | Base image / version pin |
|---|---|---|
| auth-service | Node.js HTTP + built-in crypto/JWT HS256 | `node:20.11-alpine` |
| user-service | Node.js HTTP + Prisma | `node:20.11-alpine` |
| graphql-service | Apollo Server 5.5.1 | `node:20.11-alpine` |
| grpc-service | Node.js + `@grpc/grpc-js` + protoc | `node:20.11-alpine`, protobuf `25.x` |
| websocket-service | Socket.IO 4.8.4 | `node:20.11-alpine` |
| webhook-service | Express + xác thực chữ ký | `node:20.11-alpine` |
| soap-service | Python + `spyne` | `python:3.11.6-slim` |
| webrtc-signaling | Native WebRTC + `ws` 8.22.0 | `node:20.11-alpine` |
| Database | PostgreSQL | `postgres:16.4-alpine` |
| Gateway | Nginx | `nginx:1.27-alpine` |

> Mọi version thật khi triển khai phải được ghi vào `docs/VERSION_MATRIX.md`, kèm ngày cập nhật gần nhất.

### 2.3 docker-compose.yml (mẫu tham khảo)

```yaml
version: "3.9"

services:
  gateway:
    image: nginx:1.27-alpine
    ports: ["80:80"]
    volumes:
      - ./gateway/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on: [auth-service, graphql-service, websocket-service]
    networks: [platform-net]

  auth-service:
    build: ./services/auth-service
    image: myorg/auth-service:1.0.0
    environment:
      JWT_SECRET: ${JWT_SECRET:?required}
    networks: [platform-net]

  user-service:
    build: ./services/user-service
    image: myorg/user-service:1.0.0
    environment:
      DATABASE_URL: ${DATABASE_URL:?required}
    networks: [platform-net]

  graphql-service:
    build: ./services/graphql-service
    image: myorg/graphql-service:1.0.0
    depends_on: [grpc-service, user-service]
    networks: [platform-net]

  grpc-service:
    build: ./services/grpc-service
    image: myorg/grpc-service:1.0.0
    networks: [platform-net]

  websocket-service:
    build: ./services/websocket-service
    image: myorg/websocket-service:1.0.0
    ulimits:
      nofile: { soft: 65536, hard: 65536 }
    networks: [platform-net]

  webhook-service:
    build: ./services/webhook-service
    image: myorg/webhook-service:1.0.0
    networks: [platform-net]

  soap-service:
    build: ./services/soap-service
    image: myorg/soap-service:1.0.0
    networks: [platform-net]

  webrtc-signaling:
    build: ./services/webrtc-signaling
    image: myorg/webrtc-signaling:1.0.0
    networks: [platform-net]

  postgres:
    image: postgres:16.4-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:?required}
      POSTGRES_USER: ${POSTGRES_USER:?required}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?required}
    volumes: [pgdata:/var/lib/postgresql/data]
    networks: [platform-net]

networks:
  platform-net:
    driver: bridge

volumes:
  pgdata:
```

---

## 3. Quy trình vận hành (Operations)

### 3.1 Lệnh quản lý container hằng ngày

```bash
bash start.sh                         # khởi động toàn bộ hệ thống
docker compose logs -f auth-service   # xem log riêng 1 service
bash start.sh --restart soap-service  # restart 1 service dưới host-wide lock
docker compose ps                     # kiểm tra trạng thái tất cả container
bash start.sh --stop                  # dừng hệ thống nhưng giữ volume DB
```

Không đưa thao tác xóa volume vào workflow hằng ngày. Reset dữ liệu phải là quy trình phục hồi có chủ đích và có xác nhận riêng.

### 3.2 Nguyên tắc vận hành

- Không SSH vào container để sửa code trực tiếp — mọi thay đổi phải qua Git commit → rebuild image.
- Mỗi service phải có endpoint `/health` trả về `200 OK` khi hoạt động bình thường.
- Log xuất ra `stdout`/`stderr` theo định dạng JSON nhất quán — không ghi log vào file trong container.
- Biến môi trường (DB URL, JWT secret, webhook secret...) luôn đọc từ file runtime không được Git theo dõi hoặc secret manager, không hardcode trong code.

---

## 4. Checklist xây dựng từng service (Definition of Done)

Áp dụng cho **từng container**, đánh dấu hoàn thành trước khi chuyển sang service tiếp theo:

- [ ] Có `Dockerfile` riêng, build thành công độc lập (`docker build .`)
- [ ] Chạy độc lập bằng `docker run`, không phụ thuộc `docker-compose` để test cơ bản
- [ ] Có endpoint/health-check xác nhận service "sống"
- [ ] Có ít nhất 1 test case tự động (unit test hoặc script gọi thử: curl/Postman/wscat/grpcurl)
- [ ] Đọc cấu hình từ biến môi trường; không commit file runtime chứa cấu hình hoặc secret
- [ ] Có `README.md` riêng trong thư mục service: mục đích, cách chạy, cách test
- [ ] Log ra console theo format nhất quán

### Checklist riêng theo từng loại API

**REST (auth-service, user-service)**
- [ ] CRUD cơ bản hoạt động (Create/Read/Update/Delete)
- [ ] JWT sinh ra và xác thực đúng ở middleware
- [ ] Trả đúng HTTP status code (200/201/400/401/404)

**GraphQL (graphql-service)**
- [ ] Schema định nghĩa rõ ràng (`.graphql` hoặc code-first)
- [ ] Resolver gọi đúng sang REST/gRPC nội bộ
- [ ] Query mẫu chạy được qua GraphQL Playground/Postman

**gRPC (grpc-service)**
- [ ] File `.proto` định nghĩa rõ service + message
- [ ] Generate code từ proto thành công, đúng version protoc đã pin
- [ ] Gọi thử bằng `grpcurl` thành công

**WebSocket (websocket-service)**
- [ ] Kết nối/broadcast tin nhắn giữa 2 client thử nghiệm
- [ ] Xử lý được reconnect cơ bản
- [ ] Test bằng `wscat` hoặc client HTML đơn giản

**Webhook (webhook-service)**
- [ ] Xác thực chữ ký (signature) của request đến
- [ ] Idempotency cơ bản (tránh xử lý trùng sự kiện)
- [ ] Test bằng `curl -X POST` giả lập payload GitHub/Stripe

**SOAP (soap-service)**
- [ ] WSDL truy cập được (`/soap?wsdl`)
- [ ] 1 method demo hoạt động đúng (convert số → chữ tiếng Anh)
- [ ] Test bằng request XML qua Nginx gateway

**WebRTC (webrtc-signaling)**
- [ ] Signaling server trao đổi offer/answer/ICE thành công qua Nginx
- [ ] Video call 1-1 hoạt động giữa 2 tab trình duyệt
- [ ] Dùng STUN công khai của Google, không cần tự host TURN cho demo
- Lưu ý deploy: camera/microphone trên thiết bị ngoài yêu cầu HTTPS; HTTP chỉ được browser miễn trừ cho `localhost`

---

## 5. CI/CD

### 5.1 CI — chạy khi push/PR

- Workflow phải nằm tại repository root: `.github/workflows/ci.yml`.
- Mọi action bên thứ ba phải pin bằng full commit SHA, không dùng mutable tag như `@v4` hoặc `@main`.
- Tách rõ Node test suites và SOAP/Python test suite; job phải trả exit code khác `0` khi bất kỳ test nào fail.
- Mọi đường dẫn build/test phải bắt đầu từ `platform/`, vì đây là thư mục chứa Compose và services.
- Không dùng `|| true`, `continue-on-error` hoặc shell construct che failure cho bước bắt buộc.
- Chỉ cấp `permissions` tối thiểu cần thiết cho từng job.

### 5.2 CD — chạy khi merge vào `main`

- Workflow phải nằm tại `.github/workflows/cd.yml` và chỉ chạy sau khi CI bắt buộc đã pass.
- Pin action bằng full commit SHA và đặt `permissions` tối thiểu; ưu tiên OIDC/short-lived credentials thay cho token dài hạn.
- Secret chỉ lấy từ GitHub Environments hoặc secret manager, không ghi trong workflow, command argument hoặc log.
- Xác minh SSH host key, giới hạn deploy user và không cấp quyền root trực tiếp.
- Deploy image bằng immutable digest hoặc commit SHA; healthcheck fail phải dừng deployment và kích hoạt rollback.

---

## 6. Triển khai hạ tầng

### 6.1 Home server Ubuntu 24.04 — deployment target chính

Nhánh `linux-os` triển khai production trực tiếp trên máy vật lý Ubuntu 24.04 tại nhà. Tám application image được build local, production Compose tự khởi động bằng systemd và gateway chỉ bind `127.0.0.1:8080` để Cloudflare Tunnel cung cấp HTTPS public.

```text
Ubuntu boot
  -> Docker Engine
  -> internship-api-platform.service
  -> docker-compose.prod.yml + docker-compose.home.yml
  -> 127.0.0.1:8080
  -> Cloudflare Tunnel
  -> public HTTPS domain
```

Home-server runtime không dùng EC2, Elastic IP, AWS credential hoặc AWS Terraform state.

### 6.2 Terraform AWS — bài thực hành và deployment target tham khảo

```text
infrastructure/terraform/
├── main.tf         # EC2 instance, key pair
├── network.tf       # VPC mặc định + Security Group
├── variables.tf
└── outputs.tf        # public IP
```

Security Group tối thiểu:
- Port `22` (SSH) — giới hạn theo IP cá nhân
- Port `443` (TLS endpoint); port `80` chỉ dùng để redirect sang HTTPS nếu cần
- Không mở port riêng cho từng service nội bộ; WebRTC dùng STUN công khai nên không cần mở dải UDP TURN.

### 6.3 Các bước EC2 tham khảo

1. `terraform apply` → tạo EC2 (Ubuntu 24.04 LTS, tối thiểu `t3.small`)
2. Cài Docker + Docker Compose plugin qua `user_data` script (tự động khi EC2 khởi động lần đầu)
3. Pull image đã build sẵn từ GitHub Container Registry (GHCR) — không build trực tiếp trên EC2
4. Chạy deployment script có host-wide lock để pull image và apply `docker-compose.prod.yml`
5. Trỏ domain và terminate TLS tại trusted load balancer/reverse proxy; HTTP chỉ được redirect sang HTTPS

Production Compose mặc định chỉ bind gateway vào `127.0.0.1:8080`. Không publish trực tiếp port HTTP ra Internet. HTTPS là bắt buộc cho mọi endpoint public vì hệ thống truyền login/password, JWT, user data và webhook payload.

---

## 7. Roadmap thực hiện theo thứ tự

| Bước | Nội dung | Output |
|---|---|---|
| 1 | Thiết kế kiến trúc + folder structure | Mục 1, 2 hoàn chỉnh |
| 2 | Code `auth-service` (REST + JWT) — nền tảng cho các service khác | Container chạy độc lập, pass checklist Mục 4 |
| 3 | Code `user-service` (REST CRUD) | Container chạy độc lập, pass checklist |
| 4 | Code `grpc-service` (gọi sang user-service) | Test bằng `grpcurl` thành công |
| 5 | Code `graphql-service` (gộp REST + gRPC) | Query mẫu chạy được |
| 6 | Code `websocket-service` (chat demo) | 2 client chat được với nhau |
| 7 | Code `webhook-service` | Nhận và xác thực được payload mẫu |
| 8 | Code `soap-service` | WSDL truy cập được, method demo chạy đúng |
| 9 | Code `webrtc-signaling` | Video call 1-1 giữa 2 tab trình duyệt |
| 10 | Ghép toàn bộ bằng `docker-compose.yml` + Nginx gateway | Test local toàn hệ thống |
| 11 | **Chạy cổng local/repository của Post-Update Verification Workflow (Mục 8)** | Test, build, runtime, cấu hình production và repository scan xanh; CI ghi `N/A` đến bước 13 |
| 12 | Chuẩn bị Ubuntu 24.04 home server + systemd autostart; giữ Terraform AWS làm bài thực hành | Production Compose tự khởi động sau reboot |
| 13 | Viết CI (`ci.yml`) | Build/test tự động chạy xanh trên GitHub |
| 14 | Viết CD (`cd.yml`) | Deploy tự động lên home server sau khi CI pass |
| 15 | Cấu hình Cloudflare Tunnel và deploy public lần đầu | Truy cập được qua HTTPS domain |
| 16 | **Chạy lại Post-Update Verification Workflow (Mục 8)** trên home server | Toàn bộ workflow xanh trên production |
| 17 | Viết README tổng + báo cáo đồ án | Tài liệu hoàn chỉnh nộp/trình bày |

---

## 8. Post-Update Verification Workflow — BẮT BUỘC sau mỗi lần cập nhật

> **Nguyên tắc:** Bất kỳ thay đổi nào — dù nhỏ như sửa 1 biến môi trường, đổi 1 dòng code, nâng version 1 thư viện — đều PHẢI chạy lại toàn bộ checklist dưới đây trước khi coi là "hoàn thành". Mục tiêu là phát hiện sớm sai sót lan sang các service khác do kiến trúc microservice liên kết với nhau.

### 8.1 Checklist hậu kiểm toàn hệ thống

- [ ] **Build lại image bị ảnh hưởng dưới lock**: `bash start.sh --rebuild <service>`
- [ ] **Khởi động/restart hệ thống dưới lock**: `bash start.sh --restart`
- [ ] **Kiểm tra health-check** của TẤT CẢ container, không chỉ container vừa sửa:
  ```bash
  docker compose ps
  curl -f http://localhost/api/auth/health
  curl -f http://localhost/api/users/health
  curl -f http://localhost/graphql -X POST -d '{"query":"{__typename}"}'
  ```
- [ ] **Test lại từng loại API theo checklist Mục 4** — không chỉ test API vừa thay đổi, vì các service phụ thuộc lẫn nhau (VD: sửa auth-service phải test lại cả graphql-service vì nó gọi qua auth).
- [ ] **Kiểm tra log** của tất cả container xem có warning/error mới phát sinh không: `docker compose logs --tail=100`
- [ ] **Kiểm tra version matrix** (`docs/VERSION_MATRIX.md`) đã cập nhật đúng version mới chưa
- [ ] **Chạy CI trên GitHub** và xác nhận toàn bộ job trong `ci.yml` pass từ bước 13 trở đi; trước khi CI được triển khai, ghi rõ `N/A - roadmap step 13`, không được ghi `PASS`
- [ ] Nếu thay đổi liên quan đến gRPC proto: chạy kiểm tra breaking change (VD: `buf breaking` nếu có dùng Buf) trước khi generate lại code ở các service liên quan
- [ ] Nếu thay đổi liên quan đến DB schema: kiểm tra migration chạy được cả chiều up/down, backup dữ liệu test trước khi áp dụng

### 8.2 Checklist hậu kiểm khi deploy lên Cloud

- [ ] Sau khi CD chạy xong, kiểm tra production Compose trên deployment target — toàn bộ container ở trạng thái `Up`, không có container `Restarting`/`Exited`
- [ ] Gọi thử từng endpoint qua domain/IP public (không chỉ localhost)
- [ ] Kiểm tra log production qua deployment wrapper: `bash scripts/home-server-compose.sh logs`
- [ ] Nếu có lỗi: gọi cùng deployment script dưới host-wide lock với manifest rollback đã xác minh; manifest phải chứa immutable image digest hoặc commit SHA được registry bảo vệ, không thao tác trực tiếp với Compose hoặc mutable image reference
- [ ] Cập nhật kết quả hậu kiểm công khai trong `docs/VERIFICATION.md`; bằng chứng chi tiết chứa metadata môi trường phải giữ local và không commit

### 8.3 Mẫu ghi log hậu kiểm nội bộ (không commit dữ liệu môi trường nhạy cảm)

```text
Ngày: 2026-09-02
Thay đổi: Nâng cấp jsonwebtoken 9.0.0 -> 9.0.2 trong auth-service
Service bị ảnh hưởng trực tiếp: auth-service
Service cần test lại do phụ thuộc: graphql-service (gọi qua auth), websocket-service (dùng JWT xác thực kết nối)
Kết quả build lại: OK
Kết quả health-check toàn hệ thống: OK
Kết quả test lại theo checklist Mục 4: OK (auth, graphql, websocket)
Kết quả CI trên GitHub: PASS (run #124)
Kết quả sau deploy cloud: OK, không có container restart
Người thực hiện: <tên>
```

---

## 9. Ghi chú thu gọn so với bản blueprint gốc (dành cho việc trình bày/phỏng vấn)

Những phần sau **chủ động bỏ qua** ở quy mô đồ án internship, nhưng nên nêu là "định hướng mở rộng" khi trình bày:

- Kubernetes/EKS, Helm, ArgoCD — thay bằng Docker Compose + SSH deploy
- WAF, CloudFront/CDN — không cần ở quy mô demo
- Canary deployment, Blue/Green — chỉ dùng deploy trực tiếp qua CD
- TURN server tự host cho WebRTC — dùng STUN công khai của Google
- Chaos engineering, load test đầy đủ — thay bằng 1 test case cơ bản chứng minh chức năng đúng
- SonarQube/Trivy đầy đủ — có thể thêm bước lint/audit đơn giản trong CI nếu còn thời gian
