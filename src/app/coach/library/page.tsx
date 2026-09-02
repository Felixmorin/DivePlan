import { Search, Star } from "lucide-react";
import Link from "next/link";
import { CoachShell } from "@/components/coach/coach-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireCoach } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { parseSessionTemplatePayload } from "@/lib/session-template";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const { clubId } = await requireCoach();
  const [drylandLibrary, templates] = clubId === "dev-club"
    ? [[], []]
    : await Promise.all([
        prisma.drylandExercise.findMany({
          orderBy: [{ category: "asc" }, { name: "asc" }],
          select: { id: true, name: true, category: true, defaultSets: true, defaultReps: true, defaultDuration: true, equipment: true }
        }),
        prisma.sessionTemplate.findMany({
          where: { clubId },
          orderBy: [{ favorite: "desc" }, { name: "asc" }]
        })
      ]);

  return (
    <CoachShell active="Bibliotheque">
      <div className="mb-6"><h1 className="text-3xl font-black">Bibliotheque</h1><p className="text-slate-500">Dryland, plongeons, templates, favoris et recherche.</p></div>
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-white p-2"><Search className="h-5 w-5 text-slate-400" /><Input className="border-0 focus:ring-0" placeholder="Rechercher un exercice, plongeon ou modele" /></div>
      <Tabs defaultValue="dryland">
        <TabsList><TabsTrigger value="dryland">Dryland</TabsTrigger><TabsTrigger value="dives">Plongeons</TabsTrigger><TabsTrigger value="templates">Templates</TabsTrigger></TabsList>
        <TabsContent value="dryland" className="mt-4 grid gap-4 md:grid-cols-3">
          {drylandLibrary.map((exercise) => <Card key={exercise.id}><CardHeader><div className="flex justify-between"><CardTitle>{exercise.name}</CardTitle><Star className="h-4 w-4 text-orange-400" /></div></CardHeader><CardContent><Badge>{exercise.category}</Badge><p className="mt-3 text-sm text-slate-500">{exercise.defaultSets ?? 1} x {exercise.defaultReps ?? `${exercise.defaultDuration ?? 30} sec`} · {exercise.equipment ?? "Aucun"}</p></CardContent></Card>)}
          {drylandLibrary.length === 0 && <Card><CardContent className="p-4"><div className="font-black">Aucun exercice dryland</div><p className="text-sm text-slate-500">Ajoute des exercices dryland en base pour alimenter cette bibliotheque.</p></CardContent></Card>}
        </TabsContent>
        <TabsContent value="dives" className="mt-4 grid gap-4 md:grid-cols-3">{["101C", "201B", "201C", "203C", "301C", "401B", "5331D"].map((code) => <Card key={code}><CardContent className="p-4"><div className="text-2xl font-black">{code}</div><p className="text-sm text-slate-500">Categorie technique · 1m / 3m</p></CardContent></Card>)}</TabsContent>
        <TabsContent value="templates" className="mt-4 grid gap-4 md:grid-cols-3">
          {templates.map((template) => {
            const payload = parseSessionTemplatePayload(template.payload);

            return (
              <Card key={template.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-black">{template.name}</div>
                      <p className="text-sm text-slate-500">{template.category} · {payload.blocks.length} blocs</p>
                    </div>
                    {template.favorite && <Star className="h-4 w-4 fill-current text-orange-400" />}
                  </div>
                  <Button asChild size="sm"><Link href={`/coach/sessions/new?templateId=${template.id}`}>Charger</Link></Button>
                </CardContent>
              </Card>
            );
          })}
          {templates.length === 0 && <Card><CardContent className="p-4"><div className="font-black">Aucun modele</div><p className="text-sm text-slate-500">Sauvegarde une seance existante comme modele.</p></CardContent></Card>}
        </TabsContent>
      </Tabs>
    </CoachShell>
  );
}
