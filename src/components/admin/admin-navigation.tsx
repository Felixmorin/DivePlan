"use client";

import Link from "@/components/ui/app-link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Bot, ChevronDown, ClipboardList, Database, Gauge, HeartPulse, LayoutDashboard, Menu, Route, Sparkles, TriangleAlert, UserRound, Wallet, X, ChartNoAxesCombined } from "lucide-react";

const groups = [
  { id: "overview", title: "Vue d’ensemble", items: [
    { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard }
  ]},
  { id: "platform", title: "État de la plateforme", items: [
    { href: "/admin/sante-app", label: "Santé de l’application", icon: HeartPulse },
    { href: "/admin/sante-generale", label: "État de la plateforme", icon: Activity },
    { href: "/admin/erreurs-stabilite", label: "Erreurs et stabilité", icon: TriangleAlert },
    { href: "/admin/performance", label: "Performance", icon: ChartNoAxesCombined },
    { href: "/admin/base-de-donnees", label: "Base de données", icon: Database },
    { href: "/admin/couts-quotas", label: "Coûts et quotas", icon: Wallet }
  ]},
  { id: "usage", title: "Utilisation", items: [
    { href: "/admin/activite-parcours", label: "Activité et parcours", icon: Route },
    { href: "/admin/users", label: "Utilisateurs", icon: UserRound },
    { href: "/admin/coaches", label: "Fonctionnalités", icon: Sparkles }
  ]},
  { id: "tools", title: "Outils", items: [
    { href: "/admin/observability", label: "Observabilité", icon: Activity },
    { href: "/admin/monitoring", label: "Monitoring", icon: ClipboardList },
    { href: "/admin/optimisation", label: "Optimisation", icon: Gauge }
  ]},
  { id: "agents", title: "Agents", items: [
    { href: "/admin/agents", label: "Agents", icon: Bot }
  ]}
];
const keys = groups.map(group => group.id);
const defaultOpen = Object.fromEntries(keys.map(key => [key, true]));

export function AdminNavigation({ status }: { status: { label: string; tone: "neutral" | "warning" | "unavailable"; detail: string } }) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(defaultOpen);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("diveplan-admin-nav-groups");
      if (saved) {
        const savedGroups = JSON.parse(saved) as Record<string, boolean>;
        window.setTimeout(() => setOpenGroups({ ...defaultOpen, ...savedGroups }), 0);
      }
    } catch { /* Le menu reste utilisable si le stockage local est bloqué. */ }
  }, []);
  useEffect(() => {
    const activeGroup = groups.find(group => group.items.some(item => item.href === pathname || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`))));
    if (activeGroup) window.setTimeout(() => setOpenGroups(current => current[activeGroup.id] ? current : { ...current, [activeGroup.id]: true }), 0);
  }, [pathname]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  function toggleGroup(id: string) {
    setOpenGroups(current => {
      const next = { ...current, [id]: !current[id] };
      try { localStorage.setItem("diveplan-admin-nav-groups", JSON.stringify(next)); } catch { /* État conservé en mémoire pour cette navigation. */ }
      return next;
    });
  }
  const indicator = <span title={status.detail} className={`inline-flex max-w-full items-center gap-2 rounded-md px-2 py-1 text-[11px] font-semibold ${status.tone === "warning" ? "bg-amber-400/15 text-amber-200" : status.tone === "unavailable" ? "bg-white/10 text-white/65" : "bg-sky-300/10 text-sky-100"}`}><span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.tone === "warning" ? "bg-amber-300" : status.tone === "unavailable" ? "bg-slate-400" : "bg-sky-300"}`}/>{status.label}</span>;
  const nav = <nav aria-label="Navigation admin" className="space-y-3">
    {groups.map(group => <section key={group.id} aria-labelledby={`admin-nav-${group.id}`}>
      {group.id === "overview" ? <h2 id={`admin-nav-${group.id}`} className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">{group.title}</h2> : <button id={`admin-nav-${group.id}`} type="button" aria-expanded={!!openGroups[group.id]} aria-controls={`admin-nav-list-${group.id}`} onClick={() => toggleGroup(group.id)} className="flex min-h-8 w-full items-center justify-between rounded-md px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/55 hover:bg-white/5 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"><span>{group.title}</span><ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${openGroups[group.id] ? "rotate-180" : ""}`}/></button>}
      <ul id={`admin-nav-list-${group.id}`} hidden={group.id !== "overview" && !openGroups[group.id]} className="space-y-0.5">{group.items.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return <li key={href}><Link href={href} aria-current={active ? "page" : undefined} onClick={() => setMobileOpen(false)} className={`group flex min-h-9 items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-[13px] font-medium leading-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${active ? "border-cyan-300 bg-white/12 text-white" : "border-transparent text-white/75 hover:bg-white/[0.07] hover:text-white"}`}><Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${active ? "text-cyan-200" : "text-white/65 group-hover:text-white"}`}/><span className="min-w-0 whitespace-normal break-words">{label}</span></Link></li>;
      })}</ul>
    </section>)}
  </nav>;
  return <>
    <div className="fixed inset-x-0 top-0 z-30 border-b border-white/10 bg-[#09233b] text-white md:hidden">
      <div className="flex min-h-14 items-center justify-between gap-3 px-4">
        <div className="min-w-0"><p className="text-sm font-bold">Administration</p>{indicator}</div>
        <button type="button" aria-label={mobileOpen ? "Fermer le menu d’administration" : "Ouvrir le menu d’administration"} aria-expanded={mobileOpen} aria-controls="admin-mobile-navigation" onClick={() => setMobileOpen(value => !value)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{mobileOpen ? <X className="h-5 w-5"/> : <Menu className="h-5 w-5"/>}</button>
      </div>
      {mobileOpen && <div id="admin-mobile-navigation" className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-white/10 bg-[#09233b] px-3 py-3">{nav}</div>}
    </div>
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[228px] flex-col overflow-hidden bg-[#09233b] px-3 py-4 text-white md:flex lg:w-[252px] lg:px-4 lg:py-5">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-[radial-gradient(ellipse_at_bottom,_rgba(0,188,212,0.20),_transparent_68%)]"/>
      <Link href="/admin" aria-label="DivePlan, accueil administration" className="relative mb-5 flex w-fit items-center gap-2.5 px-2 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
        <svg aria-hidden="true" viewBox="0 0 48 48" className="h-9 w-9 shrink-0" fill="none"><path d="M5 16.5c5.2-5.1 10.4-5.1 15.6 0s10.4 5.1 15.6 0c2.5-2.4 4.7-3.6 6.8-3.6v6.3c-2.1 0-4.3 1.2-6.8 3.6-5.2 5.1-10.4 5.1-15.6 0s-10.4-5.1-15.6 0" fill="#20a7f7"/><path d="M5 27c5.2-5.1 10.4-5.1 15.6 0s10.4 5.1 15.6 0c2.5-2.4 4.7-3.6 6.8-3.6v6.3c-2.1 0-4.3 1.2-6.8 3.6-5.2 5.1-10.4 5.1-15.6 0S10.2 28.2 5 33.3" fill="#20a7f7" opacity=".78"/></svg>
        <span className="text-[22px] font-bold tracking-tight text-white">DivePlan</span>
      </Link>
      <div className="relative mb-4 px-2"><p className="text-xs font-bold text-white/90">Administration</p><div className="mt-1.5">{indicator}</div></div>
      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-32">{nav}</div>
    </aside>
  </>;
}
