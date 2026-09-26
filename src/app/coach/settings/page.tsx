import Image from "next/image";
import { LogOut, Save, Shield, Waves } from "lucide-react";
import { signOutCoach, updateClubSettings, updateCoachAccount, updateCoachPreferences } from "@/app/coach/settings/actions";
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
              <CardDescription>Modifie les informations utilisées pour te connecter.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <form action={updateCoachAccount} className="grid gap-4">
                <div className="grid gap-2">
                  <label htmlFor="coach-email" className="text-xs font-black uppercase text-[var(--color-ink-muted)]">Courriel</label>
                  <Input id="coach-email" name="email" type="email" defaultValue={user.email} autoComplete="email" required maxLength={254} />
                </div>

                <div className="grid gap-2">
                  <label htmlFor="coach-username" className="text-xs font-black uppercase text-[var(--color-ink-muted)]">Nom d’utilisateur</label>
                  <Input id="coach-username" name="username" defaultValue={user.username ?? ""} autoComplete="username" minLength={3} maxLength={30} pattern="[A-Za-z0-9._-]+" placeholder="ex. felix.lavoie" />
                  <p className="text-xs font-semibold text-[var(--color-ink-muted)]">3 à 30 caractères : lettres, chiffres, points, tirets ou tirets bas.</p>
                </div>

                <Button type="submit" variant="action">
                  <Save className="h-4 w-4" />
                  Enregistrer le compte
                </Button>
              </form>

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
              <CardTitle>Préférences</CardTitle>
              <CardDescription>Personnalise ton planning et les feuilles de séance que tu imprimes.</CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <form action={updateCoachPreferences} className="grid gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-xs font-black uppercase text-[var(--color-ink-muted)]">
                    Vue par défaut du planning
                    <select name="planningDefaultView" defaultValue={user.coach?.planningDefaultView ?? "week"} className="h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold normal-case text-[var(--color-ink)] outline-none focus:border-[var(--color-brand)] focus:shadow-[var(--focus-ring)]">
                      <option value="week">Semaine</option>
                      <option value="month">Mois</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-xs font-black uppercase text-[var(--color-ink-muted)]">
                    Premier jour de la semaine
                    <select name="weekStartsOn" defaultValue={String(user.coach?.weekStartsOn ?? 1)} className="h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold normal-case text-[var(--color-ink)] outline-none focus:border-[var(--color-brand)] focus:shadow-[var(--focus-ring)]">
                      <option value="1">Lundi</option>
                      <option value="0">Dimanche</option>
                    </select>
                  </label>
                </div>

                <fieldset className="grid gap-3">
                  <legend className="mb-1 text-xs font-black uppercase text-[var(--color-ink-muted)]">Contenu de la feuille imprimée</legend>
                  <PreferenceCheckbox name="printShowCoachNotes" defaultChecked={user.coach?.printShowCoachNotes ?? true} label="Afficher les notes et consignes du coach" />
                  <PreferenceCheckbox name="printShowAthleteNames" defaultChecked={user.coach?.printShowAthleteNames ?? true} label="Afficher les noms des athlètes" />
                  <PreferenceCheckbox name="printRepetitionChecks" defaultChecked={user.coach?.printRepetitionChecks ?? false} label="Ajouter une case à cocher pour chaque répétition" />
                </fieldset>

                <Button type="submit" variant="action"><Save className="h-4 w-4" /> Enregistrer les préférences</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </CoachShell>
  );
}

function PreferenceCheckbox({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-[var(--radius-ui)] bg-[var(--color-surface-raised)] px-3 text-sm font-semibold text-[var(--color-ink-muted)]">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 accent-[var(--color-brand-strong)]" />
      <span>{label}</span>
    </label>
  );
}
