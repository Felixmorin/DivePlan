export const MILESTONES = {
  first500: { key: "first-500-repetitions", title: "Premier à 500 répétitions", description: "Le premier athlète du club à compléter 500 répétitions réelles." },
  repetitions500: { key: "500-repetitions", title: "500 répétitions", description: "500 répétitions réellement effectuées à l’entraînement." },
  competition5: { key: "competition-dives-5-repetitions", title: "Maîtrise de la liste de compétition", description: "Au moins 5 répétitions réelles de chacun de tes plongeons de compétition." }
} as const;

export type MilestoneKey = typeof MILESTONES[keyof typeof MILESTONES]["key"];
