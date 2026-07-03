type Market = 'MX' | 'USA';

// Market holiday calendars, keyed by year. MUST be updated annually — a year
// missing from these tables falls back to weekday-only checking (see
// market-hours.ts), which will incorrectly treat holidays as open days.
//
// NYSE source: https://www.nyse.com/trade/hours-calendars
// BMV source: https://www.bmv.com.mx/es/grupo-bmv/calendario-de-dias-festivos
const NYSE_HOLIDAYS: Record<number, string[]> = {
  2026: [
    '2026-01-01', // New Year's Day
    '2026-01-19', // Martin Luther King Jr. Day
    '2026-02-16', // Washington's Birthday (Presidents Day)
    '2026-04-03', // Good Friday
    '2026-05-25', // Memorial Day
    '2026-06-19', // Juneteenth
    '2026-07-03', // Independence Day (observed — July 4 falls on a Saturday)
    '2026-09-07', // Labor Day
    '2026-11-26', // Thanksgiving Day
    '2026-12-25', // Christmas Day
  ],
};

// 1:00 PM ET early closes — the market is open earlier that day but treated
// as closed after this time, same as a full holiday from that point on.
const NYSE_EARLY_CLOSE: Record<number, Record<string, string>> = {
  2026: {
    '2026-11-27': '13:00', // Day after Thanksgiving
    '2026-12-24': '13:00', // Christmas Eve
  },
};

const BMV_HOLIDAYS: Record<number, string[]> = {
  2026: [
    '2026-01-01', // Año Nuevo
    '2026-02-02', // Día de la Constitución (observed, 1st Monday of Feb)
    '2026-03-16', // Natalicio de Benito Juárez (observed, 3rd Monday of Mar)
    '2026-04-02', // Jueves Santo
    '2026-04-03', // Viernes Santo
    '2026-05-01', // Día del Trabajo
    '2026-09-16', // Día de la Independencia
    '2026-11-02', // Día de Muertos
    '2026-11-16', // Día de la Revolución (observed, 3rd Monday of Nov)
    '2026-12-12', // Día del Empleado Bancario
    '2026-12-25', // Navidad
  ],
};

function dateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

const MARKET_TIMEZONE: Record<Market, string> = {
  MX: 'America/Mexico_City',
  USA: 'America/New_York',
};

const warnedMissingYears = new Set<string>();

function warnIfYearMissing(market: Market, table: Record<number, unknown>, year: number): void {
  const key = `${market}-${year}`;
  if (table[year] !== undefined || warnedMissingYears.has(key)) return;
  warnedMissingYears.add(key);
  console.warn(
    `[market-holidays] No ${market} holiday calendar loaded for ${year} — ` +
    `falling back to weekday-only market-open checks. Update lib/market-holidays.ts.`
  );
}

export function isMarketHoliday(date: Date, market: Market): boolean {
  const key = dateKey(date, MARKET_TIMEZONE[market]);
  const year = parseInt(key.slice(0, 4), 10);
  const table = market === 'USA' ? NYSE_HOLIDAYS : BMV_HOLIDAYS;
  warnIfYearMissing(market, table, year);
  return (table[year] ?? []).includes(key);
}

// Returns an "HH:MM" early-close override for the given date/market, or null
// if the day is a normal full session (or a market with no early-close concept).
export function getEarlyCloseTime(date: Date, market: Market): string | null {
  if (market !== 'USA') return null;
  const key = dateKey(date, MARKET_TIMEZONE[market]);
  const year = parseInt(key.slice(0, 4), 10);
  return NYSE_EARLY_CLOSE[year]?.[key] ?? null;
}
