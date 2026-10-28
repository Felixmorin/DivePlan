import "server-only";

/** Profile images have been removed; keep callers rendering their initials fallback. */
export async function resolveAvatarUrls(values: Array<string | null | undefined>): Promise<Array<null>> {
  return values.map(() => null);
}
