"use client";

import { updateAthleteProfile } from "@/app/athlete/profile/actions";
import { Button } from "@/components/ui/button";

type ProfileFormProps = {
  firstName: string;
  lastName: string;
};

export function ProfileForm({ firstName, lastName }: ProfileFormProps) {
  return (
    <form action={updateAthleteProfile} className="space-y-3 border-t border-white/8 bg-black/10 p-4">
      <div className="grid grid-cols-2 gap-3">
        <ProfileField label="Prénom" name="firstName" defaultValue={firstName} />
        <ProfileField label="Nom" name="lastName" defaultValue={lastName} />
      </div>

      <Button type="submit" className="w-full">Enregistrer</Button>
    </form>
  );
}

function ProfileField({ label, name, defaultValue, type = "text", onChange }: { label: string; name: string; defaultValue: string; type?: string; onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="block text-sm font-bold text-white/65">
      {label}
      <input type={type} name={name} defaultValue={defaultValue} onChange={onChange} required={type !== "url"} className="mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-base text-white outline-none transition placeholder:text-white/25 focus:border-cyan-300/60 focus:shadow-[var(--focus-ring)]" />
    </label>
  );
}
