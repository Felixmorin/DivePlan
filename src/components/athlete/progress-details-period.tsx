"use client";

import { useRouter } from "next/navigation";

export function ProgressDetailsPeriod({ period, family }: { period: string; family: string }) {
  const router = useRouter();
  return <select aria-label="Période" className="progress-details-period" value={period} onChange={(event) => {
    const params = new URLSearchParams({ period: event.target.value });
    if (family) params.set("family", family);
    router.push(`/athlete/progress/details?${params.toString()}`);
  }}>
    <option value="week">Semaine</option>
    <option value="month">Mois</option>
    <option value="season">Saison</option>
  </select>;
}
