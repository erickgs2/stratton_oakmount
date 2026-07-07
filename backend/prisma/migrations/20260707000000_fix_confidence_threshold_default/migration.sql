-- Migration history recorded this column's default as 0.60, but the live
-- database and schema.prisma have both used 0.65 since an earlier session
-- (applied directly, without a matching migration at the time). This
-- migration brings migration history in line with reality; it is a no-op
-- against a database that already has the 0.65 default.
ALTER TABLE "BotConfig" ALTER COLUMN "confidenceThreshold" SET DEFAULT 0.65;
