# Stratton Oakmont Trading Bot

An autonomous trading bot for Mexican (BMV) and US (NYSE/Nasdaq) equities. The backend is a Next.js API server that calls Claude to make trading decisions and executes orders via the IBKR Client Portal Gateway.

## Prerequisites

- **Node.js 18+** — backend and frontend both require Node 18 or later
- **Java JDK 21+** — required to run the IBKR Client Portal Gateway (`brew install --cask temurin@21`)
- **PostgreSQL** — used for persisting agent logs and trade records
- **Angular CLI 17** — install with `npm install -g @angular/cli@17` (requires `sudo` on macOS if npm is system-installed)

## Environment Variables

Create `backend/.env.local` with the following variables:

| Variable | Purpose |
|---|---|
| `IBKR_GATEWAY_URL` | URL of the IBKR Client Portal Gateway (default: `https://127.0.0.1:5001/v1/api`) |
| `IBKR_ACCOUNT_ID` | Your IBKR account ID — paper (`DUR146547`) or live (`U26719175`) |
| `DATABURSATIL_TOKEN` | API token for DataBursatil MX market data |
| `ANTHROPIC_API_KEY` | Anthropic API key used by the Claude agent |
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://user@localhost:5432/stratton_oakmont`) |
| `ACTIVE_MARKET` | Which market to trade: `MX` for Phase 1 (BMV), `USA` for Phase 2 |

## IBKR Gateway Setup

1. Download the IBKR Client Portal Gateway ZIP from the [Web API documentation page](https://www.interactivebrokers.com/en/trading/ib-api.php) (click **Web API Documentation**, then find the Client Portal Gateway download). You can also download it directly:
   ```bash
   curl -O https://download2.interactivebrokers.com/portal/clientportal.gw.zip
   unzip clientportal.gw.zip
   ```
2. Start the gateway from the project root:
   ```bash
   bash bin/run.sh root/conf.yaml
   ```
3. Open `https://127.0.0.1:5001` in your browser. Accept the self-signed certificate warning, then log in (see [Switching Accounts](#switching-between-paper-and-live) below for which credentials to use). Once you see "Client login succeeds" the gateway is ready.

> **Note:** The gateway must stay running while the bot is active. Use `keep-alive` tickle is handled automatically by the backend.

## Switching Between Paper and Live

### Paper trading (for testing)

1. Log in to the gateway at `https://127.0.0.1:5001` using the **paper trading credentials** (username: `xglamp266`, and the paper account password set in the IBKR portal under Settings → Paper Trading Account). If you forgot the password, reset it from that same page.
2. Set `IBKR_ACCOUNT_ID=DUR146547` in `backend/.env.local`.
3. Restart the backend.

### Live trading

> **Warning:** Live trading uses real money. Make sure the bot has been thoroughly tested on paper first.

1. Log in to the gateway at `https://127.0.0.1:5001` using your **live IBKR credentials** (main username and password).
2. Set `IBKR_ACCOUNT_ID=U26719175` in `backend/.env.local`.
3. Restart the backend.

## Startup Order

Run each step in order:

1. **Start PostgreSQL** — ensure the database server is running and the database exists.
2. **Run database migrations:**
   ```bash
   cd backend && npx prisma migrate dev
   ```
3. **Start IBKR Gateway and authenticate** — follow the steps in [IBKR Gateway Setup](#ibkr-gateway-setup) above.
4. **Start the backend:**
   ```bash
   cd backend && npm run dev
   ```
5. **Start the frontend:**
   ```bash
   cd frontend && npx ng serve
   ```

## First Run

Always start with the **paper trading account** to verify the bot behaves correctly before risking real money.

Test a single agent cycle by sending a POST request to the backend:

```bash
curl -X POST http://localhost:3000/api/agent/run \
  -H "Content-Type: application/json" \
  -d '{"symbol":"AMXL","market":"MX"}'
```

The response will contain the Claude decision (buy/sell/hold), confidence, reason, and whether a trade was executed.

## Phase 2: US Markets

When ready to trade US equities, update `ACTIVE_MARKET` in `backend/.env.local`:

```env
ACTIVE_MARKET=USA
```

Restart the backend after changing this value. Note that US market data integration is a Phase 2 feature — see the source for current implementation status.
