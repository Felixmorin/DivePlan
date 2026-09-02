"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = {
  error?: string;
};

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const submittedEmail = String(formData.get("email") ?? "").trim();
  const submittedPassword = String(formData.get("password") ?? "");
  const submittedAccessCode = String(formData.get("accessCode") ?? "");
  const devQuickLogin = process.env.NODE_ENV !== "production" && !submittedEmail && !submittedPassword && !submittedAccessCode;

  try {
    await signIn("credentials", {
      email: devQuickLogin ? "coach@diveplan.local" : submittedEmail,
      password: devQuickLogin ? "diveplan-demo" : submittedPassword,
      accessCode: submittedAccessCode,
      redirectTo: "/coach"
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email, mot de passe ou code pilote invalide." };
    }

    throw error;
  }

  return {};
}
