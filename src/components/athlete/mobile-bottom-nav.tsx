"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, History, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/athlete", label: "Aujourd'hui", icon: Activity },
  { href: "/athlete/progress", label: "Progres", icon: BarChart3 },
  { href: "/athlete/week", label: "Historique", icon: History },
  { href: "/athlete/profile", label: "Profil", icon: User }
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-1/2 z-20 grid w-full max-w-[430px] -translate-x-1/2 grid-cols-4 border-t border-white/10 bg-[var(--color-athlete-bg)] px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-16px_34px_rgba(0,0,0,0.28)]">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || (item.href !== "/athlete" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn("flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-bold text-white/42 transition duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]", active && "bg-white/8 text-white")}
          >
            <Icon className={cn("h-4 w-4 text-white/42", active && "text-[var(--color-action)]")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
