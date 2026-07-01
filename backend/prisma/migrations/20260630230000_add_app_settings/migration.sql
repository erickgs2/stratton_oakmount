-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "ibkrAccountId" TEXT,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
