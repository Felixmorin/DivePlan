CREATE TYPE "InvitationEmailDeliveryStatus" AS ENUM ('NOT_ATTEMPTED', 'SKIPPED_LOCAL', 'SENT', 'FAILED');

ALTER TABLE "UserInvitation"
ADD COLUMN "emailDeliveryStatus" "InvitationEmailDeliveryStatus" NOT NULL DEFAULT 'NOT_ATTEMPTED',
ADD COLUMN "emailDeliveryError" TEXT,
ADD COLUMN "emailProviderMessageId" TEXT,
ADD COLUMN "emailSentAt" TIMESTAMP(3);
