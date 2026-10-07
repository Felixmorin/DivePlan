"use client";

import { useCallback, useEffect, useState } from "react";

type State = "checking" | "unsupported" | "disabled" | "enabled" | "denied" | "configuration" | "storage" | "error";
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
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    if (result?.error === "storage_unavailable") throw new Error("storage_unavailable");
    throw new Error(`server_${response.status}_${result?.error ?? "request_failed"}`);
  }
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
    } else setState(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? "disabled" : "configuration");
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh).catch((error: unknown) => {
      if (error instanceof Error && error.message === "storage_unavailable") {
        setState("storage");
        setMessage("La base des abonnements Web Push n’est pas disponible. Vérifie que la migration SQL Web Push a été appliquée.");
      } else if (error instanceof Error && error.message.startsWith("server_")) {
        setState("error");
        setMessage("Le serveur n’a pas pu enregistrer l’abonnement de cet appareil. Vérifie la session et la connexion à la base.");
      } else {
        setState("error");
        setMessage("Impossible de vérifier cet appareil. Vérifie ta connexion puis recharge la page.");
      }
    });
  }, [refresh]);

  async function enable() {
    setMessage("");
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) {
      setState("configuration");
      setMessage("La clé publique VAPID manque à la configuration de DivePlan. Les notifications ne peuvent pas être activées pour le moment.");
      return;
    }
    let step: "permission" | "service_worker" | "push_subscription" | "server_registration" = "permission";
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") { setState("denied"); return; }
      if (permission !== "granted") { setState("disabled"); setMessage("Aucune permission n’a été accordée."); return; }
      step = "service_worker";
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      step = "push_subscription";
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) as BufferSource });
      step = "server_registration";
      await syncSubscription(subscription);
      setState("enabled");
      setMessage("Notifications activées sur cet appareil.");
    } catch (error) {
      if (error instanceof Error && error.message === "storage_unavailable") {
        setState("storage");
        setMessage("La base des abonnements Web Push n’est pas disponible. Vérifie que la migration SQL Web Push a été appliquée.");
      } else {
        setState("error");
        const reason = error instanceof Error ? error.message : "unknown";
        const messages = {
          permission: "Le navigateur n’a pas pu accorder la permission. Vérifie ses réglages de notifications.",
          service_worker: "Le service worker n’a pas pu être installé. Vérifie que DivePlan est ouvert en HTTPS (ou sur localhost) et recharge la page.",
          push_subscription: "Le navigateur n’a pas pu créer l’abonnement Web Push. Vérifie que les clés VAPID de la version ouverte sont valides et que les notifications sont prises en charge.",
          server_registration: reason === "server_401_unauthorized" ? "Ta session a expiré. Reconnecte-toi puis réessaie." : reason === "server_403_forbidden" ? "Ce compte n’est pas autorisé à activer les notifications." : reason.startsWith("server_") ? "Le serveur a refusé l’enregistrement. Vérifie la migration Web Push et la connexion à la base de données." : "Le serveur n’a pas répondu correctement à l’enregistrement. Vérifie la connexion et recharge la page."
        };
        setMessage(messages[step]);
      }
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
    configuration: "Configuration Web Push incomplète", storage: "Base des abonnements indisponible",
    error: "État des notifications indisponible"
  }[state];

  return <section className="rounded-2xl border border-white/10 bg-[#0b1e30] p-4" aria-labelledby="notification-settings-title">
    <h3 id="notification-settings-title" className="text-lg font-black text-white">Notifications</h3>
    <p className="mt-1 text-sm text-white/55">État : <span role="status" className="font-bold text-white/80">{status}</span></p>
    {state === "denied" && <p className="mt-3 text-sm text-white/65">Pour les réactiver, autorise les notifications de DivePlan dans les réglages du navigateur ou de l’appareil, puis reviens ici. DivePlan ne redemandera pas la permission automatiquement.</p>}
    {state === "configuration" && <p className="mt-3 text-sm text-white/65">L’administrateur doit configurer les clés VAPID de DivePlan avant l’activation. Recharge la page après la configuration.</p>}
    {state === "storage" && <p className="mt-3 text-sm text-white/65">La migration SQL Web Push doit être appliquée à la base de données avant l’enregistrement de cet appareil.</p>}
    {appleMobile && !standalone && <p className="mt-3 rounded-xl bg-cyan-50 p-3 text-sm text-slate-700">Sur iPhone ou iPad, ajoute d’abord DivePlan à l’écran d’accueil : ouvre le menu Partager, choisis « Sur l’écran d’accueil », puis ouvre DivePlan depuis son icône.</p>}
    {state === "unsupported" && appleMobile && !standalone && <p className="mt-2 text-sm text-white/65">Les notifications seront disponibles après l’ouverture de l’app installée, si ta version d’iOS/iPadOS les prend en charge.</p>}
    <fieldset className="mt-4 grid grid-cols-2 gap-2" disabled={state === "checking" || state === "unsupported"}>
      <legend className="sr-only">Activer ou désactiver les notifications sur cet appareil</legend>
      {(["enabled", "disabled"] as const).map((value) => (
        <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-bold transition ${state === value ? "border-[var(--color-club-red)] bg-[var(--color-club-red)]/10 text-white" : "border-white/10 text-white/65 hover:bg-white/[0.04]"}`}>
          <input type="radio" name="athlete-notifications" value={value} checked={value === "enabled" ? state === "enabled" : state !== "enabled" && state !== "checking" && state !== "unsupported"} onChange={() => { if (value === "enabled") void enable(); else void disable(); }} className="accent-[var(--color-club-red)]" />
          {value === "enabled" ? "Activées" : "Désactivées"}
        </label>
      ))}
    </fieldset>
    {state === "enabled" && <button type="button" onClick={() => void test()} className="mt-3 min-h-10 rounded-xl border border-white/10 px-4 text-sm font-bold text-white/75 hover:bg-white/[0.04]">Envoyer une notification de test</button>}
    {message && <p className="mt-3 text-sm text-white/65" role="status">{message}</p>}
  </section>;
}
