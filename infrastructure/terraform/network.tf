data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

resource "aws_security_group" "platform" {
  name_prefix = "${var.project_name}-"
  description = "Minimal ingress for the API platform EC2 host"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH from the operator current public IP"
    protocol    = "tcp"
    from_port   = 22
    to_port     = 22
    cidr_blocks = [var.ssh_ingress_cidr]
  }

  ingress {
    description = "HTTPS endpoint"
    protocol    = "tcp"
    from_port   = 443
    to_port     = 443
    cidr_blocks = var.https_ingress_cidrs
  }

  dynamic "ingress" {
    for_each = var.enable_http_redirect ? [1] : []

    content {
      description = "HTTP redirect to HTTPS only"
      protocol    = "tcp"
      from_port   = 80
      to_port     = 80
      cidr_blocks = var.https_ingress_cidrs
    }
  }

  egress {
    description = "Package, registry, DNS, and application outbound traffic"
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "${var.project_name}-ec2"
    Environment = var.environment
  }
}
