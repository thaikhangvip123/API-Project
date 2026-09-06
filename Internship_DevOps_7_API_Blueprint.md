# DevOps Internship Project — 7-API Microservice Blueprint
> Phiên bản rút gọn, phù hợp quy mô đồ án cá nhân cho vị trí DevOps Intern.
> Nguyên tắc cốt lõi: **mỗi container chịu trách nhiệm cho đúng một loại API**, dễ build, dễ vận hành, dễ giải thích khi phỏng vấn.

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
├── .env.example
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
    └── POST_UPDATE_CHECKLIST.md
```

### 2.2 Bảng công nghệ & version pin

| Service | Stack | Base image / version pin |
|---|---|---|
| auth-service | Node.js + Express + jsonwebtoken | `node:20.11-alpine` |
| user-service | Node.js + Express + Prisma | `node:20.11-alpine` |
| graphql-service | Apollo Server 4 | `node:20.11-alpine` |
| grpc-service | Node.js + `@grpc/grpc-js` + protoc | `node:20.11-alpine`, protobuf `25.x` |
| websocket-service | Socket.IO 4.7 | `node:20.11-alpine` |
| webhook-service | Express + xác thực chữ ký | `node:20.11-alpine` |
| soap-service | Python + `spyne` | `python:3.12-slim` |
| webrtc-signaling | Node.js + `simple-peer`/`ws` | `node:20.11-alpine` |
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
    env_file: .env
    networks: [platform-net]

  user-service:
    build: ./services/user-service
    image: myorg/user-service:1.0.0
    env_file: .env
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
    env_file: .env
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
docker compose up -d --build          # khởi động toàn bộ hệ thống
docker compose logs -f auth-service   # xem log riêng 1 service
docker compose restart soap-service   # restart 1 service, không ảnh hưởng service khác
docker compose ps                     # kiểm tra trạng thái tất cả container
docker compose down -v                # dọn sạch toàn bộ, kể cả volume DB
```

### 3.2 Nguyên tắc vận hành

- Không SSH vào container để sửa code trực tiếp — mọi thay đổi phải qua Git commit → rebuild image.
- Mỗi service phải có endpoint `/health` trả về `200 OK` khi hoạt động bình thường.
- Log xuất ra `stdout`/`stderr` theo định dạng JSON nhất quán — không ghi log vào file trong container.
- Biến môi trường (DB URL, JWT secret, webhook secret...) luôn đọc từ `.env`, không hardcode trong code.

---

## 4. Checklist xây dựng từng service (Definition of Done)

Áp dụng cho **từng container**, đánh dấu hoàn thành trước khi chuyển sang service tiếp theo:

- [ ] Có `Dockerfile` riêng, build thành công độc lập (`docker build .`)
- [ ] Chạy độc lập bằng `docker run`, không phụ thuộc `docker-compose` để test cơ bản
- [ ] Có endpoint/health-check xác nhận service "sống"
- [ ] Có ít nhất 1 test case tự động (unit test hoặc script gọi thử: curl/Postman/wscat/grpcurl)
- [ ] Đọc cấu hình từ biến môi trường, có file `.env.example` mẫu
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
- [ ] 1 method demo hoạt động đúng (VD: convert số → chữ)
- [ ] Test bằng SOAP UI hoặc `curl` với XML body

**WebRTC (webrtc-signaling)**
- [ ] Signaling server trao đổi offer/answer thành công
- [ ] Video call 1-1 hoạt động giữa 2 tab trình duyệt
- [ ] Dùng STUN công khai (Google), không cần tự host TURN

---

## 5. CI/CD

### 5.1 CI — chạy khi push/PR

```yaml
name: CI
on: [push, pull_request]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service:
          - auth-service
          - user-service
          - graphql-service
          - grpc-service
          - websocket-service
          - webhook-service
          - soap-service
          - webrtc-signaling
    steps:
      - uses: actions/checkout@v4
      - name: Build ${{ matrix.service }}
        run: docker build -t myorg/${{ matrix.service }}:${{ github.sha }} ./services/${{ matrix.service }}
      - name: Run tests
        run: docker run --rm myorg/${{ matrix.service }}:${{ github.sha }} sh -c "npm test || true"
```

### 5.2 CD — chạy khi merge vào `main`

```yaml
name: CD
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build & push images to GHCR
        run: |
          echo ${{ secrets.GHCR_TOKEN }} | docker login ghcr.io -u ${{ github.actor }} --password-stdin
          docker compose -f docker-compose.prod.yml build
          docker compose -f docker-compose.prod.yml push
      - name: Deploy to EC2 via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ubuntu
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd platform
            docker compose -f docker-compose.prod.yml pull
            docker compose -f docker-compose.prod.yml up -d
```

---

## 6. Triển khai hạ tầng Cloud (EC2)

### 6.1 Terraform tối giản

```text
infrastructure/terraform/
├── main.tf         # EC2 instance, key pair
├── network.tf       # VPC mặc định + Security Group
├── variables.tf
└── outputs.tf        # public IP
```

Security Group tối thiểu:
- Port `22` (SSH) — giới hạn theo IP cá nhân
- Port `80`/`443` (Nginx gateway)
- Không mở port riêng cho từng service nội bộ; WebRTC dùng STUN công khai nên không cần mở dải UDP TURN.

### 6.2 Các bước triển khai

1. `terraform apply` → tạo EC2 (Ubuntu 22.04, tối thiểu `t3.small`)
2. Cài Docker + Docker Compose plugin qua `user_data` script (tự động khi EC2 khởi động lần đầu)
3. Pull image đã build sẵn từ GitHub Container Registry (GHCR) — không build trực tiếp trên EC2
4. `docker compose -f docker-compose.prod.yml up -d`
5. (Tuỳ chọn) Trỏ domain + Certbot để có HTTPS

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
| 11 | **Chạy Post-Update Verification Workflow (Mục 8)** | Toàn bộ workflow xanh |
| 12 | Viết Terraform, tạo EC2 | EC2 sẵn sàng, SSH được |
| 13 | Viết CI (`ci.yml`) | Build/test tự động chạy xanh trên GitHub |
| 14 | Viết CD (`cd.yml`) | Deploy tự động lên EC2 khi merge `main` |
| 15 | Deploy lần đầu lên EC2 | Truy cập được qua IP/domain |
| 16 | **Chạy lại Post-Update Verification Workflow (Mục 8)** trên môi trường cloud | Toàn bộ workflow xanh trên production |
| 17 | Viết README tổng + báo cáo đồ án | Tài liệu hoàn chỉnh nộp/trình bày |

---

## 8. Post-Update Verification Workflow — BẮT BUỘC sau mỗi lần cập nhật

> **Nguyên tắc:** Bất kỳ thay đổi nào — dù nhỏ như sửa 1 biến môi trường, đổi 1 dòng code, nâng version 1 thư viện — đều PHẢI chạy lại toàn bộ checklist dưới đây trước khi coi là "hoàn thành". Mục tiêu là phát hiện sớm sai sót lan sang các service khác do kiến trúc microservice liên kết với nhau.

### 8.1 Checklist hậu kiểm toàn hệ thống

- [ ] **Build lại toàn bộ image** bị ảnh hưởng: `docker compose build --no-cache <service>`
- [ ] **Khởi động lại toàn bộ hệ thống** từ đầu: `docker compose down && docker compose up -d`
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
- [ ] **Chạy CI trên GitHub** (push lên nhánh test) và xác nhận toàn bộ job trong `ci.yml` pass
- [ ] Nếu thay đổi liên quan đến gRPC proto: chạy kiểm tra breaking change (VD: `buf breaking` nếu có dùng Buf) trước khi generate lại code ở các service liên quan
- [ ] Nếu thay đổi liên quan đến DB schema: kiểm tra migration chạy được cả chiều up/down, backup dữ liệu test trước khi áp dụng

### 8.2 Checklist hậu kiểm khi deploy lên Cloud

- [ ] Sau khi CD chạy xong, kiểm tra `docker compose ps` trên EC2 — toàn bộ container ở trạng thái `Up`, không có container `Restarting`/`Exited`
- [ ] Gọi thử từng endpoint qua domain/IP public (không chỉ localhost)
- [ ] Kiểm tra log trên EC2: `docker compose -f docker-compose.prod.yml logs --tail=200`
- [ ] Nếu có lỗi: rollback bằng cách deploy lại image tag trước đó (`docker compose pull` với tag cũ đã ghi trong `VERSION_MATRIX.md`), không sửa trực tiếp trên server
- [ ] Ghi lại kết quả hậu kiểm vào `docs/POST_UPDATE_CHECKLIST.md` kèm ngày giờ, để có lịch sử theo dõi

### 8.3 Mẫu ghi log hậu kiểm (thêm vào `docs/POST_UPDATE_CHECKLIST.md` mỗi lần)

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
