# Operations

Tài liệu này hướng dẫn chạy và kiểm tra hệ thống trên native Ubuntu/Linux sau roadmap bước 10. Hạ tầng, Terraform, CI/CD và EC2 sẽ được bổ sung ở các bước sau.

## 1. Quy ước tài liệu

- `Internship_DevOps_7_API_Blueprint.md`: thiết kế, nguyên tắc, checklist và roadmap.
- `docs/IMPLEMENTATION_LOG.md`: thay đổi kỹ thuật và kết quả hệ thống.
- `docs/VERIFICATION.md`: kết quả kiểm chứng công khai đã loại metadata môi trường.
- `docs/VERSION_MATRIX.md`: version đang được pin.
- `docs/ARCHITECTURE.md`: kiến trúc và luồng giao tiếp hiện tại.

## 2. Yêu cầu Ubuntu

- Native Ubuntu 22.04/24.04 hoặc máy ảo Ubuntu. Không chạy project từ filesystem Windows/NTFS được mount vào Linux.
- Docker Engine và Docker Compose v2 đang hoạt động.
- User hiện tại có quyền chạy Docker mà không cần chuyển sang root shell.
- Bash, `od`, `stat`, `mktemp`, `flock` (gói `util-linux`), `/run/lock` có quyền ghi và port `80` chưa bị ứng dụng khác chiếm.
- Node.js 20 chỉ cần khi chạy full smoke script từ host.

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

Chạy sau khi toàn bộ stack healthy và host có Node.js 20:

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
