# Security Policy

## Secrets

Do not commit runtime environment files, cloud credentials, Terraform state, private keys, local Compose overrides, or generated configuration examples. The repository ignore rules cover the expected local paths, but contributors must still inspect every staged diff before pushing.

Production credentials must be supplied on the deployment host or through a secret manager. Rotate a credential immediately if it is ever committed, even if the commit is later removed from visible history.

## Reporting

Use GitHub private vulnerability reporting or a private security advisory for this repository. If that feature is unavailable, contact the repository owner through a private channel listed on the owner's GitHub profile. Do not open a public issue containing credentials, exploit payloads, private infrastructure addresses, or user data.

## Supported Scope

Security verification covers the local Ubuntu/Linux workflow and the Terraform controls introduced for the step 12 EC2 host. Live cloud verification, TLS termination, immutable image deployment, backup, and rollback controls will be completed and evidenced in their later roadmap steps.
