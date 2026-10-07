import { MobileBottomNav } from "@/components/athlete/mobile-bottom-nav";

export function AthleteShell({ children, hideNav = false, className = "" }: { children: React.ReactNode; hideNav?: boolean; className?: string }) {
  return (
    <div className={`athlete-app min-h-screen overflow-x-hidden bg-[var(--color-athlete-bg)] text-white ${className}`}>
      <main className={`mx-auto min-h-screen w-full max-w-[430px] px-4 pt-[calc(2rem+env(safe-area-inset-top))] sm:pt-4 ${hideNav ? "pb-[calc(6rem+env(safe-area-inset-bottom))]" : "pb-[calc(6.5rem+env(safe-area-inset-bottom))]"}`}>{children}</main>
      {!hideNav && <MobileBottomNav />}
    </div>
  );
}
