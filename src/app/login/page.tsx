import { redirect } from "next/navigation";
import { Activity, ShieldCheck, Waves } from "lucide-react";
import { auth } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user?.role === "ATHLETE") {
    redirect("/athlete");
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
          <p className="text-sm leading-6 text-[var(--color-ink-muted)]">Accès pilote pour clubs, coachs et athlètes. Planifie, publie et suis les séances depuis un seul espace.</p>
        </CardHeader>
        <CardContent>
          <LoginForm />
          <div className="mt-5 grid gap-2 text-xs font-bold text-[var(--color-ink-muted)]">
            <div className="min-w-0 overflow-hidden rounded-xl bg-[var(--color-surface-raised)] p-3">
              <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" /> <span className="min-w-0">Rôles COACH, ATHLETE et ADMIN préservés</span></div>
            </div>
            <div className="min-w-0 overflow-hidden rounded-xl bg-[var(--color-surface-raised)] p-3">
              <div className="flex items-start gap-2"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-action)]" /> <span className="min-w-0 break-all">Démo: coach@diveplan.local ou emma@diveplan.local</span></div>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-[var(--color-ink-soft)]">Mot de passe après seed: diveplan-demo. Code temporaire: diveplan-demo.</p>
        </CardContent>
      </Card>
    </main>
  );
}
