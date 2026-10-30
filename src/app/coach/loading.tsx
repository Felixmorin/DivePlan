export default function CoachLoading() {
  return (
    <main aria-busy="true" aria-label="Chargement de l’accueil coach" className="min-h-[60vh] space-y-5 px-3 py-6 sm:px-5">
      <div className="animate-pulse space-y-2 motion-reduce:animate-none"><div className="h-9 w-64 rounded-lg bg-white/80" /><div className="h-5 w-80 max-w-full rounded-lg bg-white/70" /></div>
      <div className="grid gap-4 lg:grid-cols-2"><div className="h-[301px] animate-pulse rounded-[14px] bg-[var(--color-navy)]/10 motion-reduce:animate-none"/><div className="h-[301px] animate-pulse rounded-[14px] bg-white/80 motion-reduce:animate-none"/></div>
      <div className="h-48 animate-pulse rounded-2xl bg-white/80 motion-reduce:animate-none"/>
      <div className="grid gap-4 xl:grid-cols-3"><div className="h-48 animate-pulse rounded-2xl bg-white/80 motion-reduce:animate-none"/><div className="h-48 animate-pulse rounded-2xl bg-white/80 motion-reduce:animate-none"/><div className="h-48 animate-pulse rounded-2xl bg-white/80 motion-reduce:animate-none"/></div>
    </main>
  );
}
