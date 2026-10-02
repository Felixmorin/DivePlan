import { randomUUID } from "node:crypto";

const STORAGE_REFERENCE_PREFIX = "supabase-storage://";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export function isAvatarDataUrl(value: string): boolean {
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value);
}

function storageConfig() {
  const projectUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!projectUrl || !serviceKey) {
    throw new Error("Configure SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY pour utiliser les photos de profil.");
  }
  return { projectUrl, serviceKey, bucket: process.env.SUPABASE_AVATAR_BUCKET || "avatars" };
}

function objectReference(bucket: string, path: string) {
  return `${STORAGE_REFERENCE_PREFIX}${bucket}/${path}`;
}

function parseObjectReference(value: string) {
  if (!value.startsWith(STORAGE_REFERENCE_PREFIX)) return null;
  const reference = value.slice(STORAGE_REFERENCE_PREFIX.length);
  const separator = reference.indexOf("/");
  if (separator < 1 || separator === reference.length - 1) return null;
  return { bucket: reference.slice(0, separator), path: reference.slice(separator + 1) };
}

function encodedPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function uploadAvatarDataUrl(userId: string, dataUrl: string): Promise<string> {
  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error("Le format de la photo est invalide.");
  const { projectUrl, serviceKey, bucket } = storageConfig();
  const mimeType = `image/${match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase()}`;
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
  const path = `${userId}-${Date.now()}-${randomUUID()}.${extension}`;
  const response = await fetch(`${projectUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(path)}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": mimeType,
      "x-upsert": "true"
    },
    body: Buffer.from(match[2], "base64"),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Le stockage de la photo a échoué (${response.status}). Vérifie le bucket Supabase privé « ${bucket} ».`);
  return objectReference(bucket, path);
}

export async function resolveAvatarUrls(values: Array<string | null | undefined>): Promise<Array<string | null>> {
  const resolved = values.map((value) => value && !isAvatarDataUrl(value) && !value.startsWith(STORAGE_REFERENCE_PREFIX) ? value : null);
  const references = values.map((value) => value ? parseObjectReference(value) : null);
  const groups = new Map<string, Array<{ index: number; path: string }>>();
  references.forEach((reference, index) => {
    if (!reference) return;
    const paths = groups.get(reference.bucket) ?? [];
    paths.push({ index, path: reference.path });
    groups.set(reference.bucket, paths);
  });

  if (groups.size === 0) return resolved;
  const { projectUrl, serviceKey } = storageConfig();
  for (const [bucket, entries] of groups) {
    const response = await fetch(`${projectUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}`, {
      method: "POST",
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS, paths: entries.map((entry) => entry.path) }),
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`Impossible de créer les liens privés pour le bucket « ${bucket} » (${response.status}).`);
    const signedObjects = await response.json() as Array<{ path: string; signedURL: string }>;
    const signedByPath = new Map(signedObjects.map((item) => [item.path, item.signedURL]));
    for (const entry of entries) {
      const signedUrl = signedByPath.get(entry.path);
      if (signedUrl) resolved[entry.index] = signedUrl.startsWith("http") ? signedUrl : `${projectUrl}/storage/v1${signedUrl}`;
    }
  }
  return resolved;
}

export function storedAvatarReference(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(STORAGE_REFERENCE_PREFIX));
}
