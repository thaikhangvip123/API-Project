# EC2 Infrastructure (Roadmap Step 12)

This directory provisions the Ubuntu host required by roadmap step 12. It does not deploy application images, configure GitHub Actions, or expose the loopback-bound production gateway; those remain steps 13-15.

On the `linux-os` branch, the active deployment target is the physical Ubuntu 24.04 home server documented at the repository root. This AWS module is retained for Terraform practice and as an optional reference deployment; do not run `terraform apply` for the self-hosted path.

## Provisioned resources

- Ubuntu Server 24.04 LTS EC2 instance (`t3.small` by default)
- encrypted 20 GiB gp3 root volume and IMDSv2-only metadata access
- standard T3 CPU credits and basic monitoring to prevent optional burst/monitoring charges
- stable Elastic IP
- EC2 key pair imported from an existing public key (private key never enters Terraform state)
- security group with SSH restricted to one operator `/32`, HTTPS enabled, and HTTP disabled by default
- non-root `deploy` account with key-only SSH access
- Docker Engine, Buildx, and Docker Compose v2 installed from Docker's official Ubuntu repository
- `/opt/internship-api-platform` release/shared directories for later CD steps

## Apply from native Ubuntu

Install Terraform 1.7+ and configure short-lived AWS credentials or an AWS profile. Never place credentials, private keys, state, or `.tfvars` files in Git.

```bash
cd infrastructure/terraform
terraform init
terraform fmt -check
terraform validate
terraform test

export TF_VAR_ssh_public_key="$(cat "$HOME/.ssh/internship-ec2-ubuntu24.pub")"
export TF_VAR_ssh_ingress_cidr="$(curl --fail --silent --show-error https://checkip.amazonaws.com)/32"
terraform plan -out=step12.tfplan
terraform apply step12.tfplan
```

The default AWS region is Singapore (`ap-southeast-1`). Override it with `TF_VAR_aws_region` when necessary. Terraform requires the selected region's default VPC and at least one default subnet.

## Verify SSH and bootstrap

Wait for EC2 status checks and cloud-init to finish. Verify the SSH host-key fingerprint through a trusted AWS channel before adding it to `~/.ssh/known_hosts`; do not blindly accept a changed or unknown key.

```bash
terraform output public_ip
SSH_IDENTITY_FILE="$HOME/.ssh/internship-ec2-ubuntu24" \
  bash ../scripts/verify-ec2.sh deploy "$(terraform output -raw public_ip)"
```

The verification requires the matching private key to be available to SSH (for example through `ssh-agent`). It checks the non-root account, cloud-init completion, Docker daemon access, Compose v2, and deployment directories.

The Elastic IP and running EC2 instance incur AWS charges. Use `terraform destroy` only when decommissioning is intentional and state is available; destroying the host is not part of the normal deployment workflow.

At the Singapore on-demand rates checked during step 12, the always-on baseline is approximately USD 24.84/month before data transfer (t3.small compute, 20 GiB gp3, and one in-use public IPv4). Stopping EC2 pauses compute charges, but the volume and public IPv4 continue to incur charges until released or destroyed.

## Resume checkpoint

Step 12 is intentionally paused before resource creation. No Terraform apply has run, no project-tagged EC2 instance or Elastic IP exists, and there is no Terraform state to migrate from Windows. The old saved plan is not a handoff artifact; create a fresh plan on Ubuntu 24.04 with the new SSH key and current public IP.

- Git branch: `linux-os`
- AWS region: `ap-southeast-1`
- Expected target OS: Ubuntu Server 24.04 LTS
- Suggested private key: `~/.ssh/internship-ec2-ubuntu24` (never uploaded or committed)
- Runtime variables: export them in the current shell or keep them in a private mode-`0600` tfvars file outside Git

Before resuming, verify AWS authentication and the current operator public IP, initialize this checkout, and create a new reviewed plan. Expect `5 add, 0 change, 0 destroy` while step 12 still has no state:

```bash
cd infrastructure/terraform
aws sts get-caller-identity >/dev/null
terraform init
export TF_VAR_ssh_public_key="$(cat "$HOME/.ssh/internship-ec2-ubuntu24.pub")"
export TF_VAR_ssh_ingress_cidr="$(curl --fail --silent --show-error https://checkip.amazonaws.com)/32"
terraform validate
terraform test
terraform plan -input=false -out=step12-ubuntu24.tfplan
```

Only after reviewing the refreshed plan should the operator run `terraform apply step12-ubuntu24.tfplan`, wait for cloud-init, and execute the SSH bootstrap verification with `SSH_IDENTITY_FILE="$HOME/.ssh/internship-ec2-ubuntu24"`.

## Security boundaries

- Port 22 accepts only `TF_VAR_ssh_ingress_cidr`, which must be one IPv4 `/32`.
- Port 443 is reserved for the trusted TLS terminator added in a later step.
- Port 80 opens only when `TF_VAR_enable_http_redirect=true`, and must then serve redirects only.
- Application and database ports are never opened in the EC2 security group.
- The production Compose gateway remains bound to `127.0.0.1:8080`; do not change it to a public HTTP bind.
- The `deploy` user has Docker access and therefore must be treated as a privileged deployment identity even though direct root SSH and password login are disabled.
