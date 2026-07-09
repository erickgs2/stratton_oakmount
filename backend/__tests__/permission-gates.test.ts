jest.mock('@/lib/prisma', () => ({
  prisma: {
    botConfig: { upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
    appSettings: { upsert: jest.fn().mockResolvedValue({}) },
  },
}));
jest.mock('@/lib/ibkr', () => ({
  ibkrClient: {
    startKeepAlive: jest.fn(),
    logout: jest.fn().mockResolvedValue(true),
  },
}));
jest.mock('@/lib/claude-agent', () => ({
  runAgentCycle: jest.fn().mockResolvedValue({ action: 'hold', quantity: 0, confidence: 0, reason: '', executed: false }),
}));
jest.mock('@/lib/bot-logger', () => ({ writeBotLog: jest.fn().mockResolvedValue(undefined) }));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ibkrClient } from '@/lib/ibkr';
import { runAgentCycle } from '@/lib/claude-agent';
import { POST as saveConfig } from '../app/api/bot/config/route';
import { POST as startBot } from '../app/api/bot/start/route';
import { POST as stopBot } from '../app/api/bot/stop/route';
import { PUT as saveSettings } from '../app/api/settings/route';
import { POST as ibkrLogout } from '../app/api/ibkr-logout/route';
import { POST as runAgentRoute } from '../app/api/agent/run/route';

const DENIED_HEADERS = {
  'x-user-id': 'u1', 'x-user-email': 'a@b.com', 'x-can-edit-config': 'false', 'x-can-manual-trade': 'false',
};
const ALLOWED_HEADERS = {
  'x-user-id': 'u1', 'x-user-email': 'a@b.com', 'x-can-edit-config': 'true', 'x-can-manual-trade': 'false',
};

// NOTE: /api/settings is a PUT endpoint (not POST, unlike the other five
// routes here) — verified against its current implementation before writing
// this test. Pass method explicitly per-call rather than assuming POST.
function req(url: string, headers: Record<string, string>, body: unknown = {}, method = 'POST') {
  return new NextRequest(`http://localhost${url}`, { method, headers, body: JSON.stringify(body) });
}

beforeEach(() => jest.clearAllMocks());

describe('canEditConfig gate on write routes', () => {
  it('POST /api/bot/config: 403 without permission, proceeds with it', async () => {
    const deniedRes = await saveConfig(req('/api/bot/config', DENIED_HEADERS, { market: 'MX', symbols: [], capitalLimit: 1, intervalMin: 15, confidenceThreshold: 0.6, takeProfitPct: 1, stopLossPct: 1, feeEstimatePct: 0.1 }));
    expect(deniedRes.status).toBe(403);
    expect(prisma.botConfig.upsert).not.toHaveBeenCalled();

    const allowedRes = await saveConfig(req('/api/bot/config', ALLOWED_HEADERS, { market: 'MX', symbols: [], capitalLimit: 1, intervalMin: 15, confidenceThreshold: 0.6, takeProfitPct: 1, stopLossPct: 1, feeEstimatePct: 0.1 }));
    expect(allowedRes.status).not.toBe(403);
    expect(prisma.botConfig.upsert).toHaveBeenCalled();
  });

  it('POST /api/bot/start: 403 without permission', async () => {
    const response = await startBot(req('/api/bot/start', DENIED_HEADERS, { market: 'MX', symbols: [], capitalLimit: 1, intervalMin: 15, confidenceThreshold: 0.6, takeProfitPct: 1, stopLossPct: 1, feeEstimatePct: 0.1 }));
    expect(response.status).toBe(403);
    expect(prisma.botConfig.upsert).not.toHaveBeenCalled();
  });

  it('POST /api/bot/stop: 403 without permission', async () => {
    const response = await stopBot(req('/api/bot/stop', DENIED_HEADERS, { market: 'MX' }));
    expect(response.status).toBe(403);
  });

  it('PUT /api/settings: 403 without permission', async () => {
    const response = await saveSettings(req('/api/settings', DENIED_HEADERS, { ibkrAccountId: 'U123' }, 'PUT'));
    expect(response.status).toBe(403);
    expect(prisma.appSettings.upsert).not.toHaveBeenCalled();
  });

  it('POST /api/ibkr-logout: 403 without permission', async () => {
    const response = await ibkrLogout(req('/api/ibkr-logout', DENIED_HEADERS));
    expect(response.status).toBe(403);
    expect(ibkrClient.logout).not.toHaveBeenCalled();
  });

  it('POST /api/agent/run: 403 without permission', async () => {
    const response = await runAgentRoute(req('/api/agent/run', DENIED_HEADERS, { symbol: 'AAPL', market: 'USA' }));
    expect(response.status).toBe(403);
    expect(runAgentCycle).not.toHaveBeenCalled();
  });

  it('POST /api/agent/run: proceeds with permission', async () => {
    const response = await runAgentRoute(req('/api/agent/run', ALLOWED_HEADERS, { symbol: 'AAPL', market: 'USA' }));
    expect(response.status).not.toBe(403);
    expect(runAgentCycle).toHaveBeenCalled();
  });
});
