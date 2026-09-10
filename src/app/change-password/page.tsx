import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck, Waves } from "lucide-react";
import { ChangePasswordForm } from "@/app/change-password/change-password-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "ATHLETE") {
    redirect("/coach");
  }

  if (user.passwordSetAt) {
    redirect("/athlete");
  }

  return (
    <main className="aquatic-grid grid min-h-screen place-items-center bg-[var(--color-coach-bg)] px-4 py-8">
      <Card className="w-full max-w-md overflow-hidden">
        <div className="h-2 bg-[var(--color-brand)]" />
        <CardHeader>
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-navy)] text-[var(--color-brand)]">
            <KeyRound className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl">Crée ton mot de passe</CardTitle>
          <p className="text-sm leading-6 text-[var(--color-ink-muted)]">Bienvenue {user.firstName}. Pour sécuriser ton compte, remplace le mot de passe temporaire avant d’accéder à tes entraînements.</p>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
          <div className="mt-5 flex items-start gap-2 rounded-xl bg-[var(--color-surface-raised)] p-3 text-xs font-bold text-[var(--color-ink-muted)]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" />
            <span>Ton coach ne pourra pas voir le nouveau mot de passe.</span>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs font-black uppercase text-[var(--color-ink-soft)]">
            <Waves className="h-4 w-4" /> DivePlan
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
