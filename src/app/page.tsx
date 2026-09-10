import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role === "ATHLETE") {
    redirect(session.user.mustChangePassword ? "/change-password" : "/athlete");
  }

  redirect("/coach");
}
