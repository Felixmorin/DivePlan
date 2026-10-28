# Notifications Web Push

DivePlan uses the browser's Web Push API and a service worker. The worker handles notifications only and does not cache pages or API responses.

## Database migration

These are historical Prisma migrations from before the migration handoff. For an environment that has not yet received Web Push, first confirm its migration ledger and schema, then apply the two historical migrations in order using the procedure in [`db/migrations/README.md`](../db/migrations/README.md). Do not replay them in an environment where they are already applied. They create `PushSubscription` and the push delivery queues for session publication, session updates, and cancellations. An endpoint is unique and can be reassigned to the account currently using a shared device.

Any later changes to these tables must use a new ordered SQL migration under `db/migrations`, with the corresponding Prisma model changes when required.

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
- With automatic publication enabled, publish or update a training session with assigned athletes who have opted in. Updates notify active athletes assigned to the session blocks. The notification click opens `/athlete/session/{id}` and that page applies its usual access checks. Test with DivePlan closed to verify the browser/OS launch path.

No real device delivery or production deployment is performed as part of development verification.

## Failed delivery handling

Each queued delivery is attempted when its publication or cancellation action
runs. Transient provider/network failures receive up to three attempts in that
dispatch, with 250 ms then 500 ms delays. HTTP 429 and 5xx responses are
retryable; permanent 4xx responses and missing subscriptions are not. If the
bounded attempts fail, or another processing error occurs, the row records
`FAILED`, increments `attempts`, and stores a sanitized `lastError`. Failed rows
remain terminal and are not retried by a background worker. Inspect failure
counts and reasons through an authorized database operations process. If an
operator decides to reissue a notification, first confirm that the event is
still relevant and no delivery was accepted; then requeue only the selected
failed row by setting its status to `PENDING` and clearing `lastError` and
`sentAt`, and invoke the corresponding publication/cancellation dispatch path.
The row's unique key prevents duplicate queue rows, but it cannot guarantee
exactly-once delivery if a provider accepted a send before the application
recorded its result. The service worker uses each delivery row ID as the
notification tag so duplicate accepted pushes for the same queued delivery
replace the same visible notification. This reduces duplicate display but does
not provide exactly-once transport. Do not requeue `No active device
subscription` failures until the athlete has subscribed.
