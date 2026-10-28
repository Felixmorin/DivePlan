"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CalendarDays, CalendarSync, Check, FileText, Flag, Info, Mail, Send, Settings2, ShieldAlert, Smartphone } from "lucide-react";

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

export function NotificationSettings({ variant = "compact", clubName = "DivePlan" }: { variant?: "compact" | "page"; clubName?: string }) {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");
  const [appleMobile, setAppleMobile] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [showSavedBanner, setShowSavedBanner] = useState(false);

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
      setShowSavedBanner(true);
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
      setShowSavedBanner(true);
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

  if (variant === "page") {
    const canTest = state === "enabled";
    return <div className="space-y-4 text-[#0b1943]">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(370px,.9fr)]">
        <section className="rounded-xl border border-[#dce7f1] bg-white p-5 shadow-[0_6px_20px_rgba(14,52,83,.05)]" aria-labelledby="coach-notifications-title">
          <div className="flex items-start gap-3"><Bell className="mt-0.5 h-6 w-6 shrink-0" /><div><h2 id="coach-notifications-title" className="text-[17px] font-extrabold">Notifications</h2><p className="mt-0.5 text-[12px] text-[#61718e]">Choisissez comment et quand vous souhaitez être informé.</p></div></div>
          <div className="mt-4 flex min-h-[88px] items-center justify-between gap-4 rounded-lg border border-[#dce7f1] px-4 py-3">
            <div><p className="text-[14px] font-extrabold">Activer les notifications</p><p className="mt-1 text-[12px] leading-5 text-[#61718e]">Recevez les notifications DivePlan sur cet appareil.</p><p className="mt-1 text-[11px] font-semibold text-[#61718e]" role="status">{status}</p></div>
            <Switch checked={state === "enabled"} disabled={state === "checking" || state === "unsupported" || state === "denied" || state === "configuration" || state === "storage" || state === "error"} label="Activer les notifications" onClick={() => { if (state === "enabled") void disable(); else void enable(); }} />
          </div>
          {appleMobile && !standalone && <p className="mt-3 rounded-lg bg-[#eef5ff] p-3 text-[12px] leading-5 text-[#425a7c]">Sur iPhone ou iPad, ajoutez d’abord DivePlan à l’écran d’accueil, puis ouvrez l’application depuis son icône pour activer les notifications.</p>}
          {state === "denied" && <p className="mt-3 text-[12px] text-[#9d2b2b]">Autorisez les notifications de DivePlan dans les réglages de votre navigateur ou appareil, puis réessayez.</p>}
          {(state === "configuration" || state === "storage" || state === "error" || state === "unsupported") && <p className="mt-3 text-[12px] text-[#9d2b2b]">{state === "configuration" ? "Les notifications ne sont pas configurées sur ce serveur." : state === "storage" ? "Le stockage des abonnements aux notifications est indisponible." : state === "unsupported" ? "Les notifications ne sont pas prises en charge par ce navigateur." : message}</p>}
        </section>

        <section className="rounded-xl border border-[#071827] bg-[#071827] p-5 text-white shadow-[0_6px_20px_rgba(14,52,83,.08)]">
          <div className="flex items-start gap-3"><Bell className="mt-0.5 h-6 w-6 shrink-0" /><div><h2 className="text-[17px] font-extrabold">Aperçu d’une notification</h2><p className="mt-0.5 text-[12px] text-white/75">Voici un exemple de notification de rappel de séance.</p></div></div>
          <div className="mt-4 flex gap-3 rounded-xl border border-white/10 bg-white/[0.07] p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white text-[#ed163d]"><Bell className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="text-[13px] font-extrabold">{clubName}</span><span className="text-[11px] text-white/70">maintenant</span></div><p className="mt-1 text-[14px] font-bold">Rappel de séance</p><p className="mt-1 text-[13px] leading-5 text-white/90">Séance « Entraînement du dimanche » dans 30 minutes au Centre aquatique.</p></div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-[#dce7f1] bg-white p-5 shadow-[0_6px_20px_rgba(14,52,83,.05)]">
          <ChannelHeading icon={<Smartphone />} title="Dans l’application" description="Choisissez les types de notifications que vous souhaitez recevoir dans DivePlan." />
          <div className="mt-4 overflow-hidden rounded-lg border border-[#dce7f1]">
            <PreferenceRow icon={<CalendarDays />} title="Rappels de séance" description="Soyez notifié avant le début de vos séances." />
            <PreferenceRow icon={<CalendarSync />} title="Modifications au calendrier" description="Recevez une notification lorsqu’une séance ou un événement est modifié." />
            <PreferenceRow icon={<Flag />} title="Nouveaux jalons" description="Les notifications de jalons ne sont pas disponibles pour les coachs." last disabled />
          </div>
        </section>
        <section className="rounded-xl border border-[#dce7f1] bg-white p-5 shadow-[0_6px_20px_rgba(14,52,83,.05)]">
          <ChannelHeading icon={<Mail />} title="Courriel" description="Choisissez les types de courriels que vous souhaitez recevoir." />
          <div className="mt-4 overflow-hidden rounded-lg border border-[#dce7f1]">
            <PreferenceRow icon={<FileText />} title="Résumé hebdomadaire" description="Le résumé hebdomadaire par courriel n’est pas disponible actuellement." disabled />
            <PreferenceRow icon={<ShieldAlert />} title="Alertes importantes" description="Les alertes par courriel ne sont pas disponibles actuellement." last disabled />
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-[#dce7f1] bg-white p-5 shadow-[0_6px_20px_rgba(14,52,83,.05)]">
          <ChannelHeading icon={<CalendarDays />} title="Rappel de séance" description="Choisissez quand vous souhaitez recevoir une notification de rappel." />
          <label className="mt-4 grid gap-1 text-[12px] font-bold">Délai d’envoi du rappel<select disabled value="30" className="h-10 w-full rounded-lg border border-[#d5e1ee] bg-[#f8fafc] px-3 text-[13px] font-semibold text-[#61718e]"><option value="30">30 minutes avant</option></select></label>
          <p className="mt-2 text-[11px] text-[#61718e]">Les rappels automatiques ne sont pas encore pris en charge.</p>
        </section>
        <section className="rounded-xl border border-[#dce7f1] bg-white p-5 shadow-[0_6px_20px_rgba(14,52,83,.05)]">
          <ChannelHeading icon={<Send />} title="Tester vos notifications" description="Envoyez une notification de test pour vérifier vos paramètres." />
          <button type="button" disabled={!canTest} onClick={() => void test()} className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-blue-500 bg-[#eef5ff] px-4 text-[13px] font-extrabold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" />{canTest ? "Envoyer une notification de test" : "Activez les notifications pour envoyer un test"}</button>
          {message && <p role="status" className="mt-2 text-[12px] text-[#425a7c]">{message}</p>}
          <div className="mt-3 flex gap-2 rounded-lg bg-[#eef5ff] p-3"><Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /><p className="text-[11px] leading-4 text-[#425a7c]">Assurez-vous d’autoriser les notifications dans votre navigateur. Leur affichage dépend également des réglages de votre appareil.</p></div>
        </section>
      </div>

      {showSavedBanner && <div role="status" className="fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-[1570px] items-center gap-3 rounded-xl border border-[#d9f2e5] bg-[#f5fff9]/95 px-4 py-3 shadow-[0_8px_28px_rgba(8,70,45,.12)] backdrop-blur sm:inset-x-[calc(17rem+1.5rem)]"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#13a568] text-white"><Check className="h-5 w-5" /></span><div><p className="text-[13px] font-extrabold text-[#07864e]">Préférences enregistrées</p><p className="text-[11px] text-[#61718e]">{state === "enabled" ? "Les notifications sont activées sur cet appareil." : "Les notifications sont désactivées sur cet appareil."}</p></div></div>}
    </div>;
  }

  return <section className="rounded-xl border border-[#071827] bg-[#071827] p-5 shadow-[0_6px_20px_rgba(14,52,83,.08)]" aria-labelledby="notification-settings-title">
    <div className="flex items-start gap-3"><Bell className="mt-0.5 h-6 w-6 text-white" /><div><h3 id="notification-settings-title" className="text-[17px] font-extrabold text-white">Notifications</h3>
    <p className="mt-0.5 text-[12px] text-white/75">État : <span role="status" className={`font-bold ${state === "enabled" ? "text-emerald-300" : "text-white/85"}`}>{status}</span></p></div></div>
    {state === "denied" && <p className="mt-3 text-sm text-white/65">Pour les réactiver, autorise les notifications de DivePlan dans les réglages du navigateur ou de l’appareil, puis reviens ici. DivePlan ne redemandera pas la permission automatiquement.</p>}
    {state === "configuration" && <p className="mt-3 text-sm text-white/65">L’administrateur doit configurer les clés VAPID de DivePlan avant l’activation. Recharge la page après la configuration.</p>}
    {state === "storage" && <p className="mt-3 text-sm text-white/65">La migration SQL Web Push doit être appliquée à la base de données avant l’enregistrement de cet appareil.</p>}
    {appleMobile && !standalone && <p className="mt-3 rounded-xl bg-cyan-50 p-3 text-sm text-slate-700">Sur iPhone ou iPad, ajoute d’abord DivePlan à l’écran d’accueil : ouvre le menu Partager, choisis « Sur l’écran d’accueil », puis ouvre DivePlan depuis son icône.</p>}
    {state === "unsupported" && appleMobile && !standalone && <p className="mt-2 text-sm text-white/65">Les notifications seront disponibles après l’ouverture de l’app installée, si ta version d’iOS/iPadOS les prend en charge.</p>}
    <div className="mt-3 flex min-h-11 items-center justify-between gap-4 border-t border-white/15 pt-3">
      <span id="notification-toggle-label" className="text-sm font-bold text-white/85">Activer les notifications</span>
      <button
        type="button"
        role="switch"
        aria-checked={state === "enabled"}
        aria-labelledby="notification-toggle-label"
        disabled={state === "checking" || state === "unsupported" || state === "denied" || state === "configuration" || state === "storage" || state === "error"}
        onClick={() => { if (state === "enabled") void disable(); else void enable(); }}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 ${state === "enabled" ? "bg-[var(--color-club-red)]" : "bg-white/25"}`}
      >
        <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${state === "enabled" ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
    <button type="button" onClick={() => state === "enabled" ? void test() : void refresh()} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-4 text-[13px] font-bold text-white hover:bg-white/[0.08]"><Settings2 className="h-4 w-4" />{state === "enabled" ? "Envoyer une notification de test" : "Actualiser l’état des notifications"}</button>
    {message && <p className="mt-3 text-sm text-white/65" role="status">{message}</p>}
  </section>;
}

function Switch({ checked, disabled = false, label, onClick }: { checked: boolean; disabled?: boolean; label: string; onClick?: () => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onClick} className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-[var(--color-club-red)]" : "bg-[#cbd5e1]"}`}><span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} /></button>;
}

function ChannelHeading({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5">{icon}</span><div><h2 className="text-[17px] font-extrabold leading-tight">{title}</h2><p className="mt-0.5 text-[12px] leading-5 text-[#61718e]">{description}</p></div></div>;
}

function PreferenceRow({ icon, title, description, disabled = true, last = false }: { icon: React.ReactNode; title: string; description: string; disabled?: boolean; last?: boolean }) {
  return <div className={`flex min-h-[64px] items-center gap-3 px-3 py-2.5 ${!last ? "border-b border-[#dce7f1]" : ""} ${disabled ? "opacity-80" : ""}`}><span className="shrink-0">{icon}</span><div className="min-w-0 flex-1"><p className="text-[12px] font-extrabold">{title}</p><p className="mt-0.5 text-[11px] leading-4 text-[#61718e]">{description}</p></div><Switch checked={false} disabled label={title} /></div>;
}
