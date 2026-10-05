output "instance_id" {
  description = "EC2 instance identifier."
  value       = aws_instance.platform.id
}

output "public_ip" {
  description = "Stable Elastic IP for DNS and future TLS termination."
  value       = aws_eip.platform.public_ip
}

output "ssh_user" {
  description = "Restricted non-root account for SSH and deployments."
  value       = var.deploy_user
}

output "ssh_command" {
  description = "SSH command after the host key has been independently verified and added to known_hosts."
  value       = "ssh ${var.deploy_user}@${aws_eip.platform.public_ip}"
}

output "security_group_id" {
  description = "Security group attached to the EC2 instance."
  value       = aws_security_group.platform.id
}
