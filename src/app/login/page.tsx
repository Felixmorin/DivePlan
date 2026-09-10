import { redirect } from "next/navigation";
import { Waves } from "lucide-react";
import { auth } from "@/auth";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ passwordChanged?: string }> }) {
  const session = await auth();
  const query = await searchParams;

  if (session?.user?.role === "ATHLETE") {
    redirect(session.user.mustChangePassword ? "/change-password" : "/athlete");
  }

  if (session?.user?.role === "COACH" || session?.user?.role === "ADMIN") {
    redirect("/coach");
  }

  return (
    <main className="aquatic-grid grid min-h-screen overflow-x-hidden place-items-center bg-[var(--color-coach-bg)] px-4 py-8">
      <Card className="w-[calc(100vw-2rem)] max-w-md overflow-hidden">
        <div className="h-2 bg-[var(--color-brand)]" />
        <CardHeader>
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-navy)] text-[var(--color-brand)]">
            <Waves className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl">Connexion DivePlan</CardTitle>
        </CardHeader>
        <CardContent>
          {query.passwordChanged === "1" && (
            <Alert variant="success" title="Mot de passe enregistré" className="mb-4">
              Reconnecte-toi maintenant avec ton nouveau mot de passe.
            </Alert>
          )}
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
