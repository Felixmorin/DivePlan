"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";
import { trackEvent } from "@/lib/monitoring";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";

export type AcceptInviteState = {
  error?: string;
};

const acceptSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(10),
  confirmPassword: z.string().min(10)
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas.",
  path: ["confirmPassword"]
});

export async function acceptInvitation(_: AcceptInviteState, formData: FormData): Promise<AcceptInviteState> {
  const parsed = acceptSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword")
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invitation invalide." };
  }

  const tokenHash = hashToken(parsed.data.token);
  const invitation = await prisma.userInvitation.findUnique({ where: { tokenHash } });

  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    return { error: "Invitation expiree ou deja utilisee." };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.upsert({
      where: { email: invitation.email },
      create: {
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        email: invitation.email,
        role: invitation.role,
        clubId: invitation.clubId,
        passwordHash,
        passwordSetAt: new Date()
      },
      update: {
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        role: invitation.role,
        clubId: invitation.clubId,
        passwordHash,
        passwordSetAt: new Date()
      }
    });

    if (invitation.role === "COACH") {
      await tx.coach.upsert({
        where: { userId: createdUser.id },
        create: { userId: createdUser.id, clubId: invitation.clubId },
        update: { clubId: invitation.clubId }
      });
    }

    if (invitation.role === "ATHLETE") {
      await tx.athlete.upsert({
        where: { userId: createdUser.id },
        create: {
          userId: createdUser.id,
          clubId: invitation.clubId,
          groupId: invitation.groupId,
          birthDate: new Date("2010-01-01"),
          level: "A definir",
          active: true
        },
        update: {
          clubId: invitation.clubId,
          groupId: invitation.groupId,
          active: true
        }
      });
    }

    await tx.userInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(), acceptedById: createdUser.id }
    });

    return createdUser;
  });

  await trackEvent({
    type: "invitation.accepted",
    message: `${user.email} a accepte son invitation`,
    clubId: user.clubId,
    userId: user.id,
    metadata: { role: user.role }
  });

  await signIn("credentials", {
    email: user.email,
    password: parsed.data.password,
    redirect: false
  });

  redirect(user.role === "ATHLETE" ? "/athlete" : "/coach");
}
