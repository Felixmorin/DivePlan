"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Bell, KeyRound, Send } from "lucide-react";

type Result = { status?: string; detail?: string };
type Pending = "auth" | "flows" | "sentry" | "push" | null;

export function HealthVerificationActions() {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error" | "neutral">("neutral");

  async function run(path: string, kind: Exclude<Pending, null>) {
    setPending(kind); setMessage(""); setTone("neutral");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", cache: "no-store" });
      const result = await response.json().catch(() => ({})) as Result;
      setMessage(result.detail ?? (response.ok ? "Vérification terminée." : "La vérification a échoué."));
      setTone(response.ok ? "success" : "error");
    } catch {
      setMessage("Le serveur n’a pas répondu. Réessaie après avoir vérifié la connexion."); setTone("error");
    } finally { setPending(null); router.refresh(); }
  }

  async function testPush() {
    setPending("push"); setMessage(""); setTone("neutral");
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window) || !window.isSecureContext) throw new Error("Ce navigateur ou cette origine ne prend pas en charge Web Push.");
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY n’est pas configurée.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Autorise les notifications dans le navigateur pour recevoir le test.");
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) as BufferSource });
      const startedResponse = await fetch("/api/admin/health/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()), cache: "no-store" });
      const started = await startedResponse.json() as Result & { checkId?: string };
      if (!startedResponse.ok || !started.checkId) throw new Error(started.detail ?? "Le serveur n’a pas pu envoyer le push de test.");
      setMessage(started.detail ?? "Test envoyé; attente de l’accusé du service worker…");
      for (let attempt = 0; attempt < 45; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const response = await fetch(`/api/admin/health/push?id=${encodeURIComponent(started.checkId)}`, { cache: "no-store" });
        const result = await response.json() as Result;
        if (result.status !== "pending") {
          setMessage(result.detail ?? "Test terminé."); setTone(result.status === "ok" ? "success" : "error"); router.refresh(); return;
        }
      }
      setMessage("Le fournisseur a accepté le push; l’appareil n’a pas encore accusé réception. Vérifie ses notifications."); setTone("error");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Le test Web Push a échoué."); setTone("error");
    } finally { setPending(null); router.refresh(); }
  }

  return <section aria-labelledby="health-actions-title" className="mt-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
    <div className="mb-3"><h3 id="health-actions-title" className="text-sm font-black text-slate-900">Lancer des vérifications réelles</h3><p className="mt-1 text-xs leading-5 text-slate-600">Les tests d’authentification et de parcours utilisent le compte technique configuré. Le test Sentry crée un événement de test réel. Le test Push affiche une notification sur cet appareil.</p></div>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={pending !== null} onClick={() => void run("/api/admin/health/auth", "auth")} className={buttonClass}><KeyRound className="h-4 w-4"/>{pending === "auth" ? "Test de connexion…" : "Tester la connexion"}</button>
      <button type="button" disabled={pending !== null} onClick={() => void run("/api/admin/health/flows", "flows")} className={buttonClass}><Activity className="h-4 w-4"/>{pending === "flows" ? "Test du parcours…" : "Tester le parcours connecté"}</button>
      <button type="button" disabled={pending !== null} onClick={() => void run("/api/admin/health/sentry", "sentry")} className={buttonClass}><Send className="h-4 w-4"/>{pending === "sentry" ? "Test Sentry…" : "Envoyer et confirmer un événement Sentry"}</button>
      <button type="button" disabled={pending !== null} onClick={() => void testPush()} className={buttonClass}><Bell className="h-4 w-4"/>{pending === "push" ? "Attente de l’appareil…" : "Tester la réception Push sur cet appareil"}</button>
    </div>
    {message && <p role="status" aria-live="polite" className={`mt-3 rounded-lg p-3 text-xs leading-5 ${tone === "success" ? "bg-emerald-50 text-emerald-900" : tone === "error" ? "bg-rose-50 text-rose-900" : "bg-slate-50 text-slate-700"}`}>{message}</p>}
  </section>;
}

const buttonClass = "inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-wait disabled:opacity-60";
function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}
