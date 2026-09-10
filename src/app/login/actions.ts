"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = {
  error?: string;
};

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const submittedEmail = String(formData.get("email") ?? "").trim();
  const submittedPassword = String(formData.get("password") ?? "");
  const devQuickLogin = process.env.NODE_ENV !== "production" && !submittedEmail && !submittedPassword;

  try {
    await signIn("credentials", {
      email: devQuickLogin ? "coach@diveplan.local" : submittedEmail,
      password: devQuickLogin ? "diveplan-demo" : submittedPassword,
      redirectTo: "/"
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Nom d'utilisateur, courriel ou mot de passe invalide." };
    }

    throw error;
  }

  return {};
}
