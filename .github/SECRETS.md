# GitHub Actions Secrets Required

Add these in your GitHub repo under Settings → Secrets and variables → Actions

## AWS credentials
AWS_ACCOUNT_ID          — your 12-digit AWS account ID
AWS_ACCESS_KEY_ID       — IAM user with ECR push + EKS deploy permissions
AWS_SECRET_ACCESS_KEY   — corresponding secret

## Staging environment
STAGING_DATABASE_URL    — PostgreSQL connection string for staging RDS
STAGING_API_URL         — e.g. https://api-staging.avail.app

## Production environment
PRODUCTION_DATABASE_URL — PostgreSQL connection string for production RDS

## Monitoring
DATADOG_API_KEY         — for deployment event notifications

## GitHub Environments
Create two environments in Settings → Environments:
  - staging    (no approval required)
  - production (require approval from 1+ reviewers)

## AWS Secrets Manager keys (populated separately)
avail/staging/database    → { url }
avail/staging/redis       → { url }
avail/staging/jwt         → { access_secret }
avail/staging/firebase    → { project_id, client_email, private_key }
avail/staging/aws         → { sns_sender_id }

avail/production/...      (same structure)

## ECR Repositories to create (one per service)
avail-auth-service
avail-groups-service
avail-status-service
avail-notification-service
avail-websocket-service
