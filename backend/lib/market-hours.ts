import { isMarketHoliday, getEarlyCloseTime } from '@/lib/market-holidays';
import { Market } from '@/lib/market';

function isWeekdayInRange(
  timezone: string,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
  market: 'MX' | 'USA',
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

  if (isMarketHoliday(now, market)) return false;

  const hour = parseInt(parts['hour'], 10);
  const minute = parseInt(parts['minute'], 10);
  const currentMinutes = hour * 60 + minute;
  const startMinutes = startHour * 60 + startMinute;

  let endMinutes = endHour * 60 + endMinute;
  const earlyClose = getEarlyCloseTime(now, market);
  if (earlyClose) {
    const [closeHour, closeMinute] = earlyClose.split(':').map(Number);
    endMinutes = Math.min(endMinutes, closeHour * 60 + closeMinute);
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export function isBMVOpen(): boolean {
  return isWeekdayInRange('America/Mexico_City', 8, 30, 15, 0, 'MX');
}

export function isNYSEOpen(): boolean {
  return isWeekdayInRange('America/New_York', 9, 30, 16, 0, 'USA');
}

export function isCryptoOpen(): boolean {
  return true; // Bitso trades 24/7 — no holiday/weekend/hour restrictions
}

export function isMarketOpen(market: Market): boolean {
  if (market === 'MX') return isBMVOpen();
  if (market === 'USA') return isNYSEOpen();
  return isCryptoOpen();
}
