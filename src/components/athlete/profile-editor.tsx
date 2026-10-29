"use client";

import { useState, useTransition } from "react";
import { Check, ChevronRight, Info, Users, ChartNoAxesColumnIncreasing } from "lucide-react";
import { updateAthleteProfileField } from "@/app/athlete/profile/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast-provider";

export function ProfileEditor({ firstName, lastName, avatarUrl, level, club, competitionHeights }: {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  level: string;
  club: string;
  competitionHeights: string[];
}) {
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const { notify } = useToast();

  function save() {
    setMessage("");
    startTransition(async () => {
      const firstResult = await updateAthleteProfileField("firstName", first);
      if (!firstResult.ok) { setMessage(firstResult.error); notify(firstResult.error, "error"); return; }
      const lastResult = await updateAthleteProfileField("lastName", last);
      if (!lastResult.ok) { setMessage(lastResult.error); notify(lastResult.error, "error"); return; }
      setMessage("Modifications enregistrées.");
      notify("Profil mis à jour");
    });
  }

  return <>
    <section className="profile-edit-photo">
      <div className="profile-edit-avatar">
        <Avatar><AvatarImage src={avatarUrl ?? undefined} /><AvatarFallback>{first[0]}{last[0]}</AvatarFallback></Avatar>
      </div>
    </section>

    <section className="profile-edit-form">
      <label>Prénom<input value={first} onChange={(event) => setFirst(event.target.value)} maxLength={50} required /></label>
      <label>Nom<input value={last} onChange={(event) => setLast(event.target.value)} maxLength={50} required /></label>
      <label>Nom affiché<input value={`${first} ${last}`.trim()} readOnly /></label>
    </section>

    <section className="profile-edit-sports">
      <h2>Profil sportif</h2>
      <div className="profile-edit-info-row"><span><ChartNoAxesColumnIncreasing /></span><div><small>Niveau</small><strong>{level}</strong></div><ChevronRight /></div>
      <div className="profile-edit-info-row"><span><Users /></span><div><small>Club</small><strong>{club}</strong></div><ChevronRight /></div>
      <p className="profile-edit-events-label">Épreuves</p>
      <div className="profile-edit-event-options">{["1 m", "3 m"].map((height) => <div key={height} className={`profile-edit-event ${competitionHeights.includes(height) ? "is-active" : ""}`}><Check size={18} />{height}</div>)}</div>
    </section>
    <div className="profile-edit-note"><Info /><span>Pour changer de club ou d’entraîneur, contacte ton coach.</span></div>
    {message && <p className={`profile-edit-message ${message.includes("enregistr") ? "is-success" : ""}`} role="status">{message}</p>}
    <footer className="profile-edit-footer"><button type="button" disabled={isPending} onClick={save}>{isPending ? "Enregistrement…" : "Enregistrer les changements"}</button></footer>
  </>;
}
