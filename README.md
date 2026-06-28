# Stratton Oakmont Trading Bot

An autonomous trading bot for Mexican (BMV) and US (NYSE/Nasdaq) equities. The backend is a Next.js API server that calls Claude to make trading decisions and executes orders via the IBKR Client Portal Gateway.

## Prerequisites

- **Node.js 18+** — backend and frontend both require Node 18 or later
- **Java** (JDK 11+) — required to run the IBKR Client Portal Gateway JAR
- **PostgreSQL** — used for persisting agent logs and trade records
- **Angular CLI 17** — required to build and serve the frontend (`npm install -g @angular/cli@17`)

## Environment Variables

Create `backend/.env.local` with the following variables:

| Variable | Purpose |
|---|---|
| `IBKR_GATEWAY_URL` | URL of the IBKR Client Portal Gateway (default: `https://localhost:5000/v1/api`) |
| `IBKR_ACCOUNT_ID` | Your IBKR account ID (paper or live) |
| `DATABURSATIL_TOKEN` | API token for DataBursatil MX market data |
| `ANTHROPIC_API_KEY` | Anthropic API key used by the Claude agent |
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://user@localhost:5432/stratton_oakmont`) |
| `ACTIVE_MARKET` | Which market to trade: `MX` for Phase 1 (BMV), `USA` for Phase 2 |

## IBKR Gateway Setup

1. Download the IBKR Client Portal Gateway JAR from the [IBKR API portal](https://www.interactivebrokers.com/en/trading/ib-api.php).
2. Start the gateway:
   ```bash
   java -jar root/run.jar root/conf.yaml
   ```
3. Open `https://localhost:5000` in your browser and log in with your IBKR credentials.
4. The gateway uses a self-signed certificate — you must accept the browser security warning to proceed.

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
   cd frontend && ng serve
   ```

## First Run

Use a **paper trading account** for initial testing to avoid real money risk.

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
