export const SESSION_NOT_STARTED_MESSAGE = "Cette séance pourra commencer 5 minutes avant l'heure prévue.";

export const SESSION_EARLY_START_MINUTES = 5;

export function isSessionStartAvailable(startsAt: Date | string, now = new Date()) {
  const startTime = typeof startsAt === "string" ? new Date(startsAt).getTime() : startsAt.getTime();
  return Number.isFinite(startTime) && now.getTime() >= startTime - SESSION_EARLY_START_MINUTES * 60_000;
}

