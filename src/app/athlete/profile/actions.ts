"use server";

import { signOut } from "@/auth";

export async function signOutAthlete() {
  await signOut({ redirectTo: "/login" });
}
