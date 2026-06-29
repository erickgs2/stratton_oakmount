export interface BotConfig {
  id: string;
  market: 'MX' | 'USA';
  symbols: string[];
  capitalLimit: number;
  intervalMin: number;
  confidenceThreshold: number;
  isActive: boolean;
  updatedAt: string;
}
