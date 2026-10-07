"use client";

import { useCallback, useEffect, useState } from "react";

type State = "checking" | "unsupported" | "disabled" | "enabled" | "denied" | "error";
type PushSubscriptionJSON = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

function isAppleMobile() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function syncSubscription(subscription: PushSubscription) {
  const data = subscription.toJSON() as PushSubscriptionJSON;
  const response = await fetch("/api/push/subscriptions", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: data.endpoint, keys: data.keys })
  });
  if (!response.ok) throw new Error("subscription_sync_failed");
}

export async function clearDevicePushSubscription() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await fetch("/api/push/subscriptions", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => false);
}

export function NotificationSettings() {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");
  const [appleMobile, setAppleMobile] = useState(false);
  const [standalone, setStandalone] = useState(false);

  const refresh = useCallback(async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window) || !window.isSecureContext) {
      setState("unsupported");
      return;
    }
    setAppleMobile(isAppleMobile());
    const installed = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setStandalone(installed);
    if (Notification.permission === "denied") { setState("denied"); return; }
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await syncSubscription(subscription);
      setState("enabled");
    } else setState("disabled");
  }, []);

  useEffect(() => { void Promise.resolve().then(refresh).catch(() => setState("error")); }, [refresh]);

  async function enable() {
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") { setState("denied"); return; }
      if (permission !== "granted") { setState("disabled"); setMessage("Aucune permission n’a été accordée."); return; }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("vapid_key_missing");
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) as BufferSource });
      await syncSubscription(subscription);
      setState("enabled");
      setMessage("Notifications activées sur cet appareil.");
    } catch {
      setState("error");
      setMessage("Impossible d’activer les notifications. Vérifie la connexion et réessaie.");
    }
  }

  async function disable() {
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/subscriptions", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        if (!response.ok) throw new Error("unsubscribe_failed");
        await subscription.unsubscribe();
      }
      setState(Notification.permission === "denied" ? "denied" : "disabled");
      setMessage("Notifications désactivées sur cet appareil.");
    } catch { setMessage("Impossible de désactiver les notifications. Réessaie."); }
  }

  async function test() {
    setMessage("");
    try {
      const subscription = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
      if (!subscription) { setState("disabled"); return; }
      const response = await fetch("/api/push/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
      const body = await response.json() as { message?: string };
      setMessage(body.message ?? "Le test n’a pas abouti.");
    } catch { setMessage("Le test n’a pas abouti. Réessaie dans quelques instants."); }
  }

  const status = {
    checking: "Vérification de cet appareil…", unsupported: "Les notifications Web Push ne sont pas prises en charge par ce navigateur ou ce contexte.",
    disabled: "Désactivées sur cet appareil", enabled: "Activées sur cet appareil", denied: "Permission refusée dans le navigateur",
    error: "État des notifications indisponible"
  }[state];

  return <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5" aria-labelledby="notification-settings-title">
    <h2 id="notification-settings-title" className="text-lg font-black text-[var(--color-ink)]">Notifications</h2>
    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">État : <span role="status" className="font-bold">{status}</span></p>
    {state === "denied" && <p className="mt-3 text-sm text-[var(--color-ink-muted)]">Pour les réactiver, autorise les notifications de DivePlan dans les réglages du navigateur ou de l’appareil, puis reviens ici. DivePlan ne redemandera pas la permission automatiquement.</p>}
    {appleMobile && !standalone && <p className="mt-3 rounded-xl bg-cyan-50 p-3 text-sm text-slate-700">Sur iPhone ou iPad, ajoute d’abord DivePlan à l’écran d’accueil : ouvre le menu Partager, choisis « Sur l’écran d’accueil », puis ouvre DivePlan depuis son icône.</p>}
    {state === "unsupported" && appleMobile && !standalone && <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Les notifications seront disponibles après l’ouverture de l’app installée, si ta version d’iOS/iPadOS les prend en charge.</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      {state === "disabled" && <button type="button" onClick={() => void enable()} className="min-h-10 rounded-xl bg-[var(--color-brand-strong)] px-4 text-sm font-bold text-white">Activer les notifications</button>}
      {state === "enabled" && <><button type="button" onClick={() => void test()} className="min-h-10 rounded-xl bg-[var(--color-brand-strong)] px-4 text-sm font-bold text-white">Envoyer une notification de test</button><button type="button" onClick={() => void disable()} className="min-h-10 rounded-xl border border-[var(--color-border)] px-4 text-sm font-bold">Désactiver sur cet appareil</button></>}
    </div>
    {message && <p className="mt-3 text-sm text-[var(--color-ink-muted)]" role="status">{message}</p>}
  </section>;
}
