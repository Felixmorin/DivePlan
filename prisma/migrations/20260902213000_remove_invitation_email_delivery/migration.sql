ALTER TABLE "UserInvitation"
DROP COLUMN IF EXISTS "emailDeliveryStatus",
DROP COLUMN IF EXISTS "emailDeliveryError",
DROP COLUMN IF EXISTS "emailProviderMessageId",
DROP COLUMN IF EXISTS "emailSentAt";

DROP TYPE IF EXISTS "InvitationEmailDeliveryStatus";
