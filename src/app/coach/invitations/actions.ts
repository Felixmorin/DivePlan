"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { requireCoach } from "@/lib/current-user";
import { sendInvitationEmail, type InvitationEmailDeliveryResult } from "@/lib/invitation-email";
import { trackEvent } from "@/lib/monitoring";
import { createToken, hashToken } from "@/lib/tokens";
import { prisma } from "@/lib/prisma";

export type InviteState = {
  delivery?: InvitationEmailDeliveryResult;
  error?: string;
  inviteLink?: string;
};

const inviteSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.email(),
  role: z.enum(["COACH", "ATHLETE"]),
  groupId: z.string().optional()
});

export async function createInvitation(_: InviteState, formData: FormData): Promise<InviteState> {
  const { user, clubId } = await requireCoach();
  const parsed = inviteSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    role: formData.get("role"),
    groupId: String(formData.get("groupId") ?? "")
  });

  if (!parsed.success) {
    return { error: "Champs d'invitation invalides." };
  }

  const data = parsed.data;
  const groupId = data.role === "ATHLETE" ? data.groupId || null : null;

  if (groupId) {
    const group = await prisma.trainingGroup.findFirst({ where: { id: groupId, clubId } });
    if (!group) {
      return { error: "Groupe invalide pour ce club." };
    }
  }

  const token = createToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);

  const invitation = await prisma.userInvitation.create({
    data: {
      email: data.email,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      role: data.role as UserRole,
      tokenHash: hashToken(token),
      clubId,
      groupId,
      invitedById: user.id,
      expiresAt
    }
  });

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const inviteLink = `${baseUrl}/invite/${token}`;
  const delivery = await sendInvitationEmail({
    activationUrl: inviteLink,
    clubName: user.club?.name ?? "ton club",
    email: invitation.email,
    firstName: invitation.firstName,
    invitationId: invitation.id,
    invitedByName: `${user.firstName} ${user.lastName}`,
    roleLabel: data.role === "ATHLETE" ? "athlete" : "coach"
  });

  await prisma.userInvitation.update({
    where: { id: invitation.id },
    data: {
      emailDeliveryStatus: delivery.status,
      emailDeliveryError: delivery.status === "SENT" ? null : delivery.error,
      emailProviderMessageId: delivery.status === "SENT" ? delivery.providerMessageId : null,
      emailSentAt: delivery.status === "SENT" ? new Date() : null
    }
  });

  await trackEvent({
    type: "invitation.created",
    message: `Invitation creee pour ${data.email}`,
    clubId,
    userId: user.id,
    metadata: { emailDeliveryStatus: delivery.status, role: data.role }
  });

  revalidatePath("/coach/invitations");
  return { delivery, inviteLink };
}
