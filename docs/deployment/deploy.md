# Stratton Oakmont — Production Deployment (Raspberry Pi 4 + DuckDNS)

**Architecture:** Next.js backend + Angular frontend managed by Docker Compose, running on a Raspberry Pi 4 exposed via DuckDNS. nginx (inside Docker) serves the Angular SPA on port 80 and proxies `/api` to the Next.js container. PostgreSQL and the IBKR Client Portal Gateway run directly on the Pi host — not in Docker.

```
push to main → GitHub Actions → DuckDNS hostname → SSH into Pi → git pull → docker compose up
```

**Workflow file:** `.github/workflows/deploy.yml`

---

## Part 1 — Raspberry Pi Setup

### 1.1 Install the Operating System

- [ ] Flash **Raspberry Pi OS Lite (64-bit)** or **Ubuntu Server 22.04 LTS ARM64** using Raspberry Pi Imager
- [ ] Enable SSH during imaging (or create an empty `ssh` file on the boot partition)
- [ ] Connect via ethernet (more stable than Wi-Fi)

```bash
ssh pi@raspberrypi.local
```

---

### 1.2 System Update

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y git curl
```

---

### 1.3 Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, then verify:
docker --version
docker compose version
```

---

### 1.4 Install Node.js 20 (for Prisma migrations outside Docker if needed)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
node --version   # v20.x
```

---

### 1.5 Install PostgreSQL

```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Create user and database
sudo -u postgres psql -c "CREATE USER master CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE stratton_oakmont OWNER master;"
```

---

### 1.6 Install and Start IBKR Client Portal Gateway

The gateway is a Java process that must be running before the bot can place orders. It runs on the Pi host at port 5001.

```bash
# Copy the gateway zip to the Pi and extract it
scp clientportal.gw.zip pi@raspberrypi.local:~/
ssh pi@raspberrypi.local "unzip clientportal.gw.zip -d ~/ibkr-gateway"

# Start the gateway (requires Java 11+)
sudo apt-get install -y default-jre
cd ~/ibkr-gateway
./bin/run.sh root/conf.yaml
```

Log in at `https://localhost:5001` from the Pi's browser (or via SSH tunnel) and authenticate with your IBKR credentials before starting the bot.

---

### 1.7 Set Up DuckDNS

DuckDNS gives the Pi a stable public hostname even if your home IP changes.

1. Go to [duckdns.org](https://www.duckdns.org) and create a subdomain (e.g. `stratton.duckdns.org`)
2. Copy your token

```bash
mkdir -p ~/duckdns
cat > ~/duckdns/duck.sh << 'EOF'
#!/bin/bash
echo url="https://www.duckdns.org/update?domains=YOUR_SUBDOMAIN&token=YOUR_TOKEN&ip=" | curl -k -o ~/duckdns/duck.log -K -
EOF
chmod 700 ~/duckdns/duck.sh
~/duckdns/duck.sh && cat ~/duckdns/duck.log   # should print OK

# Auto-update every 5 minutes
crontab -e
# Add: */5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1
```

**Router setup:** Forward **external port 80** → Pi local IP port 80 (for the web app) and **external port 22** → Pi local IP port 22 (for GitHub Actions SSH). Give the Pi a static DHCP lease.

---

### 1.8 Configure SSH Key for GitHub Actions

```bash
# On your local machine — generate a dedicated deploy key
ssh-keygen -t ed25519 -C "github-actions-stratton" -f ~/.ssh/stratton_deploy -N ""
```

Copy the **public key** to the Pi:

```bash
ssh pi@raspberrypi.local "mkdir -p ~/.ssh && chmod 700 ~/.ssh"
cat ~/.ssh/stratton_deploy.pub | ssh pi@raspberrypi.local "cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Disable password login (key-only):

```bash
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
#      PubkeyAuthentication yes
sudo systemctl restart ssh
```

---

### 1.9 Configure Git Deploy Key (Pi → GitHub)

```bash
# On the Pi
ssh-keygen -t ed25519 -C "pi-stratton-deploy" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

Add the public key in GitHub: **Repo → Settings → Deploy keys → Add deploy key** (read-only).

```bash
cat >> ~/.ssh/config << 'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
  StrictHostKeyChecking no
EOF
chmod 600 ~/.ssh/config

ssh -T git@github.com   # should print: Hi erickgs2! You've successfully authenticated...
```

---

### 1.10 Set Up Application Directory

```bash
sudo mkdir -p /srv/stratton-oakmont
sudo chown $USER:$USER /srv/stratton-oakmont
git clone git@github.com:erickgs2/stratton_oakmount.git /srv/stratton-oakmont
```

---

### 1.11 Create the Environment File

```bash
cp /srv/stratton-oakmont/.env.example /srv/stratton-oakmont/.env
nano /srv/stratton-oakmont/.env
```

Fill in all values. Key points:
- `DATABASE_URL` must use `host.docker.internal` (not `localhost`) so the backend container can reach the Pi's Postgres
- `IBKR_GATEWAY_URL` must also use `host.docker.internal`
- `CORS_ORIGIN` should be your DuckDNS hostname

```dotenv
DATABASE_URL="postgresql://master@host.docker.internal:5432/stratton_oakmont"
ANTHROPIC_API_KEY=sk-ant-...
DATABURSATIL_TOKEN=your_token
IBKR_GATEWAY_URL=https://host.docker.internal:5001/v1/api
IBKR_ACCOUNT_ID=your_account_id
CORS_ORIGIN=http://your-subdomain.duckdns.org
```

---

### 1.12 First Manual Deploy

```bash
cd /srv/stratton-oakmont

# Build images
docker compose build backend web

# Run Prisma migrations
docker compose --profile migrate run --rm migrate

# Start all services
docker compose up -d --remove-orphans

docker compose ps
```

Open `http://your-subdomain.duckdns.org` — you should see the dashboard.

---

## Part 2 — GitHub Actions Setup

### 2.1 Create the `production` GitHub Environment

**Repo → Settings → Environments → New environment** → name it `production`.

---

### 2.2 Add GitHub Secrets

**Repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|--------|-------|
| `SERVER_HOST` | Your DuckDNS hostname (e.g. `stratton.duckdns.org`) |
| `SERVER_USER` | SSH username on the Pi (e.g. `pi` or `ubuntu`) |
| `SSH_PRIVATE_KEY` | Full contents of `~/.ssh/stratton_deploy` (private key from step 1.8) |

---

### 2.3 Test the Workflow

```bash
git checkout main
git commit --allow-empty -m "chore: trigger deployment test"
git push origin main
```

Watch **Repo → Actions → Deploy — Production**.

---

## Part 3 — Useful Commands on the Pi

```bash
# Check running containers
docker compose -f /srv/stratton-oakmont/docker-compose.yml ps

# Tail logs
docker compose logs -f backend
docker compose logs -f web

# Manual redeploy (mirrors what GitHub Actions does)
cd /srv/stratton-oakmont
git fetch origin main && git reset --hard origin/main
docker compose build backend web
docker compose --profile migrate run --rm migrate
docker compose up -d --remove-orphans
docker image prune -f

# Connect to Postgres on the host
psql "postgresql://master@localhost:5432/stratton_oakmont"

# Force clean rebuild (when Dockerfile changes aren't picked up)
docker compose build --no-cache
docker compose up -d --remove-orphans

# Check DuckDNS update log
cat ~/duckdns/duck.log   # should show OK
```

---

## Part 4 — Connecting Locally via SSH Alias

Add to `~/.ssh/config` on your local machine:

```
Host stratton-pi
  HostName your-subdomain.duckdns.org
  User pi
  IdentityFile ~/.ssh/stratton_deploy
```

Then connect with:

```bash
ssh stratton-pi
```
