import { getMXMarketData } from '@/lib/databursatil';

global.fetch = jest.fn();
process.env.DATABURSATIL_TOKEN = 'test-token';

const mockIntradayResponse = {
  Serie: [
    {
      EmisioraSerie: 'AMXL',
      UltimoPrecio: 12.5,
      PorcentajeCambio: 1.23,
      Volumen: 1500000,
    },
  ],
};

const mockHistoricalResponse = {
  Serie: [
    { Fecha: '2026-05-01', UltimoPrecio: 11.0, Volumen: 1000000 },
    { Fecha: '2026-05-02', UltimoPrecio: 11.5, Volumen: 1200000 },
    { Fecha: '2026-06-27', UltimoPrecio: 12.5, Volumen: 1500000 },
  ],
};

describe('getMXMarketData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns correctly shaped MXMarketData for a valid symbol', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockIntradayResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockHistoricalResponse,
      });

    const data = await getMXMarketData('AMXL');

    expect(data.symbol).toBe('AMXL');
    expect(data.lastPrice).toBe(12.5);
    expect(data.changePct).toBe(1.23);
    expect(data.volume).toBe(1500000);
    expect(data.history).toHaveLength(3);
    expect(data.history[0]).toEqual({ date: '2026-05-01', close: 11.0, volume: 1000000 });
  });

  it('throws when the API returns an error status', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(getMXMarketData('AMXL')).rejects.toThrow('DataBursatil API error 401');
  });

  it('makes requests to the correct DataBursatil endpoints', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockIntradayResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => mockHistoricalResponse });

    await getMXMarketData('WALMEX');

    const [intradayCall, historicalCall] = (global.fetch as jest.Mock).mock.calls;
    expect(intradayCall[0]).toContain('intradia');
    expect(intradayCall[0]).toContain('WALMEX');
    expect(historicalCall[0]).toContain('historico');
    expect(historicalCall[0]).toContain('WALMEX');
  });
});
