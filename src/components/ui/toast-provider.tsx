"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Check, Info, TriangleAlert, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";
type ToastMessage = { id: number; message: string; kind: ToastKind; action?: { label: string; onClick: () => void } };
type ToastContextValue = { notify: (message: string, kind?: ToastKind, action?: ToastMessage["action"]) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast doit être utilisé dans ToastProvider.");
  return value;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const pathname = usePathname();
  const notify = useCallback((message: string, kind: ToastKind = "success", action?: ToastMessage["action"]) => {
    const id = Date.now() + Math.random();
    setToasts((items) => [...items.slice(-2), { id, message, kind, action }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4500);
  }, []);
  const context = useMemo(() => ({ notify }), [notify]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const notice = url.searchParams.get("notice");
    const messages: Record<string, string> = {
      "session-created": "Séance créée",
      "session-updated": "Séance mise à jour",
      "session-deleted": "Séance supprimée"
    };
    if (!notice || !messages[notice]) return;
    notify(messages[notice]);
    url.searchParams.delete("notice");
    window.history.replaceState(window.history.state, "", `${pathname}${url.search}${url.hash}`);
  }, [notify, pathname]);

  return <ToastContext.Provider value={context}>
    {children}
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[200] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-5 sm:w-[min(25rem,calc(100vw-2rem))]" aria-label="Notifications" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => {
        const Icon = toast.kind === "success" ? Check : toast.kind === "error" ? TriangleAlert : Info;
        const color = toast.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : toast.kind === "error" ? "border-red-200 bg-red-50 text-red-950" : "border-blue-200 bg-blue-50 text-blue-950";
        return <div key={toast.id} role={toast.kind === "error" ? "alert" : "status"} className={`pointer-events-auto flex min-h-12 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm font-semibold shadow-lg motion-safe:animate-[toast-in_180ms_ease-out] ${color}`}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{toast.message}</span>
          {toast.action && <button type="button" className="shrink-0 underline underline-offset-2" onClick={toast.action.onClick}>{toast.action.label}</button>}
          <button type="button" aria-label="Fermer la notification" className="grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-black/5" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}><X className="h-4 w-4" /></button>
        </div>;
      })}
    </div>
  </ToastContext.Provider>;
}
