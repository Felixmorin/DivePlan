DELETE FROM "AppEvent"
WHERE "type" LIKE 'invitation.%';

DROP TABLE "UserInvitation";
