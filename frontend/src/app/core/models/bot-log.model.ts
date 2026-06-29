export interface BotLog {
  id: string;
  createdAt: string;
  level: 'info' | 'warn' | 'error';
  event: 'bot_started' | 'bot_stopped' | 'cycle_error' | 'cycle_complete' | 'order_placed';
  market: string | null;
  symbol: string | null;
  message: string;
  meta: Record<string, unknown> | null;
}
