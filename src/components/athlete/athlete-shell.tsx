import { MobileBottomNav } from "@/components/athlete/mobile-bottom-nav";

export function AthleteShell({ children, hideNav = false, className = "" }: { children: React.ReactNode; hideNav?: boolean; className?: string }) {
  return (
    <div className={`athlete-app flex min-h-screen flex-col overflow-x-hidden bg-[var(--color-athlete-bg)] text-white ${className}`}>
      <main className="mx-auto w-full max-w-[430px] flex-1 px-4 pb-6 pt-[calc(2rem+env(safe-area-inset-top))] sm:pt-4">{children}</main>
      {!hideNav && <MobileBottomNav />}
    </div>
  );
}
