"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Check, ChevronRight, Info, Users, ChartNoAxesColumnIncreasing } from "lucide-react";
import { updateAthleteAvatar, updateAthleteProfileField } from "@/app/athlete/profile/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function ProfileEditor({ firstName, lastName, avatarUrl, level, club, competitionHeights }: {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  level: string;
  club: string;
  competitionHeights: string[];
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [photo, setPhoto] = useState(avatarUrl);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function save() {
    setMessage("");
    startTransition(async () => {
      const firstResult = await updateAthleteProfileField("firstName", first);
      if (!firstResult.ok) { setMessage(firstResult.error); return; }
      const lastResult = await updateAthleteProfileField("lastName", last);
      if (!lastResult.ok) { setMessage(lastResult.error); return; }
      setMessage("Modifications enregistrées.");
    });
  }

  function selectPhoto(file?: File) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      setMessage("Choisis une image JPG, PNG ou WebP de moins de 5 Mo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setMessage("");
      startTransition(async () => {
        const result = await updateAthleteAvatar(reader.result as string);
        if (!result.ok) { setMessage(result.error); return; }
        setPhoto(reader.result as string);
        setMessage("Photo enregistrée.");
      });
    };
    reader.readAsDataURL(file);
  }

  return <>
    <section className="profile-edit-photo">
      <button type="button" className="profile-edit-avatar" onClick={() => fileInput.current?.click()} aria-label="Changer la photo de profil">
        <Avatar><AvatarImage src={photo ?? undefined} /><AvatarFallback>{first[0]}{last[0]}</AvatarFallback></Avatar>
        <span><Camera size={19} /></span>
      </button>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => selectPhoto(event.target.files?.[0])} />
      <button type="button" className="profile-edit-photo-link" onClick={() => fileInput.current?.click()}>Changer la photo</button>
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
