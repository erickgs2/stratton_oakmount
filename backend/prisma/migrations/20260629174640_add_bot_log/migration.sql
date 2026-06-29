-- CreateTable
CREATE TABLE "BotLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "market" TEXT,
    "symbol" TEXT,
    "message" TEXT NOT NULL,
    "meta" JSONB,

    CONSTRAINT "BotLog_pkey" PRIMARY KEY ("id")
);
