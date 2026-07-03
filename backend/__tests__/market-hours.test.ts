import { isBMVOpen, isNYSEOpen, isMarketOpen } from '@/lib/market-hours';

// BMV: Mon-Fri 08:30-15:00 America/Mexico_City (UTC-6 standard, UTC-5 daylight)
// NYSE: Mon-Fri 09:30-16:00 America/New_York (UTC-5 standard, UTC-4 daylight)

describe('isBMVOpen', () => {
  afterEach(() => jest.useRealTimers());

  it('returns true on Monday at 09:00 Mexico City time', () => {
    // 2026-06-29 Monday, 09:00 Mexico City (UTC-6, no DST since 2023) = 15:00 UTC
    jest.useFakeTimers({ now: new Date('2026-06-29T15:00:00Z') });
    expect(isBMVOpen()).toBe(true);
  });

  it('returns false before market open (07:00 Mexico City)', () => {
    // 2026-06-29 Monday, 07:00 Mexico City (UTC-6, no DST since 2023) = 13:00 UTC
    jest.useFakeTimers({ now: new Date('2026-06-29T13:00:00Z') });
    expect(isBMVOpen()).toBe(false);
  });

  it('returns false after market close (15:01 Mexico City)', () => {
    // 2026-06-29 Monday, 15:01 Mexico City (UTC-6, no DST since 2023) = 21:01 UTC
    jest.useFakeTimers({ now: new Date('2026-06-29T21:01:00Z') });
    expect(isBMVOpen()).toBe(false);
  });

  it('returns false on Saturday', () => {
    // 2026-06-27 Saturday, 09:00 Mexico City (UTC-6, no DST since 2023) = 15:00 UTC
    jest.useFakeTimers({ now: new Date('2026-06-27T15:00:00Z') });
    expect(isBMVOpen()).toBe(false);
  });

  it('returns false on Sunday', () => {
    jest.useFakeTimers({ now: new Date('2026-06-28T15:00:00Z') });
    expect(isBMVOpen()).toBe(false);
  });

  it('returns true at exactly 08:30 (market open)', () => {
    // 2026-06-29 Monday, 08:30 Mexico City (UTC-6, no DST since 2023) = 14:30 UTC
    jest.useFakeTimers({ now: new Date('2026-06-29T14:30:00Z') });
    expect(isBMVOpen()).toBe(true);
  });

  it('returns false at exactly 15:00 (market close)', () => {
    // 2026-06-29 Monday, 15:00 Mexico City (UTC-6, no DST since 2023) = 21:00 UTC
    jest.useFakeTimers({ now: new Date('2026-06-29T21:00:00Z') });
    expect(isBMVOpen()).toBe(false);
  });

  it('returns false on a BMV holiday during normal trading hours (Labor Day)', () => {
    // 2026-05-01 Friday, 09:00 Mexico City (UTC-6) = 15:00 UTC — Día del Trabajo
    jest.useFakeTimers({ now: new Date('2026-05-01T15:00:00Z') });
    expect(isBMVOpen()).toBe(false);
  });

  it('returns false on a BMV holiday even though it is a normal weekday (Navidad)', () => {
    // 2026-12-25 Friday, 09:00 Mexico City (UTC-6) = 15:00 UTC
    jest.useFakeTimers({ now: new Date('2026-12-25T15:00:00Z') });
    expect(isBMVOpen()).toBe(false);
  });
});

describe('isNYSEOpen', () => {
  afterEach(() => jest.useRealTimers());

  it('returns true on Monday at 11:00 New York time', () => {
    // 2026-06-29 Monday, 11:00 New York (UTC-4 in EDT) = 15:00 UTC
    jest.useFakeTimers({ now: new Date('2026-06-29T15:00:00Z') });
    expect(isNYSEOpen()).toBe(true);
  });

  it('returns false on Saturday', () => {
    jest.useFakeTimers({ now: new Date('2026-06-27T15:00:00Z') });
    expect(isNYSEOpen()).toBe(false);
  });

  it('returns false on Independence Day observed (July 3, 2026 — July 4 falls on a Saturday)', () => {
    // 2026-07-03 Friday, 11:00 New York (UTC-4 EDT) = 15:00 UTC — this is the
    // exact bug that let the bot place real orders into a closed exchange.
    jest.useFakeTimers({ now: new Date('2026-07-03T15:00:00Z') });
    expect(isNYSEOpen()).toBe(false);
  });

  it('returns true before the early close on the day after Thanksgiving', () => {
    // 2026-11-27 Friday, 12:00 New York (UTC-5 EST) = 17:00 UTC — before 13:00 early close
    jest.useFakeTimers({ now: new Date('2026-11-27T17:00:00Z') });
    expect(isNYSEOpen()).toBe(true);
  });

  it('returns false after the early close on the day after Thanksgiving', () => {
    // 2026-11-27 Friday, 13:30 New York (UTC-5 EST) = 18:30 UTC — after 13:00 early close
    jest.useFakeTimers({ now: new Date('2026-11-27T18:30:00Z') });
    expect(isNYSEOpen()).toBe(false);
  });

  it('returns false after the early close on Christmas Eve', () => {
    // 2026-12-24 Thursday, 13:30 New York (UTC-5 EST) = 18:30 UTC — after 13:00 early close
    jest.useFakeTimers({ now: new Date('2026-12-24T18:30:00Z') });
    expect(isNYSEOpen()).toBe(false);
  });
});

describe('isMarketOpen', () => {
  afterEach(() => jest.useRealTimers());

  it('delegates to isBMVOpen for MX', () => {
    jest.useFakeTimers({ now: new Date('2026-06-29T15:00:00Z') });
    expect(isMarketOpen('MX')).toBe(isBMVOpen());
  });

  it('delegates to isNYSEOpen for USA', () => {
    jest.useFakeTimers({ now: new Date('2026-06-29T15:00:00Z') });
    expect(isMarketOpen('USA')).toBe(isNYSEOpen());
  });
});
