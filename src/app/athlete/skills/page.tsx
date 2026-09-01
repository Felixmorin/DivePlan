import { AthleteShell } from "@/components/athlete/athlete-shell";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const skills = [["201B", 78, "developing", 12, 42], ["203C", 62, "learning", 8, 31], ["301C", 71, "developing", 9, 36]];

export default function SkillsPage() {
  return <AthleteShell><div className="mb-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Technique</p><h1 className="mt-2 text-3xl font-black">Competences</h1></div><div className="space-y-3">{skills.map(([code, progress, status, trainings, reps]) => <div key={String(code)} className="rounded-2xl border border-white/10 bg-[#101927] p-5"><div className="flex items-start justify-between"><div><div className="text-4xl font-black leading-none">{code}</div><p className="mt-2 text-sm font-semibold text-slate-400">Niveau 4 · {trainings} entrainements · {reps} reps</p></div><Badge className="bg-white text-slate-950">{String(status)}</Badge></div><Progress value={Number(progress)} className="mt-5 bg-white/10" /><div className="mt-5 grid grid-cols-5 gap-1 text-center text-[10px] font-bold uppercase text-slate-500">{["Start", "Push", "Rotate", "Open", "Entry"].map((item) => <div key={item} className="rounded-md bg-[#0b1320] py-2">{item}</div>)}</div></div>)}</div></AthleteShell>;
}
