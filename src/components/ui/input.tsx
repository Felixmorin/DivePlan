import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} className={cn("h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-ink)] outline-none transition duration-[var(--duration-fast)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-brand)] focus:shadow-[var(--focus-ring)]", className)} {...props} />;
}
