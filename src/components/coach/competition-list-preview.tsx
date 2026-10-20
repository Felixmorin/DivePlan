"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Dive = {
  id: string;
  height: "ONE_METER" | "THREE_METER" | "PLATFORM" | "CUSTOM";
  platformHeight: number | null;
  code: string;
  difficulty: number | null;
  note?: string | null;
};

const heights = [
  { value: "ONE_METER", label: "1 m" },
  { value: "THREE_METER", label: "3 m" },
  { value: "PLATFORM", label: "Plateforme" },
  { value: "CUSTOM", label: "Autre" }
] as const;

export function CompetitionListPreview({ name, dives }: { name: string; dives: Dive[] }) {
  const available = heights.filter(({ value }) => dives.some((dive) => dive.height === value));
  const initialHeight = available[0]?.value ?? "ONE_METER";

  return (
    <section className="athlete-panel athlete-list-preview">
      <header className="athlete-list-preview-head">
        <h2>{name}</h2>
        {available.length > 0 && <Tabs defaultValue={initialHeight}>
          <TabsList aria-label="Hauteur de plongeon" className="athlete-list-preview-tabs">
            {available.map(({ value, label }) => <TabsTrigger key={value} value={value}>{label}</TabsTrigger>)}
          </TabsList>
          {available.map(({ value }) => {
            const rows = dives.filter((dive) => dive.height === value);
            return <TabsContent key={value} value={value} className="athlete-list-preview-table-wrap">
              <table className="athlete-list-preview-table">
                <thead><tr><th>#</th><th>Code</th><th>DD</th><th>Notes</th></tr></thead>
                <tbody>{rows.map((dive, index) => <tr key={dive.id}>
                  <td>{index + 1}</td>
                  <td>{dive.code}{dive.height === "PLATFORM" && dive.platformHeight !== null ? <small className="ml-1 text-slate-500">{dive.platformHeight} m</small> : null}</td>
                  <td>{dive.difficulty?.toFixed(1) ?? "—"}</td>
                  <td className="athlete-list-preview-note">{dive.note?.trim() || "—"}</td>
                </tr>)}</tbody>
              </table>
            </TabsContent>;
          })}
        </Tabs>}
        {available.length === 0 && <p className="athlete-empty">Aucun plongeon dans cette liste.</p>}
      </header>
    </section>
  );
}
