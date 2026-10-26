type FindingIdentityInput = {
  agentId: string;
  finding: {
    title?: string;
    location?: string;
    recommendation?: string;
    evidence?: string;
  };
};

function normalize(value?: string) {
  return (value ?? "")
    .toLocaleLowerCase("fr")
    .replace(/:\d+(?=$|[^\d])/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Stable across agent runs; line shifts and repeated executions are not new findings. */
export function agentFindingIdentity(source: FindingIdentityInput) {
  return [
    source.agentId,
    normalize(source.finding.title),
    normalize(source.finding.location),
    normalize(source.finding.recommendation),
    normalize(source.finding.evidence)
  ].join(":");
}
