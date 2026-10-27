export type AuthProbeResult = { ok: boolean; detail: string; role?: "ADMIN" | "COACH" | "ATHLETE" };
type Role = NonNullable<AuthProbeResult["role"]>;

export async function runDivePlanAuthProbe(includeRolePage: boolean): Promise<AuthProbeResult> {
  const baseUrlValue = process.env.HEALTH_CHECK_BASE_URL;
  const email = process.env.HEALTH_CHECK_EMAIL;
  const password = process.env.HEALTH_CHECK_PASSWORD;
  if (!baseUrlValue || !email || !password) return { ok: false, detail: "Configurez HEALTH_CHECK_BASE_URL, HEALTH_CHECK_EMAIL et HEALTH_CHECK_PASSWORD avec un compte technique dédié." };
  let base: URL;
  try {
    base = new URL(baseUrlValue);
    const local = ["localhost", "127.0.0.1", "::1"].includes(base.hostname);
    if (!local && base.protocol !== "https:") return { ok: false, detail: "HEALTH_CHECK_BASE_URL doit utiliser HTTPS en dehors de localhost." };
    if (base.username || base.password || base.search || base.hash || base.pathname !== "/") return { ok: false, detail: "HEALTH_CHECK_BASE_URL doit contenir seulement l’origine de l’application." };
  } catch { return { ok: false, detail: "HEALTH_CHECK_BASE_URL est invalide." }; }

  const cookies = new Map<string, string>();
  const acceptCookies = (response: Response) => {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const values = headers.getSetCookie?.() ?? (response.headers.get("set-cookie") ?? "").split(/,(?=\s*[^;,]+=)/);
    for (const value of values) {
      const match = value.match(/^\s*([^=;\s]+)=([^;]*)/);
      if (!match) continue;
      if (/max-age=0/i.test(value)) cookies.delete(match[1]);
      else cookies.set(match[1], `${match[1]}=${match[2]}`);
    }
  };
  const cookieHeader = () => [...cookies.values()].join("; ");
  const fetchOptions = { cache: "no-store" as RequestCache, signal: AbortSignal.timeout(6000) };
  try {
    const csrfResponse = await fetch(new URL("/api/auth/csrf", base), fetchOptions);
    acceptCookies(csrfResponse);
    if (!csrfResponse.ok) return { ok: false, detail: `Le point d’accès CSRF a répondu HTTP ${csrfResponse.status}.` };
    const csrf = await csrfResponse.json() as { csrfToken?: string };
    if (!csrf.csrfToken) return { ok: false, detail: "Auth.js n’a pas fourni de jeton CSRF." };

    const body = new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, callbackUrl: base.origin });
    const loginResponse = await fetch(new URL("/api/auth/callback/credentials", base), {
      ...fetchOptions,
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-auth-return-redirect": "1", cookie: cookieHeader() },
      body
    });
    acceptCookies(loginResponse);
    if (loginResponse.status < 200 || loginResponse.status >= 400) return { ok: false, detail: `Auth.js a refusé le test de connexion (HTTP ${loginResponse.status}).` };

    const sessionResponse = await fetch(new URL("/api/auth/session", base), { ...fetchOptions, headers: { cookie: cookieHeader() } });
    if (!sessionResponse.ok) return { ok: false, detail: `La session Auth.js a répondu HTTP ${sessionResponse.status}.` };
    const session = await sessionResponse.json() as { user?: { id?: string; role?: string } };
    const role = session.user?.role;
    if (!session.user?.id || !["ADMIN", "COACH", "ATHLETE"].includes(role ?? "")) return { ok: false, detail: "Les identifiants sont passés par Auth.js, mais aucune session avec rôle attendu n’a été créée." };

    if (includeRolePage) {
      // The sessions dashboard starts and completes sessions during its GET render.
      // Use a read-only page for the coach smoke test instead.
      const path = role === "COACH" ? "/coach/athletes" : role === "ATHLETE" ? "/athlete/calendar" : "/admin";
      const page = await fetch(new URL(path, base), { ...fetchOptions, redirect: "manual", headers: { cookie: cookieHeader() } });
      if (!page.ok) return { ok: false, role: role as Role, detail: `Connexion réussie (${role}), mais la page protégée ${path} a répondu HTTP ${page.status}.` };
      return { ok: true, role: role as Role, detail: `Connexion Auth.js, session et rendu de ${path} vérifiés par HTTP.` };
    }
    return { ok: true, role: role as Role, detail: `Connexion Auth.js et création de session vérifiées pour le rôle ${role}.` };
  } catch {
    return { ok: false, detail: "La sonde HTTP Auth.js a expiré ou n’a pas pu joindre l’application; aucune information de connexion n’est journalisée." };
  }
}
