export interface ClaudeDecision {
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
  confidence: number;
  reason: string;
}

function isDecisionShaped(value: unknown): value is ClaudeDecision {
  return !!value && typeof value === 'object' && typeof (value as { action?: unknown }).action === 'string';
}

// Claude's response is normally a single JSON object, optionally wrapped in a
// ```json fence. Occasionally it second-guesses itself mid-response (e.g.
// "Wait, I need to respond with valid JSON only:") and appends a corrected
// JSON object after prose reasoning text — the earlier plain JSON.parse()
// would fail on the whole string and silently fall back to an inert hold,
// discarding whatever action Claude actually decided on. This scans for
// every balanced, string-aware {...} block and uses the LAST one that parses
// and looks like a decision, since that's Claude's final answer.
export function parseClaudeDecision(rawText: string): ClaudeDecision {
  const cleanText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    const parsed: unknown = JSON.parse(cleanText);
    if (isDecisionShaped(parsed)) return parsed;
  } catch {
    // fall through to the embedded-object scan below
  }

  const candidates: ClaudeDecision[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          const parsed: unknown = JSON.parse(cleanText.slice(start, i + 1));
          if (isDecisionShaped(parsed)) candidates.push(parsed);
        } catch {
          // not a valid decision object — skip this block
        }
        start = -1;
      }
    }
  }

  if (candidates.length > 0) return candidates[candidates.length - 1];

  return { action: 'hold', quantity: 0, confidence: 0, reason: `Parse error: ${rawText}` };
}
