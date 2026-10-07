/* This worker only handles push events; it deliberately does not cache requests. */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() ?? "" }; }
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/";
  event.waitUntil(self.registration.showNotification(data.title || "DivePlan", {
    body: data.body || "",
    icon: "/icons/diveplan-192.png",
    badge: "/icons/diveplan-192.png",
    data: { url }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data?.url;
  let target = self.location.origin + "/";
  if (typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")) {
    const parsed = new URL(raw, self.location.origin);
    if (parsed.origin === self.location.origin) target = parsed.href;
  }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
