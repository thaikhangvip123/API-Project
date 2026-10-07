# API Project - Ubuntu 24.04 Handoff

Repository nay duoc tach thanh hai huong lam viec de khong lam mat checkpoint hien tai:

- `main`: giu nguyen checkpoint tren Windows tai commit `428a1a7`.
- `linux-os`: nhanh tiep tuc phat trien va van hanh tren native Ubuntu 24.04 LTS.

Trang thai hien tai: buoc 11 da hoan thanh; `linux-os` chon may Ubuntu 24.04 tai nha lam production target. Home-server runtime khong can AWS. Ma Terraform EC2 van duoc giu de hoc va tham khao, nhung khong `apply` trong luong self-host.

Codex hoac nguoi tiep tuc du an tren Ubuntu phai doc `AGENTS.md` va `UBUNTU_HANDOFF.md` truoc khi thay doi repository.

## Chuyen sang Ubuntu 24.04

Tren Ubuntu moi, chi can cai Git truoc khi clone:

```bash
sudo apt-get update
sudo apt-get install -y git
cd "$HOME"
git clone --branch linux-os --single-branch https://github.com/thaikhangvip123/API-Project.git
cd API-Project
bash scripts/bootstrap-ubuntu-24.04.sh
```

Bootstrap se cau hinh repository chinh thuc cua Docker, HashiCorp va NodeSource, sau do cai Docker Engine/Compose v2, Terraform 1.x, Node.js 20 va cac cong cu kiem tra can thiet. Nen doc script truoc khi chay vi script su dung `sudo` de thay doi package repository cua may.

Dang xuat va dang nhap lai neu bootstrap vua them user vao group `docker`, sau do:

```bash
cd "$HOME/API-Project"
bash scripts/verify-ubuntu-24.04.sh
```

Neu muon kiem tra development stack truoc khi cai home server production, chay tuy chon:

```bash
cd platform
bash start.sh
bash start.sh --stop
```

Lan chay `start.sh` dau tien se tao `platform/.env` moi bang secret ngau nhien va tao PostgreSQL volume moi. Khong sao chep `.env`, Docker volume, `node_modules`, `.terraform`, file `*.tfplan` hoac credential tu Windows sang Ubuntu.

## Tuy chon: tao SSH key cho bai thuc hanh AWS

Tao key rieng tren Ubuntu va dat passphrase khi `ssh-keygen` yeu cau:

```bash
install -d -m 0700 "$HOME/.ssh"
ssh-keygen -t ed25519 -a 100 \
  -f "$HOME/.ssh/internship-ec2-ubuntu24" \
  -C "internship-api-ubuntu24"
chmod 0600 "$HOME/.ssh/internship-ec2-ubuntu24"
chmod 0644 "$HOME/.ssh/internship-ec2-ubuntu24.pub"
```

Private key chi nam trong `~/.ssh`; khong copy vao repository va khong commit vao Git.

## Tuy chon: kiem tra Terraform AWS

Phan nay khong can cho home server. Chi thuc hien khi chu dong hoc AWS va da cai AWS CLI, cau hinh credential ngan han hoac AWS profile:

```bash
cd "$(git rev-parse --show-toplevel)/infrastructure/terraform"
terraform init
terraform fmt -check
terraform validate
terraform test

export TF_VAR_ssh_public_key="$(cat "$HOME/.ssh/internship-ec2-ubuntu24.pub")"
export TF_VAR_ssh_ingress_cidr="$(curl --fail --silent --show-error https://checkip.amazonaws.com)/32"
terraform plan -input=false -out=step12-ubuntu24.tfplan
```

Dung lai de review plan. Ky vong cua checkpoint hien tai la `5 add, 0 change, 0 destroy`. Chi chay `terraform apply step12-ubuntu24.tfplan` sau khi da xac nhan AWS account, region, chi phi va dia chi IP `/32`.

Chi tiet van hanh nam trong `platform/docs/OPERATIONS.md`; chi tiet ha tang nam trong `infrastructure/README.md`.

## Home server tu khoi dong sau reboot

Sau khi da clone tren Ubuntu 24.04, chay bootstrap va co domain du kien cho Cloudflare Tunnel, cai production stack cung systemd unit. Neu da chay development stack tuy chon o tren, dung no truoc:

```bash
cd "$(git rev-parse --show-toplevel)/platform"
bash start.sh --stop
```

Sau do cai production stack:

```bash
cd "$(git rev-parse --show-toplevel)"
bash scripts/install-home-server-autostart.sh demo.example.com
```

Installer se tao `platform/.env.production` mode `0600`, build cac application image tai may nha, khoi dong production Compose va enable `internship-api-platform.service`. Sau cac lan reboot tiep theo, Docker va toan bo container se tu khoi dong ma khong can mo terminal hay VS Code.

Kiem tra:

```bash
systemctl status internship-api-platform.service
bash scripts/home-server-compose.sh status
curl --fail http://127.0.0.1:8080/health
```

Sau lan reboot thu dau tien, xac minh application autostart:

```bash
bash scripts/verify-home-server-autostart.sh
```

Sau khi da cai Cloudflare Tunnel, xac minh ca domain public:

```bash
bash scripts/verify-home-server-autostart.sh https://demo.example.com
```

Production gateway van chi bind `127.0.0.1:8080`. Thiet bi ngoai chi truy cap duoc sau khi Cloudflare Tunnel da duoc cau hinh va `cloudflared.service` duoc enable. Home-server runtime khong su dung EC2, Elastic IP hay bat ky tai nguyen AWS nao; ma Terraform AWS duoc giu lai chi de hoc va lam deployment target tham khao.
