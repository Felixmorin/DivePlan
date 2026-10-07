"use client";

import type { FormEvent, ReactNode } from "react";
import { clearDevicePushSubscription } from "@/components/notifications/notification-settings";

export function SignOutWithPushCleanup({ action, children, className }: { action: () => Promise<void>; children: ReactNode; className?: string }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await clearDevicePushSubscription().catch(() => undefined);
    await action();
  }
  return <form className={className} onSubmit={submit}>{children}</form>;
}
