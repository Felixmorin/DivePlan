# Notifications Web Push

DivePlan uses the browser's Web Push API and a service worker. The worker handles notifications only and does not cache pages or API responses.

## Database migration

Apply `prisma/migrations/20261006195500_web_push/migration.sql` to the PostgreSQL database before deploying the code. It creates `PushSubscription` and the idempotent per-athlete `PushDelivery` queue. An endpoint is unique and can be reassigned to the account currently using a shared device.

## VAPID configuration

Generate a key pair locally with:

```sh
npx web-push generate-vapid-keys
```

Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` as server secrets. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to the same public key for browser subscription, and `VAPID_SUBJECT` to a monitored `mailto:` contact or an HTTPS contact URL. Never expose or commit the private key. `WEB_PUSH_SESSION_PUBLISHED` defaults to `false`; set it to `true` only when automatic session notifications should go to assigned athletes.

The test notification remains available with automatic publication notifications disabled. Test sends are limited to the signed-in account's exact endpoint and rate-limited per device.

## Device checks

- **iPhone/iPad:** use a supported iOS/iPadOS version, open DivePlan in Safari, choose Share → Add to Home Screen, then open DivePlan from its icon. Allow notifications only after tapping **Activer les notifications**. Apple limits Web Push to installed web apps.
- **Android:** open DivePlan in a supported browser such as Chrome, allow notifications after tapping the activation button, then test with DivePlan in the background and closed.
- **Desktop:** use a supported browser over HTTPS or localhost, enable notifications, and send a device test.
- A successful test response means the push service accepted the request; it does not confirm that the operating system displayed it. Observe the device to validate actual receipt.
- With automatic publication enabled, publish a draft with assigned athletes who have opted in. The notification click opens `/athlete/session/{id}` and that page applies its usual access checks. Test with DivePlan closed to verify the browser/OS launch path.

No real device delivery or production deployment is performed as part of development verification.
