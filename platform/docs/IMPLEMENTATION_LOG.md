# Implementation Log

> Ghi ngắn gọn sau mỗi lệnh/thao tác để biết việc gì đã làm, kết quả ra sao, và tránh lặp lại.

## 2026-09-02

- `Get-Location`: xác nhận workspace hiện tại là `E:\API_Project`.
- `Get-ChildItem -Force`: workspace ban đầu chỉ có file blueprint `Internship_DevOps_7_API_Blueprint.md`.
- `Get-Content -Raw -LiteralPath 'Internship_DevOps_7_API_Blueprint.md'`: đọc blueprint, xác định bước 1 roadmap là thiết kế kiến trúc và tạo folder structure.
- `apply_patch`: tạo scaffold bước 1 gồm `platform/`, compose files, Nginx gateway config, tài liệu kiến trúc/vận hành/version/checklist, thư mục service và placeholder hạ tầng/CI.
- `Get-ChildItem -Recurse -Force -LiteralPath 'platform' | Select-Object FullName,Mode,Length`: kiểm tra lại cây thư mục `platform/`; xác nhận các file/thư mục scaffold đã được tạo.
- `git status --short`: không chạy được vì `E:\API_Project` chưa phải Git repository; chưa có `.git` để Git theo dõi thay đổi.
- `apply_patch`: chuyển log triển khai vào `platform/docs/IMPLEMENTATION_LOG.md` để đúng cấu trúc tài liệu của blueprint.
- `Get-ChildItem -Force -LiteralPath 'platform/docs'`: xác nhận `ARCHITECTURE.md`, `VERSION_MATRIX.md`, `OPERATIONS.md`, `POST_UPDATE_CHECKLIST.md`, và `IMPLEMENTATION_LOG.md` đều có trong `platform/docs`.

## 2026-09-05

- `docker compose -f platform\docker-compose.yml config`: phát hiện Compose chưa parse được vì thiếu `platform\.env`.
- `apply_patch`: thêm `platform\.env` local từ `.env.example`, thêm `.gitignore`, bổ sung `expose`/healthcheck cho Compose, và chỉnh gateway để resolve service tại request time.
- `docker compose -f platform\docker-compose.yml config --quiet`: local Compose parse OK.
- `docker compose -f platform\docker-compose.prod.yml config --quiet`: prod Compose parse OK.
- `docker run --rm ... nginx -t`: chưa chạy được vì Docker Desktop daemon chưa bật trên máy.
- `apply_patch`: triển khai roadmap bước 2 cho `auth-service` gồm REST endpoints `/health`, `/register`, `/login`, `/verify`, JWT HS256, password hashing bằng PBKDF2, Dockerfile, service README, `.env.example`, và test tự động.
- `npm test`: ban đầu `node --test` bị `spawn EPERM` trong sandbox; đổi script sang `node test/run-tests.js` để import test trực tiếp trong cùng process.
- `npm test`: pass 6/6 test cho auth logic và HTTP API.
- `node --check src\auth.js`, `node --check src\http.js`, `node --check src\server.js`: pass.
- `npm start` với biến môi trường local: service chạy thành công ở port 3000, log JSON ra console.
- Smoke test HTTP local: `/health`, `/register`, `/login`, `/verify` đều OK.
- `npm ci --omit=dev`: pass, không có vulnerability.
- `docker build -t internship/auth-service:0.1.0 .`: chưa chạy được vì Docker Desktop daemon chưa bật; để người dùng xác nhận lại bằng Docker trên máy.
- `docker info` ngoài sandbox: Docker Desktop daemon truy cập OK.
- `docker build -t internship/auth-service:0.1.0 .`: build độc lập OK.
- `docker run -d --rm --name auth-service-smoke-20260905 -p 3000:3000 --env-file .env.example internship/auth-service:0.1.0`: chạy container độc lập OK.
- Smoke test Docker trực tiếp qua `127.0.0.1:3000`: `/health`, `/register`, `/login`, `/verify` đều OK.
- `docker compose up -d --build auth-service gateway`: build/start qua Compose OK.
- `docker inspect ... .State.Health`: phát hiện healthcheck ban đầu unhealthy do `localhost` trong container trả connection refused.
- `apply_patch`: đổi healthcheck gateway/auth-service từ `localhost` sang `127.0.0.1` trong local/prod compose.
- `docker compose up -d --build --force-recreate auth-service gateway`: recreate OK.
- `docker compose ps auth-service gateway`: cả hai container `healthy`.
- Smoke test qua gateway `http://127.0.0.1/api/auth/*`: `/health`, `/register`, `/login`, `/verify` đều OK.

## 2026-09-09

- `apply_patch`: triển khai roadmap bước 3 cho `user-service`: CRUD endpoints, Prisma/PostgreSQL schema, migration ban đầu, Dockerfile, test tự động, README, và Compose healthcheck.
- `node --check`: pass cho tất cả source file của `user-service`.
- `npm test`: pass 4/4 test cho CRUD logic và HTTP API với repository test trong bộ nhớ.
- `npm install --package-lock-only --ignore-scripts`: không tạo được lock file vì sandbox không có quyền mạng.
- Yêu cầu quyền npm và Docker: bị từ chối do lỗi xác thực cục bộ của approval service; package install, Docker build, migration, và smoke test PostgreSQL được ghi nhận là pending trong checklist hậu kiểm.
- `apply_patch`: thêm route chính xác `/api/users` vào Nginx để endpoint liệt kê user trong hướng dẫn vận hành hoạt động không cần dấu gạch chéo cuối.
- User-run verification: `npm install` hoàn tất với 0 vulnerabilities; Docker Compose tạo gateway thành công; hai API qua gateway trả HTTP `200`.

## 2026-09-12

- `apply_patch`: bắt đầu roadmap bước 5 cho `graphql-service`: Apollo Server/Express endpoint, REST client tới user-service, gRPC client tới grpc-service, Dockerfile, proto contract copy, README, Compose readiness/healthcheck, và unit tests.
- `node --check`: pass cho `graphql-service/src/clients.js`, `resolvers.js`, và `server.js`.
- `docker compose -f platform/docker-compose.yml config --quiet` và prod variant: parse OK; sandbox chỉ cảnh báo không đọc được Docker user config.
- `npm install`: sandbox không tạo được dependency hoặc `package-lock.json`; yêu cầu elevated bị approval service từ chối do `9Router` trả `404 No active credentials for provider: openai`. `npm test`, Docker build, và runtime smoke test bước 5 đang chờ chạy trên host của người dùng.
- `apply_patch`: primary-agent review phát hiện hai lỗi mức medium: GraphQL input lỗi bị trả là internal error và gRPC dependency dùng version range mở. Đã map input lỗi sang `BAD_USER_INPUT` và pin `@grpc/grpc-js` ở `1.14.4`, đồng bộ lockfile/version matrix.
- Kiểm tra runtime: sandbox không có quyền truy cập Docker pipe; gateway không lắng nghe tại `127.0.0.1:80` tại thời điểm kiểm tra nên không thể xác nhận container đang chạy.
- `apply_patch`: bắt đầu roadmap bước 4 cho `grpc-service`: protobuf user lookup, REST bridge tới user-service, gRPC health RPC, Dockerfile, README, và test tự động.
- `npm test`: pass 5/5 cho user REST bridge và gRPC handlers sau khi sửa đăng ký method lower-camel-case của proto-loader.
- `npm install --package-lock-only`: bị chặn vì sandbox không có quyền truy cập npm registry/cache; lock file, Docker build và smoke test gRPC đang pending.
- User-run verification: Docker Compose reports `postgres`, `user-service`, and `grpc-service` healthy; `grpcurl` calls to `ListUsers` and `GetUser` succeeded from `platform-net`.

## 2026-09-29

- `primary-agent review`: rà soát blueprint, rule bắt buộc, toàn bộ source/config/dependency tree đã triển khai từ bước 1 đến bước 5.
- `apply_patch`: sửa Nginx gateway: `/api/users/health` được chuyển riêng thành `/health`; mọi CRUD theo ID `/api/users/:id` được chuyển đúng thành `/users/:id`.
- `apply_patch`: đồng bộ mốc tiến độ trong checklist hậu kiểm sang roadmap bước 5.
- `apply_patch`: đồng bộ Architecture, Operations, và checklist với runtime GraphQL đã xác nhận qua gateway.
- `npm test`: chạy lại toàn bộ service đã triển khai; auth-service 7/7, user-service 4/4, grpc-service 5/5, graphql-service 9/9 đều pass.
- `npm audit --omit=dev`: user-service, grpc-service, và graphql-service đều báo 0 vulnerabilities.
- `docker compose config --quiet`: local và production Compose đều parse thành công; `node --check`, `git diff --check`, và kiểm tra hai bản proto giống hệt đều pass.
- `apply_patch`: tách GraphQL HTTP adapter để test độc lập; sửa malformed JSON thành HTTP 400; ẩn lỗi upstream nội bộ; map gRPC deadline/unavailable thành 503; validate timeout; đồng bộ proto; thêm fallback timeout cho grpc-service.
- `apply_patch`: tăng production JWT guard, từ chối secret placeholder/ngắn hơn 32 byte và duration bằng 0 hoặc overflow; bổ sung test hồi quy.
- `multi-agent review`: không chạy được. Alias `cx/gpt-5.6-luna-review` không được runtime nhận diện; reviewer fallback tiếp tục lỗi `404 No active credentials for provider: openai` từ 9router.
- `docker info` và cleanup cache tạm ngoài sandbox: không chạy được vì approval service gặp cùng lỗi credential; thêm `.codex-tmp/` vào `.gitignore` để cache không làm bẩn Git status.
