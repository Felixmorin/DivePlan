import Image from "next/image";
import { LogOut, Save, Settings, Shield, Waves } from "lucide-react";
import { signOutCoach, updateClubSettings } from "@/app/coach/settings/actions";
import { CoachShell } from "@/components/coach/coach-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireCoach } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function CoachSettingsPage() {
  const { user } = await requireCoach();
  const clubName = user.club?.name ?? "Performance aquatique";
  const logo = user.club?.logo ?? "";

  return (
    <CoachShell active="Reglages">
      <div className="mb-6">
        <p className="text-sm font-black uppercase text-[var(--color-brand-strong)]">Administration</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--color-ink)]">Réglages</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Identité du club, accès coach et préférences de l’application.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
            <CardTitle>Identité affichée</CardTitle>
            <CardDescription>Ces valeurs apparaissent dans le coin supérieur gauche du portail coach.</CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <form action={updateClubSettings} className="grid gap-5">
              <div className="grid gap-2">
                <label htmlFor="club-name" className="text-xs font-black uppercase text-[var(--color-ink-muted)]">Nom sous DivePlan</label>
                <Input id="club-name" name="name" defaultValue={clubName} required minLength={2} maxLength={80} placeholder="Performance aquatique" />
              </div>

              <div className="grid gap-2">
                <label htmlFor="club-logo" className="text-xs font-black uppercase text-[var(--color-ink-muted)]">Logo</label>
                <Input id="club-logo" name="logo" defaultValue={logo} placeholder="https://.../logo.png ou /logo.png" />
                <p className="text-xs font-semibold text-[var(--color-ink-muted)]">Laisse vide pour utiliser l’icône DivePlan par défaut.</p>
              </div>

              <div className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-white p-4">
                <div className="mb-3 text-xs font-black uppercase text-[var(--color-ink-muted)]">Aperçu actuel</div>
                <div className="flex items-center gap-3 rounded-2xl bg-[var(--color-navy)] p-4 text-white">
                  {logo ? (
                    <span className="relative flex h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-white">
                      <Image src={logo} alt={`Logo ${clubName}`} fill sizes="48px" className="object-cover" />
                    </span>
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-brand)] text-[var(--color-navy)]">
                      <Waves className="h-6 w-6" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="text-lg font-black">DivePlan</div>
                    <div className="truncate text-xs font-semibold uppercase text-white/45">{clubName}</div>
                  </div>
                </div>
              </div>

              <Button type="submit" variant="action">
                <Save className="h-4 w-4" />
                Enregistrer les réglages
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b border-[var(--color-border)] bg-white">
              <CardTitle>Compte coach</CardTitle>
              <CardDescription>{user.email}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-ui)] bg-[var(--color-surface-raised)] px-3 py-3">
                <span className="flex items-center gap-2 text-sm font-black text-[var(--color-ink)]"><Shield className="h-4 w-4" /> Session active</span>
                <Badge variant="success">Coach</Badge>
              </div>
              <form action={signOutCoach}>
                <Button type="submit" variant="outline" className="w-full">
                  <LogOut className="h-4 w-4" />
                  Me déconnecter
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-[var(--color-border)] bg-white">
              <CardTitle>À venir</CardTitle>
              <CardDescription>Paramètres utiles à ajouter sans alourdir cette première version.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 p-5 text-sm font-semibold text-[var(--color-ink-muted)]">
              <SettingPreview icon={<Settings className="h-4 w-4" />} label="Préférences d’impression" />
              <SettingPreview icon={<Settings className="h-4 w-4" />} label="Heures par défaut des séances" />
              <SettingPreview icon={<Settings className="h-4 w-4" />} label="Gestion des accès coach" />
            </CardContent>
          </Card>
        </div>
      </div>
    </CoachShell>
  );
}

function SettingPreview({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-[var(--radius-ui)] bg-[var(--color-surface-raised)] px-3">
      {icon}
      <span>{label}</span>
    </div>
  );
}
