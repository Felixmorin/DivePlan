"use client";

import { useRouter } from "next/navigation";

export function ProgressDetailsPeriod({ period, family }: { period: string; family: string }) {
  const router = useRouter();
  return <select aria-label="Période" className="progress-details-period" value={period} onChange={(event) => {
    const params = new URLSearchParams({ period: event.target.value });
    if (family) params.set("family", family);
    router.push(`/athlete/progress/details?${params.toString()}`);
  }}>
    <option value="week">Cette semaine</option>
    <option value="month">Ce mois</option>
    <option value="all">Tout le temps</option>
  </select>;
}
