import { Card, CardContent } from "@/components/ui/card";

export default function ActivityJourneyLoading() {
  return <div aria-label="Chargement de l’activité et des parcours" aria-busy="true" className="mx-auto max-w-[1600px] animate-pulse space-y-4"><div className="h-20 rounded-xl bg-slate-200/70" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Card key={index}><CardContent className="h-28 p-4"><div className="h-full rounded-lg bg-slate-100" /></CardContent></Card>)}</div><div className="grid gap-3 2xl:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <Card key={index}><CardContent className="h-64 p-4"><div className="h-full rounded-lg bg-slate-100" /></CardContent></Card>)}</div><Card><CardContent className="h-72 p-4"><div className="h-full rounded-lg bg-slate-100" /></CardContent></Card></div>;
}
