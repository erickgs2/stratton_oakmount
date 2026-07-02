-- AlterTable
ALTER TABLE "BotConfig" ADD COLUMN     "takeProfitPct" DOUBLE PRECISION NOT NULL DEFAULT 1.5;
ALTER TABLE "BotConfig" ADD COLUMN     "stopLossPct" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE "BotConfig" ADD COLUMN     "feeEstimatePct" DOUBLE PRECISION NOT NULL DEFAULT 0.10;

-- Backfill market-specific fee estimates for rows that existed before this migration
-- (BMV round-trip costs are not covered by IBKR Lite's US commission-free benefit)
UPDATE "BotConfig" SET "feeEstimatePct" = 0.30 WHERE "market" = 'MX';
UPDATE "BotConfig" SET "feeEstimatePct" = 0.05 WHERE "market" = 'USA';
