# Operations

Tài liệu này hướng dẫn chạy và kiểm tra hệ thống trên native Ubuntu/Linux. Từ roadmap bước 12, mọi thao tác Terraform, SSH, CI/CD và production phải chạy từ Ubuntu/Linux; Windows không còn là môi trường vận hành được hỗ trợ.

## 1. Quy ước tài liệu

- `Internship_DevOps_7_API_Blueprint.md`: thiết kế, nguyên tắc, checklist và roadmap.
- `docs/IMPLEMENTATION_LOG.md`: thay đổi kỹ thuật và kết quả hệ thống.
- `docs/VERIFICATION.md`: kết quả kiểm chứng công khai đã loại metadata môi trường.
- `docs/VERSION_MATRIX.md`: version đang được pin.
- `docs/ARCHITECTURE.md`: kiến trúc và luồng giao tiếp hiện tại.

## 2. Yêu cầu Ubuntu

- Native Ubuntu 24.04 LTS trên máy home server vật lý. Không dùng máy ảo và không chạy project từ filesystem Windows/NTFS được mount vào Linux.
- Docker Engine và Docker Compose v2 đang hoạt động.
- User hiện tại có quyền chạy Docker mà không cần chuyển sang root shell.
- Bash, `od`, `stat`, `mktemp`, `flock` (gói `util-linux`), `/run/lock` có quyền ghi và port `80` chưa bị ứng dụng khác chiếm.
- Node.js 22 (tối thiểu 22.11.0) chỉ cần khi chạy full smoke script từ host. Runtime Node.js trong container được pin độc lập.

Kiểm tra nhanh:

```bash
docker version
docker compose version
```

## 3. Khởi động toàn bộ bằng một file

Từ thư mục `platform`:

```bash
bash start.sh
```

`start.sh` tự động:

- xác nhận đang chạy trên Linux và project nằm trên filesystem Linux;
- giữ khóa `flock` để ngăn hai lần khởi tạo chạy đồng thời;
- kiểm tra Docker daemon và Docker Compose v2;
- tạo `.env` bằng secret ngẫu nhiên nếu chưa có;
- ghi file atomically và xác minh permission `0600`;
- từ chối tạo credential mới nếu volume PostgreSQL cũ còn tồn tại nhưng `.env` bị mất;
- loại bỏ biến cấu hình kế thừa từ shell trước khi Compose đọc `.env`;
- validate Compose, build image, start và chờ toàn bộ container healthy.

Script giữ nguyên `.env` và PostgreSQL volume khi chạy lại. `.env` bị Git ignore, không được commit, in ra log hoặc gửi công khai. Nếu mất `.env` trong khi volume database còn tồn tại, phải khôi phục đúng file cũ; mật khẩu mới không thể mở database đã khởi tạo bằng mật khẩu cũ.

### Home server production tự khởi động

`start.sh` dành cho local development. Home server public sử dụng production Compose cùng override build local và một systemd unit riêng:

```bash
cd "$(git rev-parse --show-toplevel)"
bash scripts/install-home-server-autostart.sh demo.example.com
```

Installer chỉ chạy trên native Ubuntu 24.04 và thực hiện một lần:

- tạo `platform/.env.production` bằng secret ngẫu nhiên, mode `0600`;
- từ chối tạo credential mới nếu PostgreSQL volume cũ còn tồn tại nhưng file production environment bị mất;
- giữ gateway tại `127.0.0.1:8080` cho Cloudflare Tunnel;
- build tám application image trực tiếp trên home server;
- khởi động production Compose và chờ healthcheck;
- cài, enable và start `internship-api-platform.service`.

Sau reboot, systemd gọi `scripts/home-server-compose.sh up`; không build hoặc pull lại image trong boot path. Container đã có `restart: unless-stopped`, còn systemd reconcile Compose và chờ toàn bộ stack healthy.

Lệnh vận hành:

```bash
sudo systemctl status internship-api-platform.service
sudo systemctl restart internship-api-platform.service
sudo systemctl stop internship-api-platform.service
sudo systemctl start internship-api-platform.service
sudo journalctl -u internship-api-platform.service -b
bash scripts/home-server-compose.sh status
bash scripts/home-server-compose.sh verify
bash scripts/home-server-compose.sh logs gateway
```

Sau khi reboot Ubuntu, xác minh systemd, Compose và local health:

```bash
bash scripts/verify-home-server-autostart.sh
```

Khi Cloudflare Tunnel đã được cài, kiểm tra thêm service và public HTTPS endpoint:

```bash
bash scripts/verify-home-server-autostart.sh https://demo.example.com
```

Sau khi cập nhật source, chủ động build và deploy lại:

```bash
bash scripts/home-server-compose.sh deploy
```

Cloudflare Tunnel có systemd service riêng. Application vẫn tự chạy nếu tunnel chưa được cài, nhưng thiết bị ngoài Internet chỉ truy cập được khi `cloudflared.service` cũng enabled và active. Home-server runtime này không cần AWS; Terraform AWS được giữ như bài thực hành và target tham khảo, không chạy `apply` cho luồng self-host.

Kết quả thành công hiển thị các địa chỉ chính:

```text
Health:  http://localhost/health
Chat:    http://localhost/ws/
WebRTC:  http://localhost/webrtc/
```

## 4. Chạy theo nhóm chức năng

Chỉ dùng các lệnh này sau khi `.env` đã được `start.sh` tạo lần đầu.

| Chức năng | Lệnh |
|---|---|
| Auth REST + JWT | `bash start.sh auth-service gateway` |
| User REST CRUD | `bash start.sh postgres user-service gateway` |
| gRPC nội bộ | `bash start.sh postgres user-service grpc-service` |
| GraphQL | `bash start.sh postgres user-service grpc-service graphql-service gateway` |
| Socket.IO chat | `bash start.sh websocket-service gateway` |
| Webhook | `bash start.sh webhook-service gateway` |
| SOAP | `bash start.sh soap-service gateway` |
| WebRTC signaling | `bash start.sh webrtc-signaling gateway` |

Gateway là container duy nhất publish host port. PostgreSQL và gRPC chỉ nằm trong `platform-net`.

## 5. Kiểm tra nhanh

```bash
curl --fail --silent --show-error http://localhost/health
curl --fail --silent --show-error http://localhost/api/auth/health
curl --fail --silent --show-error http://localhost/api/users/health
curl --fail --silent --show-error http://localhost/ws/health
curl --fail --silent --show-error http://localhost/webhook/health
curl --fail --silent --show-error http://localhost/soap/health
curl --fail --silent --show-error http://localhost/webrtc/health
```

GraphQL:

```bash
curl --fail --silent --show-error http://localhost/graphql \
  -H 'Content-Type: application/json' \
  --data '{"query":"query { users { id email name } }"}'
```

gRPC nội bộ:

```bash
docker compose exec -T grpc-service node src/healthcheck.js
```

Giao diện browser:

- Socket.IO chat: `http://<ubuntu-host>/ws/`
- WebRTC signaling: `http://<ubuntu-host>/webrtc/`

Camera/microphone từ thiết bị ngoài yêu cầu HTTPS. STUN có thể chưa đủ với NAT/firewall hạn chế; production thực tế có thể cần TURN.

## 6. Kiểm tra webhook có chữ ký

Yêu cầu `openssl`:

```bash
body='{"event":"deployment","status":"success"}'
webhook_secret="$(sed -n 's/^WEBHOOK_SECRET=//p' .env | head -n 1)"
signature="$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$webhook_secret" -hex | awk '{print $2}')"

curl --fail --silent --show-error http://localhost/webhook \
  -H 'Content-Type: application/json' \
  -H 'X-Webhook-Id: ubuntu-manual-001' \
  -H "X-Webhook-Signature: sha256=$signature" \
  --data-binary "$body"

unset webhook_secret signature body
```

Không dùng `set -x` khi thao tác secret vì Bash sẽ in expanded command ra terminal/log.

## 7. Kiểm tra SOAP

```bash
curl --fail --silent --show-error 'http://localhost/soap?wsdl'

curl --fail --silent --show-error http://localhost/soap \
  -H 'Content-Type: text/xml; charset=utf-8' \
  --data-binary @- <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="urn:internship:soap:number-words">
  <soapenv:Body>
    <tns:NumberToWords><tns:number>12045</tns:number></tns:NumberToWords>
  </soapenv:Body>
</soapenv:Envelope>
XML
```

## 8. Full smoke test

Chạy sau khi toàn bộ stack healthy và host có Node.js 22. Smoke script dùng client library của WebSocket và WebRTC trực tiếp từ hai service, vì vậy cài đúng dependency theo lockfile trước:

```bash
(cd services/websocket-service && npm ci)
(cd services/webrtc-signaling && npm ci)
```

Các thư mục `node_modules` này chỉ phục vụ test trên host, đã bị Git ignore và không được sao chép từ Windows. Sau đó chạy:

```bash
export WEBHOOK_SECRET="$(sed -n 's/^WEBHOOK_SECRET=//p' .env | head -n 1)"
node scripts/step10-smoke.mjs
unset WEBHOOK_SECRET
```

Kết quả mong đợi: `Smoke tests passed: 9/9`.

## 9. Log và xử lý lỗi

```bash
docker compose ps
docker compose logs --tail 200
docker compose logs --tail 100 user-service postgres
docker compose logs --follow websocket-service gateway
```

Nếu gateway trả `502/503`:

1. Dùng `docker compose ps` tìm upstream chưa healthy.
2. Xem log gateway và service tương ứng.
3. Chạy `docker compose config --quiet` để kiểm tra cấu hình.
4. Recreate đúng service bị lỗi, không xóa PostgreSQL volume.

Rebuild một service:

```bash
bash start.sh --rebuild webhook-service gateway
```

Các lệnh Compose thủ công dùng precedence mặc định của Compose, nên biến đã `export` trong shell có thể ghi đè `.env`. Không export credential trong shell vận hành; ưu tiên `bash start.sh [services...]` cho mọi thao tác start/recreate thông thường.

## 10. Dừng và reset

Dừng container nhưng giữ database:

```bash
bash start.sh --stop
```

Không cung cấp lệnh xóa volume trong workflow hằng ngày. Reset PostgreSQL phải là thao tác phục hồi riêng, có backup và xác nhận rõ dữ liệu sẽ bị xóa.

## 11. Sau mỗi thay đổi

1. Chạy test của service bị ảnh hưởng.
2. Chạy `bash start.sh` để validate, build, start và đợi healthcheck.
3. Chạy full smoke nếu thay đổi gateway, Compose hoặc contract liên service.
4. Rà log và restart count.
5. Ghi thay đổi kỹ thuật vào `IMPLEMENTATION_LOG.md`.
6. Cập nhật kết quả tổng hợp đã sanitize trong `VERIFICATION.md`; giữ log chi tiết ở file local bị Git ignore.

Không dùng tài liệu local này để tuyên bố môi trường cloud đã sẵn sàng. Production secret phải được cấp trên host hoặc qua secret manager ở bước hạ tầng; không tạo file mẫu trong repository.
