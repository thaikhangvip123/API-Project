variable "aws_region" {
  description = "AWS region used for the EC2 deployment."
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Short name used for AWS resource names and tags."
  type        = string
  default     = "internship-api-platform"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,31}$", var.project_name))
    error_message = "project_name must be 3-32 lowercase letters, numbers, or hyphens and start with a letter."
  }
}

variable "environment" {
  description = "Deployment environment tag."
  type        = string
  default     = "production"
}

variable "instance_type" {
  description = "EC2 instance type. The application requires at least t3.small."
  type        = string
  default     = "t3.small"

  validation {
    condition     = contains(["t3.small", "t3.medium", "t3.large"], var.instance_type)
    error_message = "instance_type must be t3.small or larger within the supported t3 sizes."
  }
}

variable "root_volume_size_gib" {
  description = "Encrypted gp3 root volume size in GiB."
  type        = number
  default     = 20

  validation {
    condition     = var.root_volume_size_gib >= 20 && var.root_volume_size_gib <= 100
    error_message = "root_volume_size_gib must be between 20 and 100 GiB."
  }
}

variable "deploy_user" {
  description = "Non-root Linux account used for SSH and future deployments."
  type        = string
  default     = "deploy"

  validation {
    condition = (
      can(regex("^[a-z][a-z0-9_-]{0,30}$", var.deploy_user)) &&
      !contains(["root", "ubuntu", "daemon", "bin", "sys", "sync", "games", "man", "lp", "mail", "news", "uucp", "proxy", "www-data", "backup", "list", "irc", "gnats", "nobody", "systemd-network", "systemd-resolve", "messagebus", "syslog", "uuidd", "tcpdump", "sshd"], var.deploy_user)
    )
    error_message = "deploy_user must be a valid, dedicated non-system Linux username."
  }
}

variable "ssh_public_key" {
  description = "Existing OpenSSH public key installed for the EC2 key pair and deploy user."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^(ssh-ed25519|ssh-rsa) [A-Za-z0-9+/=]+(?: .*)?$", trimspace(var.ssh_public_key)))
    error_message = "ssh_public_key must be an RSA or ED25519 OpenSSH public key supported by EC2."
  }
}

variable "ssh_ingress_cidr" {
  description = "Single trusted public IPv4 CIDR allowed to reach SSH, normally YOUR_IP/32."
  type        = string

  validation {
    condition     = can(cidrnetmask(var.ssh_ingress_cidr)) && can(regex("/32$", var.ssh_ingress_cidr))
    error_message = "ssh_ingress_cidr must be a valid single-host IPv4 /32 CIDR."
  }
}

variable "https_ingress_cidrs" {
  description = "IPv4 CIDRs allowed to reach the future TLS endpoint."
  type        = list(string)
  default     = ["0.0.0.0/0"]

  validation {
    condition     = length(var.https_ingress_cidrs) > 0 && alltrue([for cidr in var.https_ingress_cidrs : can(cidrnetmask(cidr))])
    error_message = "https_ingress_cidrs must contain valid IPv4 CIDRs."
  }
}

variable "enable_http_redirect" {
  description = "Open port 80 only when a trusted proxy is configured to redirect HTTP to HTTPS."
  type        = bool
  default     = false
}
