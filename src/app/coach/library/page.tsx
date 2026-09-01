import { Search, Star } from "lucide-react";
import { CoachShell } from "@/components/coach/coach-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { drylandLibrary, templates } from "@/lib/data";

export default function LibraryPage() {
  return (
    <CoachShell active="Bibliotheque">
      <div className="mb-6"><h1 className="text-3xl font-black">Bibliotheque</h1><p className="text-slate-500">Dryland, plongeons, templates, favoris et recherche.</p></div>
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-white p-2"><Search className="h-5 w-5 text-slate-400" /><Input className="border-0 focus:ring-0" placeholder="Rechercher un exercice, plongeon ou modele" /></div>
      <Tabs defaultValue="dryland">
        <TabsList><TabsTrigger value="dryland">Dryland</TabsTrigger><TabsTrigger value="dives">Plongeons</TabsTrigger><TabsTrigger value="templates">Templates</TabsTrigger></TabsList>
        <TabsContent value="dryland" className="mt-4 grid gap-4 md:grid-cols-3">{drylandLibrary.map((exercise) => <Card key={exercise.name}><CardHeader><div className="flex justify-between"><CardTitle>{exercise.name}</CardTitle><Star className="h-4 w-4 text-orange-400" /></div></CardHeader><CardContent><Badge>{exercise.category}</Badge><p className="mt-3 text-sm text-slate-500">{exercise.sets} x {exercise.reps ?? exercise.duration} · {exercise.equipment}</p></CardContent></Card>)}</TabsContent>
        <TabsContent value="dives" className="mt-4 grid gap-4 md:grid-cols-3">{["101C", "201B", "201C", "203C", "301C", "401B", "5331D"].map((code) => <Card key={code}><CardContent className="p-4"><div className="text-2xl font-black">{code}</div><p className="text-sm text-slate-500">Categorie technique · 1m / 3m</p></CardContent></Card>)}</TabsContent>
        <TabsContent value="templates" className="mt-4 grid gap-4 md:grid-cols-3">{templates.map((template) => <Card key={template}><CardContent className="p-4"><div className="font-black">{template}</div><p className="text-sm text-slate-500">Charger · Dupliquer · Modifier · Supprimer</p></CardContent></Card>)}</TabsContent>
      </Tabs>
    </CoachShell>
  );
}
