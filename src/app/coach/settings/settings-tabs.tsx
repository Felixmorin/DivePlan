import Link from "next/link";
import { Bell, CalendarDays, FileText, UserRound, UsersRound } from "lucide-react";

const tabs = [
  { href: "/coach/settings#club", label: "Club", icon: UsersRound, id: "club" },
  { href: "/coach/settings/account", label: "Compte", icon: UserRound, id: "account" },
  { href: "/coach/settings/notifications", label: "Notifications", icon: Bell, id: "notifications" },
  { href: "/coach/settings#planning", label: "Planning", icon: CalendarDays, id: "planning" },
  { href: "/coach/settings/print", label: "Feuille de séance", icon: FileText, id: "print" }
];

export function SettingsTabs({ active }: { active: "club" | "account" | "notifications" | "print" }) {
  return <>
    {tabs.map(({ href, label, icon: Icon, id }) => {
      const selected = id === active;
      return <Link key={id} href={href} aria-current={selected ? "page" : undefined} className={`flex min-h-11 shrink-0 items-center gap-2 border-b-[3px] px-5 text-[13px] font-bold ${selected ? "border-[#ff604c] bg-[#fff2f1] text-[#e6382b]" : "border-transparent text-[#263755] hover:bg-white/70"}`}><Icon className="h-[18px] w-[18px]" />{label}</Link>;
    })}
  </>;
}
