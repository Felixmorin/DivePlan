import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePushEndpoint } from "./push-endpoint";

test("accepts HTTPS push service endpoints", () => {
  assert.equal(validatePushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(validatePushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"), true);
  assert.equal(validatePushEndpoint("https://web.push.apple.com/abc"), true);
});

test("rejects arbitrary hosts and unsafe endpoint forms", () => {
  for (const endpoint of ["http://fcm.googleapis.com/a", "https://example.com/a", "https://fcm.googleapis.com.attacker.test/a", "https://user@fcm.googleapis.com/a", "https://fcm.googleapis.com:8443/a", "not a url"]) {
    assert.equal(validatePushEndpoint(endpoint), false, endpoint);
  }
});
