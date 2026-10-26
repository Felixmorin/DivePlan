import { AdminShell } from "@/components/admin/admin-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function SanteGeneraleLoading() {
  return <AdminShell active="Santé générale">
    <div aria-busy="true" aria-label="Chargement de la santé générale" className="mx-auto max-w-[1600px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><Skeleton className="h-9 w-64" /><Skeleton className="mt-2 h-4 w-80 max-w-full" /></div><Skeleton className="h-10 w-72 max-w-full" /></div>
      <Skeleton className="mb-4 h-28 w-full" />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div>
      <div className="mb-4 grid gap-4 2xl:grid-cols-[1.2fr_0.88fr]"><Skeleton className="h-[330px]" /><Skeleton className="h-[330px]" /></div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
    </div>
  </AdminShell>;
}
