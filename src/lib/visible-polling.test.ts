import assert from "node:assert/strict";
import test from "node:test";
import { startVisiblePolling } from "@/lib/visible-polling";

test("visible polling pauses in hidden tabs and resumes immediately without overlapping requests", async () => {
  let visible = true;
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  let release: (() => void) | undefined;
  let listener = () => {};
  let scheduled: (() => void) | undefined;
  const cancelled = new Set<() => void>();

  const stop = startVisiblePolling({
    poll: () => {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      return new Promise<void>((resolve) => {
        release = () => {
          active -= 1;
          resolve();
        };
      });
    },
    isVisible: () => visible,
    subscribe: (callback) => {
      listener = callback;
      return () => { listener = () => {}; };
    },
    intervalMs: 2500,
    schedule: (callback) => { scheduled = callback; return callback as unknown as ReturnType<typeof setTimeout>; },
    cancel: (timer) => { cancelled.add(timer as unknown as () => void); },
  });

  assert.equal(calls, 1);
  listener();
  assert.equal(calls, 1, "a visibility event must not overlap the active request");
  release?.();
  await Promise.resolve();
  assert.ok(scheduled);

  visible = false;
  listener();
  assert.ok(cancelled.has(scheduled!));
  scheduled!();
  assert.equal(calls, 1, "hidden tabs must not poll");

  visible = true;
  listener();
  assert.equal(calls, 2, "returning to a visible tab triggers an immediate refresh");
  release?.();
  await Promise.resolve();
  assert.equal(maxActive, 1);
  stop();
  scheduled?.();
  assert.equal(calls, 2, "stopped polling must not schedule more requests");
});
