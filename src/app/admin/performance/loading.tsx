import { AdminShell } from "@/components/admin/admin-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPerformanceLoading() {
  return <AdminShell active="Performance">
    <div aria-busy="true" aria-label="Chargement des mesures de performance" className="mx-auto max-w-[1680px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><Skeleton className="h-9 w-56" /><Skeleton className="mt-2 h-4 w-96 max-w-full" /></div><Skeleton className="h-10 w-[620px] max-w-full" /></div>
      <Skeleton className="h-[220px] w-full" />
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(440px,0.85fr)]"><Skeleton className="h-[410px]" /><Skeleton className="h-[410px]" /></div>
      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-[1.1fr_0.9fr_0.9fr]"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
    </div>
  </AdminShell>;
}
