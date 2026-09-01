"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, UsersRound } from "lucide-react";
import { athletes as demoAthletes } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type AssignableAthlete = {
  id: string;
  firstName: string;
  lastName: string;
  level?: string;
  avatar?: string | null;
};

export function AssignmentSelector({ selected, onChange, athletes = demoAthletes }: { selected: string[]; onChange: (ids: string[]) => void; athletes?: AssignableAthlete[] }) {
  const [mode, setMode] = useState<"group" | "subgroup" | "athletes" | "single">("athletes");
  const selectedText = useMemo(() => `${selected.length} athlete${selected.length > 1 ? "s" : ""}`, [selected.length]);
  const selectedAthletes = athletes.filter((athlete) => selected.includes(athlete.id));

  function toggle(id: string) {
    if (mode === "single") {
      onChange([id]);
      return;
    }
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  function setAll() {
    setMode("group");
    onChange(athletes.map((a) => a.id));
  }

  return (
    <div className="rounded-[var(--radius-ui)] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-black text-[var(--color-ink)]"><UsersRound className="h-4 w-4 text-[var(--color-brand-strong)]" /> Attribue a {selectedText}</div>
          <div className="mt-1 text-xs font-semibold text-[var(--color-ink-muted)]">{selected.length > 1 ? "Bloc partage par plusieurs athletes" : selected.length === 1 ? "Bloc individuel" : "Aucun athlete selectionne"}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={mode === "group" ? "default" : "outline"} onClick={setAll}>Groupe entier</Button>
          <Button type="button" size="sm" variant={mode === "subgroup" ? "default" : "outline"} onClick={() => { setMode("subgroup"); onChange(athletes.slice(0, 3).map((athlete) => athlete.id)); }}>Sous-groupe</Button>
          <Button type="button" size="sm" variant={mode === "athletes" ? "default" : "outline"} onClick={() => setMode("athletes")}>Athletes</Button>
          <Button type="button" size="sm" variant={mode === "single" ? "default" : "outline"} onClick={() => { setMode("single"); onChange(selected.slice(0, 1)); }}>Individuel</Button>
        </div>
      </div>
      {selected.length === 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-2xl border border-[var(--color-action)]/30 bg-[var(--color-action)]/10 p-3 text-sm font-semibold text-[var(--color-action-strong)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Ce bloc ne sera assigne a personne.
        </div>
      )}
      {selectedAthletes.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {selectedAthletes.map((athlete) => (
            <span key={athlete.id} className="inline-flex min-h-8 items-center gap-2 rounded-full bg-[var(--block-pool-bg)] px-2.5 text-xs font-black text-[var(--block-pool-fg)]">
              {athlete.firstName} {athlete.lastName[0]}.
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
        {athletes.map((athlete) => {
          const checked = selected.includes(athlete.id);
          return (
            <button type="button" key={athlete.id} onClick={() => toggle(athlete.id)} className={cn("flex min-h-12 items-center gap-2 rounded-2xl border p-2 text-left transition duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]", checked ? "border-[var(--color-brand)] bg-[var(--block-pool-bg)]" : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]")}>
              <Avatar className="h-8 w-8">
                <AvatarImage src={athlete.avatar ?? undefined} />
                <AvatarFallback>{athlete.firstName[0]}{athlete.lastName[0]}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{athlete.firstName}</div>
                <div className="text-xs text-[var(--color-ink-muted)]">{athlete.level ?? "Athlete"}</div>
              </div>
              {checked && <Check className="h-4 w-4 text-[var(--color-brand-strong)]" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
