"use server";

import { z } from "zod";
import { signOut } from "@/auth";
import { getCurrentUser } from "@/lib/current-user";
import { trackEvent } from "@/lib/monitoring";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export type ChangePasswordState = {
  error?: string;
};

const changePasswordSchema = z.object({
  password: z.string().min(10).max(128).regex(/[A-Za-z]/).regex(/[0-9]/),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, { path: ["confirmPassword"] });

export async function changeTemporaryPassword(_: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const user = await getCurrentUser();

  if (!user || user.role !== "ATHLETE") {
    return { error: "Ta session n'est plus valide. Reconnecte-toi avec ton mot de passe temporaire." };
  }

  if (user.passwordSetAt) {
    return { error: "Ton mot de passe a déjà été changé." };
  }

  const parsed = changePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword")
  });

  if (!parsed.success) {
    return { error: "Choisis au moins 10 caractères avec une lettre et un chiffre, puis confirme exactement le même mot de passe." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordSetAt: new Date() }
  });

  await trackEvent({
    type: "athlete.password_changed",
    message: `${user.email} a remplacé son mot de passe temporaire`,
    clubId: user.clubId,
    userId: user.id
  });

  await signOut({ redirectTo: "/login?passwordChanged=1" });
  return {};
}
