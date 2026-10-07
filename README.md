# API Project - Ubuntu 24.04 Handoff

Repository nay duoc tach thanh hai huong lam viec de khong lam mat checkpoint hien tai:

- `main`: giu nguyen checkpoint tren Windows tai commit `428a1a7`.
- `linux-os`: nhanh tiep tuc phat trien va van hanh tren native Ubuntu 24.04 LTS.

Trang thai hien tai: buoc 11 da hoan thanh; ma Terraform cua buoc 12 da san sang nhung chua chay `terraform apply`. Chua co EC2, Elastic IP hay Terraform state cua du an tren AWS.

## Chuyen sang Ubuntu 24.04

Tren Ubuntu moi, chi can cai Git truoc khi clone:

```bash
sudo apt-get update
sudo apt-get install -y git
git clone --branch linux-os --single-branch https://github.com/thaikhangvip123/API-Project.git
cd API-Project
bash scripts/bootstrap-ubuntu-24.04.sh
```

Bootstrap se cau hinh repository chinh thuc cua Docker, HashiCorp va NodeSource, sau do cai Docker Engine/Compose v2, Terraform 1.x, Node.js 20, AWS CLI v2 va cac cong cu kiem tra can thiet. Nen doc script truoc khi chay vi script su dung `sudo` de thay doi package repository cua may.

Dang xuat va dang nhap lai neu bootstrap vua them user vao group `docker`, sau do:

```bash
cd API-Project
bash scripts/verify-ubuntu-24.04.sh
cd platform
bash start.sh
```

Lan chay `start.sh` dau tien se tao `platform/.env` moi bang secret ngau nhien va tao PostgreSQL volume moi. Khong sao chep `.env`, Docker volume, `node_modules`, `.terraform`, file `*.tfplan` hoac credential tu Windows sang Ubuntu.

## Tao SSH key moi cho buoc 12

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

## Tiep tuc Terraform buoc 12

Sau khi cau hinh AWS credential ngan han hoac AWS profile:

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
