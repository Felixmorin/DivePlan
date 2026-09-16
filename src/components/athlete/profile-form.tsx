"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { updateAthleteProfile } from "@/app/athlete/profile/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

type ProfileFormProps = {
  firstName: string;
  lastName: string;
  avatar: string | null;
};

const MAX_IMAGE_SIZE = 900_000;

export function ProfileForm({ firstName, lastName, avatar }: ProfileFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarData, setAvatarData] = useState("");
  const [preview, setPreview] = useState(avatar ?? "");
  const [error, setError] = useState("");

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    try {
      const compressed = await compressImage(file);
      setAvatarData(compressed);
      setPreview(compressed);
    } catch {
      setError("Cette photo ne peut pas être utilisée. Essaie une autre image.");
      event.target.value = "";
    }
  }

  return (
    <form action={updateAthleteProfile} className="space-y-3 border-t border-white/8 bg-black/10 p-4">
      <div className="grid grid-cols-2 gap-3">
        <ProfileField label="Prénom" name="firstName" defaultValue={firstName} />
        <ProfileField label="Nom" name="lastName" defaultValue={lastName} />
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <Avatar className="h-14 w-14 shrink-0 border border-cyan-200/50 bg-[#06101d]">
          <AvatarImage src={preview || undefined} />
          <AvatarFallback>{firstName[0]}{lastName[0]}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white/75">Photo de profil</p>
          <p className="mt-0.5 text-xs text-white/45">Choisis une photo dans ta galerie</p>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="sr-only" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg border border-cyan-300/30 px-3 text-sm font-bold text-cyan-200 transition hover:bg-cyan-300/10 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <ImagePlus className="h-4 w-4" />
            Parcourir mes photos
          </button>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm font-semibold text-rose-300">{error}</p> : null}

      <ProfileField
        label="Adresse de la photo (optionnel)"
        name="avatarUrl"
        defaultValue={avatar?.startsWith("data:") ? "" : avatar ?? ""}
        type="url"
        onChange={(event) => {
          setAvatarData("");
          setPreview(event.target.value || avatar || "");
        }}
      />
      <input type="hidden" name="avatar" value={avatarData} readOnly />
      <Button type="submit" className="w-full">Enregistrer</Button>
    </form>
  );
}

async function compressImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Not an image");

  const source = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close();

  let quality = 0.82;
  let result = await canvasToDataUrl(canvas, quality);
  while (result.length > MAX_IMAGE_SIZE && quality > 0.45) {
    quality -= 0.08;
    result = await canvasToDataUrl(canvas, quality);
  }
  if (result.length > MAX_IMAGE_SIZE) throw new Error("Image too large");
  return result;
}

function canvasToDataUrl(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Could not read image"));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    }, "image/jpeg", quality);
  });
}

function ProfileField({ label, name, defaultValue, type = "text", onChange }: { label: string; name: string; defaultValue: string; type?: string; onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="block text-sm font-bold text-white/65">
      {label}
      <input type={type} name={name} defaultValue={defaultValue} onChange={onChange} required={type !== "url"} className="mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-base text-white outline-none transition placeholder:text-white/25 focus:border-cyan-300/60 focus:shadow-[var(--focus-ring)]" />
    </label>
  );
}
