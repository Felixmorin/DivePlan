/** Keep large inline photos out of repeated server-to-client page payloads. */
export function avatarUrlForPage(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  return /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(avatar) || avatar.startsWith("supabase-storage://") ? null : avatar;
}
