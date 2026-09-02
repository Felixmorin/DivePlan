import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus, Printer } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { StatusPill } from "@/components/training/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { demoRoutesEnabled } from "@/lib/demo-routes";

export default function EditSessionPage() {
  if (!demoRoutesEnabled()) {
    notFound();
  }

  return (
    <CoachShell active="Seances">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <StatusPill status="DRAFT" />
          <h1 className="mt-2 text-3xl font-black text-[var(--color-ink)]">Modifier la séance</h1>
          <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">La route demo explique l&apos;état actuel sans simuler une édition inexistante.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/coach/sessions/demo"><ArrowLeft className="h-4 w-4" /> Retour</Link>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
          <CardTitle>Édition demo non persistante</CardTitle>
          <CardDescription>La création, la publication et l&apos;impression réelles restent disponibles avec une base configurée.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
          <p className="max-w-2xl text-sm leading-6 text-[var(--color-ink-muted)]">
            Pour éviter une fausse sauvegarde, cet écran ne modifie pas la séance demo. Utilise le builder réel pour créer une séance avec blocs et assignations.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 md:flex">
            <Button asChild variant="action"><Link href="/coach/sessions/new"><CalendarPlus className="h-4 w-4" /> Créer une séance</Link></Button>
            <Button asChild variant="outline"><Link href="/coach/sessions/demo/print"><Printer className="h-4 w-4" /> Imprimer</Link></Button>
          </div>
        </CardContent>
      </Card>
    </CoachShell>
  );
}
