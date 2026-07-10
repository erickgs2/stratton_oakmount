jest.mock('@/lib/manual-trade', () => ({ executeManualTrade: jest.fn() }));

import { NextRequest } from 'next/server';
import { executeManualTrade } from '@/lib/manual-trade';
import { POST } from '../app/api/trades/manual/route';

function req(headers: Record<string, string>, body: unknown) {
  return new NextRequest('http://localhost/api/trades/manual', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}

const DENIED_HEADERS = {
  'x-user-id': 'u1', 'x-user-email': 'a@b.com', 'x-can-edit-config': 'false', 'x-can-manual-trade': 'false',
};
const ALLOWED_HEADERS = {
  'x-user-id': 'u1', 'x-user-email': 'trader@example.com', 'x-can-edit-config': 'false', 'x-can-manual-trade': 'true',
};

beforeEach(() => jest.clearAllMocks());

describe('POST /api/trades/manual', () => {
  it('returns 403 without canManualTrade', async () => {
    const res = await POST(req(DENIED_HEADERS, { market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 10 }));
    expect(res.status).toBe(403);
    expect(executeManualTrade).not.toHaveBeenCalled();
  });

  it('passes placedByEmail from the trusted header, not the body, and returns the trade on success', async () => {
    (executeManualTrade as jest.Mock).mockResolvedValue({
      success: true, trade: { id: 't1', quantity: 10, price: 20 },
    });
    const res = await POST(req(ALLOWED_HEADERS, {
      market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 10, placedByEmail: 'attacker@evil.com',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trade).toEqual({ id: 't1', quantity: 10, price: 20 });
    expect(executeManualTrade).toHaveBeenCalledWith(
      expect.objectContaining({ placedByEmail: 'trader@example.com' }),
    );
  });

  it('returns 400 for a validation error', async () => {
    (executeManualTrade as jest.Mock).mockResolvedValue({
      success: false, error: 'MX market is closed', errorType: 'validation',
    });
    const res = await POST(req(ALLOWED_HEADERS, { market: 'MX', symbol: 'AMXL', side: 'buy', quantity: 10 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('MX market is closed');
  });

  it('returns 502 for a broker rejection', async () => {
    (executeManualTrade as jest.Mock).mockResolvedValue({
      success: false, error: 'IBKR rejected the order', errorType: 'broker_rejected',
    });
    const res = await POST(req(ALLOWED_HEADERS, { market: 'MX', symbol: 'AMXL', side: 'sell', quantity: 1 }));
    expect(res.status).toBe(502);
  });
});
