import Link from "next/link";
import { CoachShell } from "@/components/coach/coach-shell";
import { requireCoach } from "@/lib/current-user";

export default async function CoachAccessDeniedPage() {
  await requireCoach();
  return <CoachShell active="Accès"><section className="mx-auto mt-12 max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-black text-[#0b214d]">Fonctionnalité indisponible</h1><p className="mt-2 text-sm text-slate-600">L’accès à cette page a été désactivé pour votre compte. Communiquez avec votre administrateur si vous pensez qu’il s’agit d’une erreur.</p><Link href="/login" className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white">Retour</Link></section></CoachShell>;
}
