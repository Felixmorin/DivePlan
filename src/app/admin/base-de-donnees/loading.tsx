import { AdminShell } from "@/components/admin/admin-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminDatabaseLoading() {
  return <AdminShell active="Base de données">
    <div aria-busy="true" aria-label="Chargement des données de consommation" className="mx-auto max-w-[1660px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><Skeleton className="h-9 w-96 max-w-full" /><Skeleton className="mt-2 h-4 w-72 max-w-full" /></div><Skeleton className="h-10 w-[520px] max-w-full" /></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-32" />)}</div>
      <Skeleton className="h-[300px] w-full" />
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.25fr)_minmax(390px,0.75fr)]"><Skeleton className="h-[380px]" /><Skeleton className="h-[320px]" /></div>
      <div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
    </div>
  </AdminShell>;
}
