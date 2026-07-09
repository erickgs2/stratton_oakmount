import { parseClaudeDecision } from '@/lib/claude-decision-parser';

describe('parseClaudeDecision', () => {
  it('parses a plain JSON decision', () => {
    const raw = '{"action":"buy","quantity":8,"confidence":0.62,"reason":"bullish setup"}';
    expect(parseClaudeDecision(raw)).toEqual({
      action: 'buy',
      quantity: 8,
      confidence: 0.62,
      reason: 'bullish setup',
    });
  });

  it('strips a markdown code fence around the JSON', () => {
    const raw = '```json\n{"action":"hold","quantity":0,"confidence":0.35,"reason":"ambiguous"}\n```';
    expect(parseClaudeDecision(raw)).toEqual({
      action: 'hold',
      quantity: 0,
      confidence: 0.35,
      reason: 'ambiguous',
    });
  });

  it('recovers the final decision when Claude second-guesses itself mid-response', () => {
    // Reproduces the exact pattern seen in production AgentLog rows: Claude
    // emits a JSON object embedded in prose, then appends "Wait, I need to
    // respond with valid JSON only:" followed by a corrected object. The
    // corrected (last) object is the real answer and must not be discarded.
    const raw = [
      'Looking at the data: {"action":"sell","quantity":16,"reason":"stop-loss breached",',
      '"action":"sell","quantity":16,"confidence":0.92}',
      '',
      'Wait, I need to respond with valid JSON only:',
      '',
      '{"action":"sell","quantity":16,"confidence":0.92,"reason":"Stop-loss threshold breached, selling to cut the loss."}',
    ].join('\n');

    expect(parseClaudeDecision(raw)).toEqual({
      action: 'sell',
      quantity: 16,
      confidence: 0.92,
      reason: 'Stop-loss threshold breached, selling to cut the loss.',
    });
  });

  it('ignores braces inside string values while scanning for embedded objects', () => {
    const raw = [
      'Some reasoning that mentions a {literal brace} in prose.',
      '{"action":"hold","quantity":0,"confidence":0.4,"reason":"support near {192.53}"}',
    ].join('\n');

    expect(parseClaudeDecision(raw)).toEqual({
      action: 'hold',
      quantity: 0,
      confidence: 0.4,
      reason: 'support near {192.53}',
    });
  });

  it('falls back to an inert hold when no valid decision object can be found', () => {
    const raw = 'I am not going to respond with JSON at all.';
    const decision = parseClaudeDecision(raw);
    expect(decision.action).toBe('hold');
    expect(decision.quantity).toBe(0);
    expect(decision.confidence).toBe(0);
    expect(decision.reason).toBe(`Parse error: ${raw}`);
  });
});
