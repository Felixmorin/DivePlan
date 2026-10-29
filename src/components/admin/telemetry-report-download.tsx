"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export function TelemetryReportDownload({ period }: { period: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadReport() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/observability/report?period=${encodeURIComponent(period)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (response.redirected) {
        setError("La session administrateur a expiré. Reconnecte-toi puis réessaie.");
        return;
      }
      if (!response.ok) {
        setError(`Le serveur n’a pas pu générer le rapport (HTTP ${response.status}).`);
        return;
      }
      if (!contentType.includes("application/json")) {
        setError("La réponse reçue n’est pas un rapport JSON. Vérifie ta session administrateur.");
        return;
      }

      const content = await response.text();
      JSON.parse(content);
      const blobUrl = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1];
      link.href = blobUrl;
      link.download = filename || `rapport-telemetrie-diveplan-${period}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);
    } catch {
      setError("Le rapport n’a pas pu être généré. Réessaie ou vérifie ta connexion administrateur.");
    } finally {
      setPending(false);
    }
  }

  return <div className="flex flex-col items-start gap-1">
    <button type="button" onClick={downloadReport} disabled={pending} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-blue-200 bg-blue-700 px-3 font-bold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60">
      <Download className="h-4 w-4" />{pending ? "Génération du rapport…" : "Télécharger le rapport IA (JSON)"}
    </button>
    <p role="status" aria-live="polite" className="text-xs text-rose-700">{error}</p>
  </div>;
}
