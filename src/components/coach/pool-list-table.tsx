"use client";

import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { parseQuickPoolLine, poolListTotal, validatePoolListRow, type PoolListRow } from "@/lib/pool-list";

export function PoolListTable({ rows, onChange, inputName }: { rows: PoolListRow[]; onChange: (rows: PoolListRow[]) => void; inputName?: string }) {
  function replace(index: number, row: PoolListRow) {
    onChange(rows.map((current, currentIndex) => currentIndex === index ? row : current));
  }

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= rows.length) return;
    const next = [...rows];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {inputName && <input type="hidden" name={inputName} value={JSON.stringify(rows)} />}
      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-[var(--color-navy)] text-left text-xs uppercase text-white">
            <tr><th className="p-3">Hauteur(s) et plongeons</th><th className="w-56 p-3">Repetitions</th><th className="w-20 p-3 text-right">Total</th><th className="w-40 p-3 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const validation = validatePoolListRow(row);
              return (
                <tr key={row.id} className="border-t border-[var(--color-border)] align-top">
                  <td className="p-3">
                    <Input aria-label={`Description ligne ${index + 1}`} defaultValue={`${row.context}${row.context ? ": " : ""}${row.diveCodes.join(", ")}`} placeholder="1m-3m : 101C, 101B, 103B" onChange={(event) => {
                      if (!event.target.value.includes(":")) return;
                      const parsed = parseQuickPoolLine(event.target.value, row.repetitions.join(", "), row.id).row;
                      replace(index, parsed);
                    }} />
                    {validation.heightCount > 1 && <p className="mt-1 text-xs font-bold text-[var(--block-pool-fg)]">Chaque plongeon sera execute aux {validation.heightCount} hauteurs indiquees.</p>}
                    {validation.errors.length > 0 && <p className="mt-1 text-xs font-semibold text-[var(--color-danger)]">{validation.errors.join(" ")}</p>}
                  </td>
                  <td className="p-3"><Input aria-label={`Repetitions ligne ${index + 1}`} defaultValue={row.repetitions.map((value) => Number.isNaN(value) ? "" : value).join(", ")} placeholder="2, 3, 1" onChange={(event) => replace(index, parseQuickPoolLine(`${row.context}: ${row.diveCodes.join(", ")}`, event.target.value, row.id).row)} /></td>
                  <td className={cn("p-3 text-right text-lg font-black", validation.errors.length > 0 && "text-[var(--color-danger)]")}>{validation.total}</td>
                  <td className="p-3"><div className="flex justify-end gap-1">
                    <IconButton label="Monter" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></IconButton>
                    <IconButton label="Descendre" disabled={index === rows.length - 1} onClick={() => move(index, 1)}><ArrowDown /></IconButton>
                    <IconButton label="Dupliquer" onClick={() => onChange([...rows.slice(0, index + 1), { ...row, id: newRowId() }, ...rows.slice(index + 1)])}><Copy /></IconButton>
                    <IconButton label="Supprimer" onClick={() => onChange(rows.filter((_, currentIndex) => currentIndex !== index))}><Trash2 /></IconButton>
                  </div></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-[var(--color-navy)] bg-[var(--color-surface-raised)] font-black"><tr><td className="p-3" colSpan={2}>Total general</td><td className="p-3 text-right text-xl">{poolListTotal(rows)}</td><td /></tr></tfoot>
        </table>
      </div>
      <Button type="button" variant="outline" onClick={() => onChange([...rows, { id: newRowId(), context: "", diveCodes: [], repetitions: [] }])}><Plus className="h-4 w-4" /> Ajouter une ligne vide</Button>
      <p className="text-xs font-semibold text-[var(--color-ink-muted)]">Une seule repetition s&apos;applique a tous les plongeons. Avec plusieurs hauteurs, le total est multiplie par le nombre de hauteurs.</p>
    </div>
  );
}

export function PoolListFormTable({ initialRows, inputName }: { initialRows: PoolListRow[]; inputName: string }) {
  const [rows, setRows] = useState(initialRows);
  return <PoolListTable rows={rows} onChange={setRows} inputName={inputName} />;
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactElement<{ className?: string }> }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white disabled:opacity-30 [&_svg]:h-4 [&_svg]:w-4">{children}</button>;
}

function newRowId() {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
