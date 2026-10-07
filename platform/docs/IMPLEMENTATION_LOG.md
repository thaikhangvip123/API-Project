# Implementation Log

> Chỉ ghi thay đổi kỹ thuật, cấu hình, phiên bản và kết quả xác minh của hệ thống. Không ghi danh tính bên thực hiện, công cụ nội bộ hoặc quá trình điều phối.

## 2026-10-07 - Chuẩn bị handoff sang Ubuntu 24.04

- Tách nhánh `linux-os` từ checkpoint hiện tại để tiếp tục trên Ubuntu 24.04 mà không thay đổi nhánh `main` dùng cho Windows.
- Nâng target Terraform EC2 từ Ubuntu 22.04 lên Ubuntu 24.04 LTS và bổ sung assertion cho tag hệ điều hành.
- Thêm bootstrap và readiness verification cho máy Ubuntu mới, gồm Docker Engine/Compose v2, Node.js 20 và Terraform 1.x.
- Chuẩn hóa Git line ending thành LF và executable bit cho shell script để clone trên Linux có thể chạy trực tiếp.
- Chuyển checkpoint bước 12 sang kế hoạch mới: tạo `.env`, PostgreSQL volume, SSH key và Terraform plan mới trên Ubuntu; không chuyển secret/runtime state từ Windows.
- Xác minh Terraform format/validate và test đạt 7/7, Compose local/production parse thành công, 59/59 test Node.js pass, Bash syntax pass và ShellCheck không có warning; runtime native Ubuntu và 9 test SOAP trên Python 3.11.6 được dành cho bước hậu kiểm sau khi clone.

## 2026-10-07 - Chuẩn bị home-server autostart

- Bổ sung Compose override để build tám application image trực tiếp trên Ubuntu home server, không phụ thuộc EC2 hoặc container registry khi reboot.
- Thêm production wrapper có host-wide lock, cô lập shell environment, kiểm tra file secret mode `0600` và tách rõ `deploy` khỏi boot-time `up`.
- Thêm installer tạo production secret/origin theo domain, bảo vệ volume khi mất file secret, build và health-check stack trước khi enable systemd.
- Cấu hình `internship-api-platform.service` chạy sau Docker/network và tự reconcile production Compose ở mỗi lần boot mà không build lại image.
- Giữ gateway loopback-only cho Cloudflare Tunnel; public access chỉ được bật sau khi tunnel riêng đã cấu hình và chạy dưới systemd.

## 2026-09-02 - Bước 1: Khởi tạo nền tảng

- Tạo cấu trúc `platform/` gồm Compose local/production, Nginx gateway, tám thư mục service, tài liệu vận hành/kiến trúc/version/checklist và placeholder cho hạ tầng/CI.
- Thiết lập nguyên tắc một container cho một trách nhiệm API và mạng Docker riêng `platform-net`.
- Tạo tài liệu kiến trúc, version, vận hành, kiểm chứng và lịch sử triển khai.

## 2026-09-05 - Bước 2: Auth REST + JWT

- Hoàn thiện `auth-service` với `/health`, `/register`, `/login`, `/verify`.
- JWT HS256 sử dụng `crypto` tích hợp của Node.js; mật khẩu được hash bằng PBKDF2.
- Bổ sung kiểm tra secret production, thời hạn token, request body và lỗi HTTP.
- Thêm Dockerfile, healthcheck, route `/api/auth/*`, README và test tự động.
- Sửa healthcheck dùng `127.0.0.1` thay cho `localhost` để tránh lỗi IPv4/IPv6 trong container.
- Xác minh image độc lập và luồng auth qua Nginx gateway; test auth đạt 7/7.

## 2026-09-09 - Bước 3: User REST CRUD

- Hoàn thiện `user-service` với CRUD `/users` và PostgreSQL persistence qua Prisma 5.22.0.
- Thêm schema, migration khởi tạo bảng user, repository, HTTP adapter, Dockerfile và healthcheck.
- Bổ sung route gateway cho `/api/users`, `/api/users/health` và CRUD theo ID.
- Xác minh test logic/HTTP đạt 4/4 và dependency audit không có vulnerability.

## 2026-09-12 - Bước 4-5: gRPC và GraphQL

- Hoàn thiện `grpc-service` với protobuf user lookup, REST bridge tới `user-service` và gRPC health RPC.
- Pin `@grpc/grpc-js` 1.14.4 và `@grpc/proto-loader` 0.7.13; đồng bộ proto contract giữa các service.
- Hoàn thiện `graphql-service` với Apollo Server 5.5.1: query `users` gọi REST và query `user(id)` gọi gRPC.
- Thêm timeout cho upstream, map lỗi deadline/unavailable thành 503, ẩn lỗi nội bộ và trả HTTP 400 cho malformed JSON.
- Xác minh gRPC đạt 5/5, GraphQL đạt 9/9; lookup/list chạy thành công trong `platform-net` và qua gateway.

## 2026-09-29 - Bước 6: Socket.IO WebSocket

- Hoàn thiện `websocket-service` với browser chat client, broadcast, username, presence, bounded history và reconnect.
- Nâng Socket.IO server/client lên 4.8.4 để loại bỏ vulnerability của phiên bản cũ.
- Bổ sung bảo vệ malformed URL, acknowledgement không hợp lệ và trạng thái input thay đổi trong callback bất đồng bộ.
- Thêm admission control theo Origin cho Socket.IO handshake; production chỉ chấp nhận canonical HTTPS origins và từ chối wildcard.
- Test WebSocket đạt 12/12, gồm hai client, history, reconnect, malformed input và production-origin validation.

## 2026-09-29 - Bước 7: Webhook receiver

- Hoàn thiện `webhook-service` bằng Express 5.2.1 với HMAC-SHA256 trên raw body.
- Hỗ trợ header webhook/GitHub, xác thực event ID, payload limit và JSON validation.
- Thêm idempotency bounded theo TTL; event đang xử lý không bị expire/evict, duplicate đang xử lý trả 503 để retry.
- Từ chối compressed body để chữ ký luôn áp dụng trên đúng bytes truyền đến.
- Production bắt buộc webhook secret khác placeholder và dài tối thiểu 32 bytes.
- Test webhook đạt 12/12; dependency audit không có vulnerability.

## 2026-09-30 - Bước 8: SOAP

- Hoàn thiện `soap-service` trên Python 3.11.6, Spyne 2.14.0, lxml 6.1.3 và Gunicorn 23.0.0.
- Cung cấp health endpoint, WSDL và operation `NumberToWords` với giới hạn input và SOAP client fault.
- Điều chỉnh WSDL hoạt động đúng sau reverse proxy; thêm route `/soap` và `/soap/health`.
- Container chạy non-root bằng user `app`; Gunicorn access/error log xuất JSON.
- Xác minh WSDL và SOAP request qua gateway; test SOAP đạt 9/9.

## 2026-09-30 - Bước 9: WebRTC signaling

- Hoàn thiện `webrtc-signaling` bằng native browser WebRTC và `ws` 8.22.0.
- Cung cấp phòng hai peer, offer/answer/ICE relay, heartbeat cleanup, message rate limit, payload limit và outbound backpressure protection.
- Production bắt buộc canonical HTTPS Origin; browser client reset đầy đủ khi signaling disconnect.
- Thêm trang video call responsive, Google STUN config và các điều khiển camera/microphone/leave.
- Xác minh offer, answer và ICE qua Nginx gateway; test signaling đạt 10/10.
- Ghi nhận yêu cầu triển khai: camera/microphone từ thiết bị ngoài cần HTTPS; STUN-only có thể cần bổ sung TURN với NAT/firewall hạn chế.

## 2026-10-05 - Bước 10: Tích hợp toàn hệ thống

- Ghép đủ gateway, tám application service và PostgreSQL trong Compose; chỉ gateway publish port host.
- Bổ sung `USER node` cho các Node image còn lại; SOAP tiếp tục chạy bằng user `app`.
- Production Compose hỗ trợ `IMAGE_REGISTRY`/`IMAGE_TAG`, `restart: unless-stopped`, init process và Docker JSON log rotation `10m` x 3.
- Thay shared `env_file` production bằng allowlist biến môi trường theo từng service để giới hạn phạm vi secret.
- Bổ sung cấu hình production cho database password URL-safe/percent-encode và exact HTTPS origins.
- Thêm `.dockerignore` cho WebSocket, webhook, SOAP và WebRTC build context.
- Thêm `scripts/step10-smoke.mjs` với timeout, cleanup dữ liệu và kiểm tra REST/JWT, PostgreSQL CRUD, GraphQL REST + gRPC, Socket.IO, webhook, SOAP và WebRTC signaling.
- Full regression đạt 68/68; local và production Compose parse thành công; in-container gRPC healthcheck và syntax checks pass.
- Production Compose được xác minh bằng project/volume mới: migration Prisma chạy từ đầu, 10/10 container healthy, restart count bằng 0, smoke test đạt 9/9, non-root runtime và log rotation đúng cấu hình.
- Project/volume production test được dọn sau kiểm tra; local stack và PostgreSQL volume hiện có được khôi phục healthy.
- Tài liệu vận hành được tách rõ khỏi blueprint: blueprint chỉ mô tả thiết kế/roadmap, log này lưu lịch sử thay đổi, còn kết quả kiểm chứng công khai nằm trong `VERIFICATION.md`.

## 2026-10-05 - Chuẩn hóa tài liệu dự án

- Xóa nội dung trạng thái triển khai khỏi blueprint để file này chỉ còn thiết kế, checklist và roadmap.
- Rút gọn lịch sử triển khai thành các thay đổi kỹ thuật và kết quả xác minh, loại bỏ thông tin điều phối không thuộc trạng thái hệ thống.
- Viết lại `OPERATIONS.md` theo PowerShell, phân nhóm rõ lệnh khởi động và kiểm tra riêng cho từng chức năng từ bước 2 đến bước 10.
- Bổ sung hướng dẫn bảo toàn PostgreSQL volume, xử lý lỗi gateway, xem health/restart count và chạy smoke test toàn hệ thống.
- Chuẩn hóa blueprint về checklist mẫu chưa đánh dấu và loại bỏ `down -v` khỏi nhóm lệnh vận hành hằng ngày.

## 2026-10-05 - Giảm lộ cấu hình và tự động hóa khởi động local

- Loại bỏ toàn bộ file môi trường mẫu khỏi repository và mở rộng ignore rule để ngăn add nhầm các biến thể `.env.*` hoặc `*.env.*`.
- Chuyển local Compose từ shared `env_file` sang allowlist biến theo từng service, giới hạn secret chỉ tới container cần sử dụng.
- Thêm `platform/start.sh` để kiểm tra Docker, sinh secret local ngẫu nhiên khi cần, validate Compose, build và chờ toàn bộ hệ thống healthy trong một lần chạy.
- Chuẩn hóa script cho native Ubuntu/Linux; ghi `.env` atomically với mode `0600`, cô lập shell override và không in secret ra terminal.
- Giữ nguyên `.env` và PostgreSQL volume khi chạy lại; từ chối sinh credential mới khi volume cũ còn tồn tại nhưng `.env` bị mất.
- Chuyển khóa `flock` sang `/run/lock` để mọi checkout dùng chung Docker Compose project trên cùng host được tuần tự hóa.
- Mở rộng cùng wrapper với `--stop`, `--restart` và `--rebuild` để thao tác thay đổi runtime không bỏ qua lock/cấu hình an toàn.
- Bắt buộc production Compose fail-fast khi thiếu credential hoặc exact origin.

## 2026-10-05 - Chuẩn hóa repository công khai

- Loại file điều phối agent và bằng chứng hậu kiểm chi tiết khỏi snapshot công khai; giữ chúng local bằng `.gitignore`.
- Thay tài liệu hậu kiểm nội bộ bằng `VERIFICATION.md` chỉ chứa kết quả tổng hợp, không chứa model, router, credential error, username, hostname hoặc đường dẫn máy.
- Bổ sung ignore rule cho cloud credentials, Terraform state/variables, private keys, local Compose override và mọi file example/sample/template.
- Chuẩn bị nhánh public orphan không kế thừa file hoặc commit metadata từ lịch sử phát triển nội bộ.
- Đổi production gateway sang loopback-only mặc định; mọi public deployment phải terminate TLS phía trước và chỉ redirect HTTP sang HTTPS.
- Chuẩn hóa rollback qua cùng deployment script có host-wide lock và manifest digest/commit SHA đã xác minh; loại bỏ thao tác Compose trực tiếp với mutable image reference.
- Hoàn thiện mã Terraform bước 12 cho EC2 Ubuntu 22.04: dùng default VPC/subnet, Elastic IP, volume gp3 mã hóa, IMDSv2, Security Group chỉ mở SSH cho một `/32` và HTTPS; HTTP mặc định đóng.
- Bootstrap Docker Engine/Compose v2 từ repository chính thức, tạo user `deploy` chỉ đăng nhập bằng SSH key, chặn root/password SSH và chuẩn bị thư mục release/shared cho các bước CD sau.
- Đã validate/test Terraform trên Windows và AWS CloudShell Linux (`7/7`), tạo live plan tại Singapore với `5 add, 0 change, 0 destroy`, sau đó chủ động dừng trước `apply` để kiểm soát credit. Chưa có EC2/EIP nào được tạo; checkpoint tiếp tục nằm trong `infrastructure/README.md`.

## 2026-10-05 - Bước 11: Cổng kiểm định trước hạ tầng

- Chạy lại toàn bộ test của tám service, đạt 68/68; kiểm tra SOAP dùng trực tiếp image Python 3.11.6 đã pin để đồng nhất với runtime triển khai.
- Phát hiện advisory mức cao trong `@grpc/grpc-js` 1.14.4 và nâng đồng bộ `grpc-service` cùng `graphql-service` lên bản exact 1.14.5; audit lại toàn bộ bảy service Node.js không còn vulnerability đã biết.
- Validate Compose, build lại tám application image, khởi động và restart toàn bộ stack; 10/10 container healthy và restart count không có bất thường.
- Chạy cross-protocol smoke test sau startup và sau restart, đều đạt 9/9 cho REST/JWT, PostgreSQL CRUD, GraphQL REST + gRPC, Socket.IO, webhook, SOAP và WebRTC signaling.
- Xác minh production Compose fail-fast khi thiếu secret/origin bắt buộc, render thành công với cấu hình hợp lệ và mặc định chỉ bind gateway tại `127.0.0.1:8080`.
- Quét toàn bộ lịch sử public bằng Gitleaks 8.24.3, không phát hiện secret; phần xác minh GitHub CI được giữ lại cho bước 13 theo đúng thứ tự roadmap.
- Làm rõ acceptance criterion của bước 11 là cổng local/repository trước hạ tầng; kiểm tra GitHub CI bắt đầu bắt buộc từ bước 13 và phải ghi `N/A`, không ghi `PASS`, khi workflow chưa tồn tại.
