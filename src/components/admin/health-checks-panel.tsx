import { Check, CircleHelp, CircleX, MinusCircle, TriangleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { HealthVerificationActions } from "@/components/admin/health-verification-actions";
import type { HealthCheck, HealthState } from "@/lib/admin-health";

const labels: Record<HealthState, string> = {
  ok: "Répond",
  warning: "Signal observé",
  failed: "Échec",
  unknown: "Non vérifié",
  not_configured: "Non configuré",
  disabled: "Désactivé · optionnel"
};
const styles: Record<HealthState, string> = {
  ok: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-50 text-amber-900",
  failed: "bg-rose-50 text-rose-900",
  unknown: "bg-sky-50 text-sky-900",
  not_configured: "bg-slate-100 text-slate-700",
  disabled: "bg-slate-100 text-slate-600"
};
const Icon = ({ state }: { state: HealthState }) => state === "ok" ? <Check className="h-4 w-4"/> : state === "failed" ? <CircleX className="h-4 w-4"/> : state === "warning" ? <TriangleAlert className="h-4 w-4"/> : state === "disabled" ? <MinusCircle className="h-4 w-4"/> : <CircleHelp className="h-4 w-4"/>;

export function HealthChecksPanel({ checks, checkedAt }: { checks: HealthCheck[]; checkedAt: string }) {
  return <Card className="mb-4">
    <CardContent className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div><h2 className="text-base font-black text-slate-950">Vérifications des services</h2><p className="mt-1 text-xs text-slate-600">Sondes de disponibilité et tests réels à la demande. Les parcours utilisateur complets ne sont pas automatisés.</p></div>
        <time dateTime={checkedAt} className="text-xs text-slate-500">Vérifié à {new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Toronto" }).format(new Date(checkedAt))}</time>
      </div>
      <ul className="divide-y divide-slate-100">
        {checks.map(check => <li key={check.id} className="grid gap-1.5 py-3 sm:grid-cols-[minmax(175px,.65fr)_minmax(0,1.35fr)] sm:items-start sm:gap-4">
          <div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold ${styles[check.state]}`}><Icon state={check.state}/>{labels[check.state]}</span><span className="text-sm font-bold text-slate-800">{check.name}</span></div>
          <p className="text-xs leading-5 text-slate-600">{check.detail}</p>
        </li>)}
      </ul>
      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">« Contrôles passés » signifie que les sondes automatiques configurées ont répondu. Cela ne prouve pas que chaque action utilisateur, notification ou service externe fonctionne de bout en bout.</p>
      <HealthVerificationActions/>
    </CardContent>
  </Card>;
}
