export type VisiblePollingOptions = {
  poll: () => Promise<void>;
  isVisible: () => boolean;
  subscribe: (listener: () => void) => () => void;
  intervalMs: number;
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
};

/** Poll while visible, with at most one request in flight. */
export function startVisiblePolling({
  poll,
  isVisible,
  subscribe,
  intervalMs,
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancel = (timer) => clearTimeout(timer),
}: VisiblePollingOptions): () => void {
  let stopped = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };

  const run = async () => {
    if (stopped || !isVisible() || inFlight) return;
    inFlight = true;
    try {
      await poll();
    } catch {
      // Keep the polling loop alive after transient request failures.
    } finally {
      inFlight = false;
      if (!stopped && isVisible()) timer = schedule(() => void run(), intervalMs);
    }
  };

  const onVisibilityChange = () => {
    clearTimer();
    if (isVisible() && !inFlight) void run();
  };

  const unsubscribe = subscribe(onVisibilityChange);
  void run();

  return () => {
    stopped = true;
    clearTimer();
    unsubscribe();
  };
}
