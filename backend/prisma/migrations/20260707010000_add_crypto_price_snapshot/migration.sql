-- CreateTable
CREATE TABLE "CryptoPriceSnapshot" (
    "id" TEXT NOT NULL,
    "book" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CryptoPriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CryptoPriceSnapshot_book_recordedAt_idx" ON "CryptoPriceSnapshot"("book", "recordedAt");
