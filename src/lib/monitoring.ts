import { prisma } from "@/lib/prisma";

type TrackEventInput = {
  type: string;
  message: string;
  clubId?: string | null;
  userId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function trackEvent(input: TrackEventInput) {
  try {
    await prisma.appEvent.create({
      data: {
        type: input.type,
        message: input.message,
        clubId: input.clubId ?? null,
        userId: input.userId ?? null,
        metadata: input.metadata
      }
    });
  } catch (error) {
    console.error("Failed to track app event", error);
  }
}
