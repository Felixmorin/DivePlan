import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("min-h-24 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-ink)] outline-none transition duration-[var(--duration-fast)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-brand)] focus:shadow-[var(--focus-ring)]", className)} {...props} />;
}
