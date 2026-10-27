export const PAGE_SIZE = 25;
export function pageNumber(value: unknown) {
  return typeof value === "string" && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1;
}
export function likeSearch(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}
export function pageHref(path: string, params: Record<string, string | undefined>, page: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, page: String(page) })) if (value) search.set(key, value);
  return `${path}?${search}`;
}

export function textParam(value: unknown, max = 150): string {
  return typeof value === "string" ? value.slice(0,max) : "";
}
