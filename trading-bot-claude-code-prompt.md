# Trading Bot — Claude Code Bootstrap Prompt
# v2 — Mercado MX (Phase 1) + USA (Phase 2) via Interactive Brokers

Copia y pega este prompt completo en tu terminal con Claude Code:

---

```
Construye una aplicación fullstack de trading personal automatizado con las siguientes especificaciones:

## Contexto del proyecto

Esta aplicación tiene dos fases:
- **Phase 1 (MVP):** Operar acciones mexicanas en la BMV (AMXL, FEMSAUBD, WALMEX, BIMBOA, GCARSOA1, etc.)
- **Phase 2:** Extender al mercado USA (NYSE/Nasdaq: AAPL, NVDA, TSLA, etc.)

Ambas fases usan el mismo broker: **Interactive Brokers (IBKR)**, que soporta BMV y NYSE/Nasdaq desde una sola cuenta y API. El agente de IA es **Claude (claude-sonnet-4-6)** quien analiza el mercado y toma decisiones de compra/venta.

---

## Stack

- Frontend: Angular 17+ con Angular Material
- Backend: Next.js 14 App Router (API Routes)
- Base de datos: PostgreSQL con Prisma ORM
- Lenguaje: TypeScript en todo el proyecto
- Broker API: Interactive Brokers Client Portal Web API (REST)
- Agente IA: Anthropic Claude API (claude-sonnet-4-6)
- Data de mercado MX: DataBursatil API (https://databursatil.com) para precios BMV/BIVA en tiempo real
- Data de mercado USA: IBKR Market Data API

---

## Estructura de carpetas

trading-bot/
├── frontend/                          # Angular app
│   └── src/app/
│       ├── dashboard/                 # Vista principal con portafolio
│       ├── positions/                 # Posiciones abiertas
│       ├── trade-log/                 # Historial de decisiones del agente
│       ├── bot-config/                # Configuración: símbolos, capital, frecuencia, mercado
│       ├── market-selector/           # Switch entre Phase 1 (MX) y Phase 2 (USA)
│       └── shared/
│           ├── components/
│           └── services/              # HTTP services hacia Next.js API
│
├── backend/                           # Next.js App Router
│   ├── app/api/
│   │   ├── portfolio/route.ts         # GET posiciones y balance desde IBKR
│   │   ├── trades/route.ts            # GET historial de trades desde DB
│   │   ├── market-data/
│   │   │   ├── mx/route.ts            # GET datos BMV via DataBursatil
│   │   │   └── usa/route.ts           # GET datos NYSE/Nasdaq via IBKR
│   │   ├── bot/
│   │   │   ├── start/route.ts
│   │   │   ├── stop/route.ts
│   │   │   └── status/route.ts
│   │   └── agent/run/route.ts
│   ├── lib/
│   │   ├── ibkr.ts                    # Cliente IBKR Client Portal API
│   │   ├── databursatil.ts            # Cliente DataBursatil para datos MX
│   │   ├── claude-agent.ts            # Agente Claude con logica de decision
│   │   ├── indicators.ts              # RSI, MA20, MA50, variacion %
│   │   ├── market-hours.ts            # Validacion horario BMV y NYSE
│   │   └── prisma.ts
│   └── prisma/
│       └── schema.prisma

---

## Schema Prisma

model Trade {
  id           String   @id @default(cuid())
  symbol       String
  market       String   // "MX" | "USA"
  action       String   // "buy" | "sell" | "hold"
  quantity     Float
  price        Float
  currency     String   // "MXN" | "USD"
  reason       String
  ibkrOrderId  String?
  createdAt    DateTime @default(now())
}

model BotConfig {
  id            String   @id @default(cuid())
  market        String   // "MX" | "USA"
  symbols       String[] // ["AMXL", "FEMSAUBD"] o ["AAPL", "NVDA"]
  capitalLimit  Float
  intervalMin   Int
  isActive      Boolean  @default(false)
  updatedAt     DateTime @updatedAt
}

model AgentLog {
  id          String   @id @default(cuid())
  symbol      String
  market      String
  marketData  Json
  response    Json
  executed    Boolean  @default(false)
  createdAt   DateTime @default(now())
}

---

## Variables de entorno (.env)

# Interactive Brokers (Client Portal Web API corre localmente en puerto 5000)
IBKR_GATEWAY_URL=https://localhost:5000/v1/api
IBKR_ACCOUNT_ID=tu_account_id_aqui

# DataBursatil (datos de mercado MX)
DATABURSATIL_TOKEN=tu_token_aqui

# Anthropic
ANTHROPIC_API_KEY=tu_key_aqui

# PostgreSQL
DATABASE_URL=postgresql://usuario:password@localhost:5432/trading_bot

# Mercado activo
ACTIVE_MARKET=MX   # "MX" para Phase 1, "USA" para Phase 2

---

## Setup de Interactive Brokers Client Portal API

IBKR no usa key/secret como Alpaca. Funciona con un gateway local:
1. Descargar el Client Portal Gateway (jar Java) desde interactivebrokers.com/api
2. Ejecutar: java -jar root/run.jar root/conf.yaml
3. Autenticarse en https://localhost:5000 con credenciales IBKR
4. Queda expuesto un REST API en localhost:5000/v1/api

El cliente lib/ibkr.ts debe:
- Mantener sesion activa con llamadas a GET /tickle cada 60 segundos (implementar keep-alive automatico en el backend con setInterval)
- Obtener posiciones: GET /portfolio/{accountId}/positions/0
- Obtener balance: GET /portfolio/{accountId}/summary
- Colocar orden: POST /iserver/account/{accountId}/orders
- Para BMV usar: currency "MXN", exchange "BMV"
- Para NYSE/Nasdaq usar: currency "USD", exchange "SMART"

---

## Cliente DataBursatil (lib/databursatil.ts)

Para datos del mercado mexicano en tiempo real:

Precio actual: GET https://api.databursatil.com/v2/intradia?token={TOKEN}&emisora_serie={SYMBOL}&bolsa=BMV,BIVA
Historico:     GET https://api.databursatil.com/v2/historico?token={TOKEN}&emisora_serie={SYMBOL}&periodo=diaria&desde=YYYY-MM-DD&hasta=YYYY-MM-DD

La funcion getMXMarketData(symbol) debe retornar:
{
  symbol, lastPrice, changePct, volume,
  history: [{ date, close, volume }]  // ultimos 60 dias
}

---

## Logica del agente Claude (claude-agent.ts)

Implementa runAgentCycle(symbol: string, market: 'MX' | 'USA'):

1. Obtiene datos de mercado segun mercado:
   - MX: usa databursatil.ts
   - USA: usa ibkr.ts market data

2. Calcula indicadores con el historico:
   - RSI(14), MA(20), MA(50), variacion % 5 dias, volumen promedio vs actual

3. Consulta IBKR: posicion actual en ese simbolo + balance disponible

4. Construye prompt para Claude. Solicita respuesta SOLO en JSON:
   { "action": "buy"|"sell"|"hold", "quantity": 0, "confidence": 0.0, "reason": "..." }

Prompts diferenciados por mercado:

MX: "Eres un trader experto en la Bolsa Mexicana de Valores (BMV). Conoces el mercado mexicano,
sus emisoras lideres (America Movil, FEMSA, Walmart de Mexico, Grupo Bimbo, Grupo Carso) y los
factores macroeconomicos que lo afectan (tipo de cambio USD/MXN, tasas Banxico, IPC).
Tu objetivo es generar rentabilidad consistente en pesos mexicanos con gestion de riesgo conservadora."

USA: "Eres un trader experto en NYSE y Nasdaq. Tu objetivo es generar rentabilidad consistente
en dolares con gestion de riesgo conservadora."

Restricciones (ambos mercados):
- Nunca invertir mas del 20% del capital disponible en un simbolo
- No ejecutar si confidence < 0.65
- No operar fuera del horario del mercado correspondiente

5. Si action es buy/sell: ejecutar orden en IBKR, guardar Trade + AgentLog (executed: true)
6. Si action es hold: solo guardar AgentLog (executed: false)

---

## Validacion de horarios (market-hours.ts)

BMV:        Lunes-Viernes 8:30am - 3:00pm hora Ciudad de Mexico (America/Mexico_City)
NYSE/Nasdaq: Lunes-Viernes 9:30am - 4:00pm hora Nueva York (America/New_York)

Exportar: isBMVOpen(), isNYSEOpen(), isMarketOpen(market: 'MX' | 'USA')

---

## Dashboard Angular

Implementa con Angular Material:

1. Dashboard principal:
   - Tabs de mercado: "MX - BMV" | "USA - NYSE/Nasdaq"
   - Cards: Balance (MXN o USD), Buying Power, P&L del dia
   - Tabla de posiciones abiertas con P&L (polling cada 30s)
   - Grafica de rendimiento acumulado
   - Boton On/Off del bot + indicador de estado + badge Paper/Real

2. Trade Log:
   - Tabla: Fecha, Simbolo, Mercado, Accion, Cantidad, Precio, Moneda, Razon del agente
   - Filtros: mercado, simbolo, fecha

3. Bot Config (tabs por mercado):
   - MX: chips para seleccionar emisoras BMV (AMXL, FEMSAUBD, WALMEX, BIMBOA, GCARSOA1)
   - USA: chips para tickers NYSE/Nasdaq
   - Capital limite por ciclo (MXN para MX, USD para USA)
   - Frecuencia en minutos
   - Toggle activar/desactivar

---

## Simbolos sugeridos para Phase 1 (BMV IPC)

Empezar con estos 5 para el MVP:
- AMXL     (America Movil)
- FEMSAUBD (FEMSA)
- WALMEX*  (Walmart de Mexico)
- BIMBOA   (Grupo Bimbo)
- GCARSOA1 (Grupo Carso)

---

## Consideraciones importantes

- IBKR Gateway debe estar corriendo antes de iniciar el backend. Documentar esto en README.
- IBKR ofrece cuenta Paper Trading gratuita para pruebas. Usar siempre paper primero.
- DataBursatil tiene plan gratuito suficiente para el MVP.
- Implementar keep-alive de sesion IBKR: llamar a /tickle cada 55 segundos con setInterval en el servidor.
- Guardar TODOS los ciclos del agente en AgentLog, incluso los hold.
- Mostrar siempre la moneda del mercado activo (MXN/USD).
- Validar horario de mercado antes de cada ejecucion de orden.

---

## Orden de implementacion

1. Setup proyecto: Next.js + Angular + PostgreSQL
2. Variables de entorno
3. Prisma schema + migraciones
4. Documentar setup IBKR Gateway en README
5. lib/ibkr.ts con keep-alive de sesion
6. lib/databursatil.ts para datos MX
7. lib/market-hours.ts
8. lib/indicators.ts (RSI, MA)
9. lib/claude-agent.ts con prompts diferenciados MX/USA
10. API Routes
11. Angular services
12. Dashboard con tabs MX/USA
13. Pruebas paper trading con AMXL primero
14. Validar resultados MX durante 2-4 semanas
15. Cambiar ACTIVE_MARKET=USA para Phase 2
```

---

## Recursos necesarios antes de ejecutar

| Recurso | URL | Notas |
|---|---|---|
| IBKR cuenta + Paper | interactivebrokers.com | Abrir cuenta, solicitar paper trading |
| IBKR Client Portal Gateway | interactivebrokers.com/api | Descargar el jar Java |
| DataBursatil token | databursatil.com | Registro gratuito para datos BMV |
| Anthropic API key | console.anthropic.com | Para el agente Claude |
| PostgreSQL | local o AWS RDS | Ya lo tienes en tu Debian |

## Para ejecutar en Claude Code:
```bash
claude "$(cat trading-bot-claude-code-prompt.md)"
```
