# Deploy runbook (staging / production)

VERSYS ships a Docker image to **GitHub Container Registry (GHCR)** and pulls it onto a Linux VPS via SSH.

## Architecture

| Piece | Role |
|-------|------|
| `Dockerfile` | Builds api/realtime/worker image |
| `docker-compose.deploy.yml` | Host stack: Postgres+PostGIS, Redis, api, realtime, worker |
| `scripts/deploy-remote.sh` | Migrate → seed (no demo users) → restart services |
| `deploy-staging.yml` | Push to `main` or manual → image `:staging` → SSH deploy |
| `deploy-prod.yml` | Manual + GitHub Environment approval → `:prod` / `:latest` |

## One-time host setup

1. Provision an Ubuntu 22.04+ VPS (2+ vCPU, 4GB RAM recommended).
2. Install Docker Engine: [Install Docker on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
3. Create deploy user and allow Docker without root as needed.
4. On the host:

```bash
mkdir -p ~/versys
# copy once from the repo (or let the workflow scp compose/script)
cp .env.deploy.example ~/versys/.env.deploy
nano ~/versys/.env.deploy   # set JWT, DB password, FCM, Termii, CORS…
```

## GitHub setup

### Environments

1. Repo → **Settings → Environments**
2. Create `staging` and `production`
3. On `production`, enable **Required reviewers** (manual approval gate)

Docs: [GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment)

### Secrets

Repo or environment secrets:

| Secret | Where | Purpose |
|--------|--------|---------|
| `STAGING_SSH_HOST` | staging env | VPS hostname/IP |
| `STAGING_SSH_USER` | staging env | SSH user |
| `STAGING_SSH_KEY` | staging env | Private key (PEM) for that user |
| `STAGING_SSH_PORT` | staging env | Optional, default 22 |
| `PROD_SSH_HOST` | production env | Prod VPS |
| `PROD_SSH_USER` | production env | |
| `PROD_SSH_KEY` | production env | |
| `PROD_SSH_PORT` | production env | Optional |
| `GHCR_PULL_USER` | repo | Optional; GitHub username for host `docker login` |
| `GHCR_PULL_TOKEN` | repo | PAT with `read:packages` for the host to pull private images |

Create a fine-grained or classic PAT: [GitHub Tokens](https://github.com/settings/tokens)  
Package permissions: [Working with GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

Generate an SSH deploy key pair locally:

```bash
ssh-keygen -t ed25519 -f versys-staging-deploy -C versys-staging
# public key → ~/.ssh/authorized_keys on the VPS
# private key → STAGING_SSH_KEY secret (full PEM contents)
```

### Package visibility

After the first successful push, open:

`https://github.com/users/<owner>/packages/container/package/versys`

(or under the org) and set visibility / grant the Actions role access if needed.

## Deploy flow

**Staging:** merge to `main` (or **Actions → deploy-staging → Run workflow**).  
If SSH secrets are missing, the image still publishes; remote deploy is skipped with a warning.

**Production:** **Actions → deploy-prod → Run workflow** → approve the `production` environment.

## Smoke check

```bash
curl -sS https://<staging-host>:3000/v1/health
curl -sS https://<staging-host>:3000/v1/ready
```

Put a reverse proxy (Caddy/Nginx) in front for TLS when you have a domain.

## Rollback

Redeploy a previous image tag on the host:

```bash
export VERSYS_IMAGE=ghcr.io/<owner>/versys:staging-<older-sha>
~/versys/scripts/deploy-remote.sh
```
