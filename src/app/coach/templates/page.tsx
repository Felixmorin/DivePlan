import { CoachShell } from "@/components/coach/coach-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { templates } from "@/lib/data";

export default function TemplatesPage() {
  return (
    <CoachShell active="Bibliotheque">
      <div className="mb-6 flex items-center justify-between"><h1 className="text-3xl font-black">Templates</h1><Button>Nouveau modele</Button></div>
      <div className="grid gap-4 md:grid-cols-3">{templates.map((template) => <Card key={template}><CardContent className="space-y-3 p-5"><h2 className="text-xl font-black">{template}</h2><div className="flex flex-wrap gap-2"><Button size="sm">Charger</Button><Button size="sm" variant="outline">Dupliquer</Button><Button size="sm" variant="outline">Modifier</Button><Button size="sm" variant="outline">Supprimer</Button></div></CardContent></Card>)}</div>
    </CoachShell>
  );
}
