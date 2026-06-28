type Market = 'MX' | 'USA';

function isWeekdayInRange(
  timezone: string,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number
): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(now).map(p => [p.type, p.value])
  );

  const weekday = parts['weekday'];
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  const hour = parseInt(parts['hour'], 10);
  const minute = parseInt(parts['minute'], 10);
  const currentMinutes = hour * 60 + minute;
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export function isBMVOpen(): boolean {
  return isWeekdayInRange('America/Mexico_City', 8, 30, 15, 0);
}

export function isNYSEOpen(): boolean {
  return isWeekdayInRange('America/New_York', 9, 30, 16, 0);
}

export function isMarketOpen(market: Market): boolean {
  return market === 'MX' ? isBMVOpen() : isNYSEOpen();
}
