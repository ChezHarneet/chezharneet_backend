CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', 'REVOKED');
CREATE TYPE "BillingType" AS ENUM ('ONE_TIME', 'RECURRING');
CREATE TABLE "Plan" (
  "id" TEXT NOT NULL, "slug" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "priceMinor" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'INR', "durationDays" INTEGER,
  "billingType" "BillingType" NOT NULL DEFAULT 'ONE_TIME', "features" JSONB NOT NULL,
  "providerPriceId" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");
CREATE INDEX "Plan_isActive_isPublic_idx" ON "Plan"("isActive", "isPublic");
CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "planId" TEXT NOT NULL, "provider" TEXT,
  "providerCustomerId" TEXT, "providerSubscriptionId" TEXT, "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "startsAt" TIMESTAMP(3), "currentPeriodStart" TIMESTAMP(3), "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false, "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Subscription_provider_providerSubscriptionId_key" ON "Subscription"("provider", "providerSubscriptionId");
CREATE INDEX "Subscription_userId_status_currentPeriodEnd_idx" ON "Subscription"("userId", "status", "currentPeriodEnd");
CREATE INDEX "Subscription_planId_status_idx" ON "Subscription"("planId", "status");
CREATE TABLE "PaymentEvent" (
  "id" TEXT NOT NULL, "provider" TEXT NOT NULL, "providerEventId" TEXT NOT NULL, "eventType" TEXT NOT NULL,
  "orderId" TEXT, "payload" JSONB, "processedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentEvent_provider_providerEventId_key" ON "PaymentEvent"("provider", "providerEventId");
CREATE INDEX "PaymentEvent_orderId_createdAt_idx" ON "PaymentEvent"("orderId", "createdAt");
CREATE INDEX "PaymentEvent_eventType_processedAt_idx" ON "PaymentEvent"("eventType", "processedAt");
