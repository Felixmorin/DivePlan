import { CoachShell } from "@/components/coach/coach-shell";

export default function PlanificationPage() {
  return (
    <CoachShell active="Planification">
      <main className="mx-auto w-full max-w-7xl p-6">
        <section className="athlete-panel">
          <h1 className="text-2xl font-black">Planification</h1>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Créez une séance pour planifier les entraînements de vos athlètes.</p>
        </section>
      </main>
    </CoachShell>
  );
}
