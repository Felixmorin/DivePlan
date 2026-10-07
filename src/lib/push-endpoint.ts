export function validatePushEndpoint(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.hostname.length > 253) return false;
  const host = url.hostname.toLowerCase();
  return ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"]
    .some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}
