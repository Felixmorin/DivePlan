const restLine = /^Repos : (\d+) s\.?$/m;

export function readDrylandRest(notes: string | null | undefined) {
  return Number(notes?.match(restLine)?.[1] ?? 0);
}

export function writeDrylandRest(notes: string | null | undefined, seconds: number) {
  const line = `Repos : ${seconds} s`;
  return restLine.test(notes ?? "") ? notes!.replace(restLine, line) : [notes, line].filter(Boolean).join("\n");
}
