export const SESSION_NOT_STARTED_MESSAGE = "Cette séance pourra commencer seulement à l'heure prévue.";

export function isSessionStartAvailable(startsAt: Date | string, now = new Date()) {
  const startTime = typeof startsAt === "string" ? new Date(startsAt).getTime() : startsAt.getTime();
  return Number.isFinite(startTime) && now.getTime() >= startTime;
}

