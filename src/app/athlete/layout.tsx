import { AthleteActivityTracker } from "@/components/athlete/activity-tracker";

export default function AthleteLayout({ children }: { children: React.ReactNode }) {
  return <><AthleteActivityTracker />{children}</>;
}
