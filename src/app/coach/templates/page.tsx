import Link from "next/link";
import { FileText, Star, Trash2 } from "lucide-react";
import { deleteSessionTemplate, toggleSessionTemplateFavorite } from "@/app/coach/sessions/actions";
import { CoachShell } from "@/components/coach/coach-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { sessionTemplatePayloadSchema } from "@/lib/session-template";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const { clubId } = await requireCoach();

  if (clubId === "dev-club") {
    return (
      <CoachShell active="Template">
        <div className="mb-6 flex items-center justify-between">
          <div><h1 className="text-3xl font-black">Templates</h1><p className="text-[var(--color-ink-muted)]">Mode demo local sans PostgreSQL.</p></div>
          <Button asChild><Link href="/coach/sessions/demo">Ouvrir la seance demo</Link></Button>
        </div>
        <EmptyState title="Base de donnees requise" description="Les modeles de seance sont sauvegardes dans Prisma et necessitent DATABASE_URL." />
      </CoachShell>
    );
  }

  const templates = await prisma.sessionTemplate.findMany({
    where: { clubId },
    orderBy: [{ favorite: "desc" }, { name: "asc" }]
  });

  return (
    <CoachShell active="Template">
      <div className="mb-6 flex items-center justify-between">
        <div><h1 className="text-3xl font-black">Templates</h1><p className="text-[var(--color-ink-muted)]">Modeles sauvegardes par les coachs du club.</p></div>
        <Button asChild><Link href="/coach/sessions/new">Nouvelle seance</Link></Button>
      </div>
      {templates.length === 0 ? (
        <EmptyState title="Aucun modele" description="Ouvre une seance existante et sauvegarde-la comme modele pour alimenter cette bibliotheque." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => {
            const parsedPayload = sessionTemplatePayloadSchema.safeParse(template.payload);
            const payload = parsedPayload.success ? parsedPayload.data : null;
            const volume = payload?.blocks.reduce((sum, block) => sum + block.estimatedVolume, 0) ?? 0;
            const athleteCount = new Set(payload?.blocks.flatMap((block) => block.athleteIds) ?? []).size;

            return (
              <Card key={template.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{template.name}</CardTitle>
                      <p className="mt-1 text-sm font-semibold text-[var(--color-ink-muted)]">{template.category === "Dryland" ? "Bloc dryland" : template.category}</p>
                    </div>
                    <form action={toggleSessionTemplateFavorite}>
                      <input type="hidden" name="templateId" value={template.id} />
                      <Button type="submit" variant="outline" size="icon" aria-label={template.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}>
                        <Star className={`h-4 w-4 ${template.favorite ? "fill-current text-[var(--color-action)]" : ""}`} />
                      </Button>
                    </form>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-sm font-bold text-[var(--color-ink-muted)]">
                    <span>{payload?.blocks.length ?? 0} blocs</span>
                    <span>{volume} vol.</span>
                    <span>{athleteCount} athletes</span>
                  </div>
                  {!payload && <p role="alert" className="text-sm font-semibold text-[var(--color-danger)]">Ce template contient des données incomplètes et ne peut pas être chargé.</p>}
                  <div className="flex flex-wrap gap-2">
                    {payload && <Button asChild size="sm" variant="action"><Link href={`/coach/sessions/new?templateId=${template.id}`}><FileText className="h-4 w-4" /> Charger</Link></Button>}
                    <form action={deleteSessionTemplate}>
                      <input type="hidden" name="templateId" value={template.id} />
                      <Button type="submit" size="sm" variant="outline"><Trash2 className="h-4 w-4" /> Supprimer</Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </CoachShell>
  );
}
