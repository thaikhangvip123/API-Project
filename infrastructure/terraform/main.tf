data "aws_ami" "ubuntu_2404" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_key_pair" "deploy" {
  key_name_prefix = "${var.project_name}-"
  public_key      = trimspace(var.ssh_public_key)

  tags = {
    Name        = "${var.project_name}-deploy"
    Environment = var.environment
  }
}

resource "aws_instance" "platform" {
  ami                         = data.aws_ami.ubuntu_2404.id
  instance_type               = var.instance_type
  subnet_id                   = sort(data.aws_subnets.default.ids)[0]
  associate_public_ip_address = true
  key_name                    = aws_key_pair.deploy.key_name
  monitoring                  = false
  vpc_security_group_ids      = [aws_security_group.platform.id]
  user_data_replace_on_change = true

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    deploy_user        = var.deploy_user
    project_name       = var.project_name
    ssh_public_key_b64 = base64encode(trimspace(var.ssh_public_key))
  })

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "disabled"
  }

  credit_specification {
    cpu_credits = "standard"
  }

  root_block_device {
    delete_on_termination = true
    encrypted             = true
    volume_type           = "gp3"
    volume_size           = var.root_volume_size_gib

    tags = {
      Name        = "${var.project_name}-root"
      Environment = var.environment
    }
  }

  tags = {
    Name        = var.project_name
    Environment = var.environment
    OS          = "Ubuntu-24.04"
  }

  lifecycle {
    precondition {
      condition     = length(data.aws_subnets.default.ids) > 0
      error_message = "The selected region must have at least one default subnet in the default VPC."
    }
  }
}

resource "aws_eip" "platform" {
  domain = "vpc"

  tags = {
    Name        = "${var.project_name}-public-ip"
    Environment = var.environment
  }
}

resource "aws_eip_association" "platform" {
  allocation_id = aws_eip.platform.id
  instance_id   = aws_instance.platform.id
}
