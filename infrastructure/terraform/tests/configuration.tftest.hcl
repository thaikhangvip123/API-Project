mock_provider "aws" {
  mock_data "aws_vpc" {
    defaults = {
      id = "vpc-0123456789abcdef0"
    }
  }

  mock_data "aws_subnets" {
    defaults = {
      ids = ["subnet-0123456789abcdef0"]
    }
  }

  mock_data "aws_ami" {
    defaults = {
      id = "ami-0123456789abcdef0"
    }
  }

  mock_resource "aws_eip" {
    defaults = {
      id        = "eipalloc-0123456789abcdef0"
      public_ip = "203.0.113.10"
    }
  }
}

variables {
  ssh_public_key   = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC7QFhXJlY2WRvL+zcp1c5cK4xlbgnWQhNQ13l55d9Jh terraform-test"
  ssh_ingress_cidr = "198.51.100.24/32"
}

run "secure_defaults" {
  command = plan

  assert {
    condition     = aws_instance.platform.instance_type == "t3.small"
    error_message = "The default instance must meet the roadmap's t3.small minimum."
  }

  assert {
    condition     = aws_instance.platform.metadata_options[0].http_tokens == "required"
    error_message = "IMDSv2 must be required."
  }

  assert {
    condition     = aws_instance.platform.root_block_device[0].encrypted
    error_message = "The EC2 root volume must be encrypted."
  }

  assert {
    condition     = aws_instance.platform.root_block_device[0].delete_on_termination
    error_message = "The root volume must be deleted with the instance to avoid orphaned storage charges."
  }

  assert {
    condition     = aws_instance.platform.credit_specification[0].cpu_credits == "standard"
    error_message = "T3 CPU credits must use standard mode to avoid unlimited surplus-credit charges."
  }

  assert {
    condition     = !aws_instance.platform.monitoring
    error_message = "Paid EC2 detailed monitoring must remain disabled for this budget-limited deployment."
  }

  assert {
    condition     = length([for rule in aws_security_group.platform.ingress : rule if rule.from_port == 22 && rule.to_port == 22 && contains(rule.cidr_blocks, "198.51.100.24/32")]) == 1
    error_message = "SSH must be restricted to the configured operator /32."
  }

  assert {
    condition     = length([for rule in aws_security_group.platform.ingress : rule if rule.from_port == 80 && rule.to_port == 80]) == 0
    error_message = "HTTP must remain closed by default."
  }

  assert {
    condition     = length([for rule in aws_security_group.platform.ingress : rule if rule.from_port == 443 && rule.to_port == 443]) == 1
    error_message = "HTTPS must be available for the later TLS endpoint."
  }
}

run "http_redirect_opt_in" {
  command = plan

  variables {
    enable_http_redirect = true
  }

  assert {
    condition     = length([for rule in aws_security_group.platform.ingress : rule if rule.from_port == 80 && rule.to_port == 80]) == 1
    error_message = "Port 80 should open only after redirect mode is explicitly enabled."
  }
}

run "reject_root_deploy_user" {
  command = plan

  variables {
    deploy_user = "root"
  }

  expect_failures = [var.deploy_user]
}

run "reject_system_style_deploy_user" {
  command = plan

  variables {
    deploy_user = "_apt"
  }

  expect_failures = [var.deploy_user]
}

run "reject_ipv6_ssh_rule" {
  command = plan

  variables {
    ssh_ingress_cidr = "2001:db8::1/32"
  }

  expect_failures = [var.ssh_ingress_cidr]
}

run "encode_public_key_comment" {
  command = plan

  variables {
    ssh_public_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC7QFhXJlY2WRvL+zcp1c5cK4xlbgnWQhNQ13l55d9Jh Thai's laptop; touch /tmp/unsafe"
  }

  assert {
    condition     = !strcontains(nonsensitive(aws_instance.platform.user_data), "Thai's laptop")
    error_message = "The raw public-key comment must never be interpolated into the root bootstrap script."
  }
}

run "reject_unsupported_ecdsa_key" {
  command = plan

  variables {
    ssh_public_key = "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEC2 terraform-test"
  }

  expect_failures = [var.ssh_public_key]
}
