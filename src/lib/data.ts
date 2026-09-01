export type Athlete = {
  id: string;
  firstName: string;
  lastName: string;
  level: string;
  avatar: string;
  status: "pret" | "surveiller" | "progression";
  recentVolume: number;
  lastSession: string;
};

export type Dive = { code: string; name: string; reps: number; notes?: string };
export type Exercise = { name: string; category: string; sets: number; reps?: number; duration?: string; equipment: string; tags: string[] };
export type SessionBlock = {
  id: string;
  type: "warmup" | "dryland" | "pool" | "cooldown";
  title: string;
  duration: number;
  volume: number;
  assignedTo: string[];
  exercises?: Exercise[];
  pool?: { oneMeter: Dive[]; threeMeter: Dive[] };
};

export const athletes: Athlete[] = [
  ["emma", "Emma", "Tremblay", "Niveau 4", "progression", 128, "Arriere + ouverture"],
  ["charles", "Charles", "Gagnon", "Niveau 5", "progression", 146, "Retour technique"],
  ["leo", "Leo", "Bergeron", "Niveau 4", "surveiller", 171, "Arriere + ouverture"],
  ["juliette", "Juliette", "Roy", "Niveau 4", "pret", 119, "Entrees propres"],
  ["alice", "Alice", "Martin", "Niveau 3", "pret", 103, "Entrees propres"],
  ["thomas", "Thomas", "Gagne", "Niveau 5", "pret", 152, "Simulation"],
  ["camille", "Camille", "Bouchard", "Niveau 3", "surveiller", 95, "Dryland power"],
  ["olivier", "Olivier", "Caron", "Niveau 4", "pret", 131, "Retour technique"]
].map(([id, firstName, lastName, level, status, recentVolume, lastSession]) => ({
  id: String(id),
  firstName: String(firstName),
  lastName: String(lastName),
  level: String(level),
  status: status as Athlete["status"],
  recentVolume: Number(recentVolume),
  lastSession: String(lastSession),
  avatar: `https://api.dicebear.com/9.x/initials/svg?seed=${firstName}%20${lastName}`
}));

export const drylandLibrary: Exercise[] = [
  { name: "Hollow hold", category: "Core", sets: 3, duration: "30 sec", equipment: "Tapis", tags: ["core", "ligne"] },
  { name: "Jump squat", category: "Power", sets: 3, reps: 8, equipment: "Aucun", tags: ["jambes", "explosif"] },
  { name: "Snap opening", category: "Technique", sets: 3, reps: 6, equipment: "Tapis", tags: ["ouverture"] },
  { name: "Handstand hold", category: "Equilibre", sets: 4, duration: "25 sec", equipment: "Mur", tags: ["equilibre"] },
  { name: "Pike compression", category: "Mobilite", sets: 3, reps: 10, equipment: "Blocs", tags: ["pike"] },
  { name: "Trampoline takeoff", category: "Takeoff", sets: 5, reps: 5, equipment: "Trampoline", tags: ["appel"] },
  { name: "Shoulder mobility", category: "Mobilite", sets: 2, duration: "45 sec", equipment: "Elastique", tags: ["epaules"] }
];

export const demoSession = {
  id: "demo",
  title: "Arriere + ouverture",
  date: "2026-08-25",
  time: "16:30",
  group: "Provincial",
  duration: 90,
  focus: "203C, 201B, entrees propres",
  status: "Pret",
  coachMessage: "Rester patient sur les ouvertures. Priorite a la ligne et a l'entree propre.",
  blocks: [
    {
      id: "warmup",
      type: "warmup",
      title: "Echauffement dynamique",
      duration: 12,
      volume: 0,
      assignedTo: athletes.map((a) => a.id)
    },
    {
      id: "dry-a",
      type: "dryland",
      title: "Dryland A - Power ouverture",
      duration: 22,
      volume: 54,
      assignedTo: ["emma", "leo"],
      exercises: [drylandLibrary[1], drylandLibrary[0], drylandLibrary[2]]
    },
    {
      id: "dry-b",
      type: "dryland",
      title: "Dryland B - Equilibre Charles",
      duration: 18,
      volume: 35,
      assignedTo: ["charles"],
      exercises: [drylandLibrary[3], drylandLibrary[6]]
    },
    {
      id: "pool-a",
      type: "pool",
      title: "Entrainement piscine A",
      duration: 45,
      volume: 23,
      assignedTo: ["emma", "leo"],
      pool: {
        oneMeter: [
          { code: "101C", name: "Avant groupe", reps: 3 },
          { code: "201B", name: "Arriere carpe", reps: 5 },
          { code: "203C", name: "Un et demi arriere", reps: 4 }
        ],
        threeMeter: [
          { code: "201C", name: "Arriere groupe", reps: 4 },
          { code: "301C", name: "Retour groupe", reps: 4 },
          { code: "401B", name: "Renverse carpe", reps: 3 }
        ]
      }
    },
    {
      id: "pool-b",
      type: "pool",
      title: "Entrainement piscine B",
      duration: 45,
      volume: 16,
      assignedTo: ["charles"],
      pool: {
        oneMeter: [
          { code: "201C", name: "Arriere groupe", reps: 4 },
          { code: "301C", name: "Retour groupe", reps: 5 }
        ],
        threeMeter: [
          { code: "401B", name: "Renverse carpe", reps: 4 },
          { code: "5331D", name: "Vrille avant", reps: 3 }
        ]
      }
    },
    {
      id: "pool-c",
      type: "pool",
      title: "Entrainement piscine C",
      duration: 45,
      volume: 21,
      assignedTo: ["juliette", "alice"],
      pool: {
        oneMeter: [
          { code: "101C", name: "Avant groupe", reps: 3 },
          { code: "201C", name: "Arriere groupe", reps: 4 },
          { code: "301C", name: "Retour groupe", reps: 3 }
        ],
        threeMeter: [
          { code: "201C", name: "Arriere groupe", reps: 4 },
          { code: "301C", name: "Retour groupe", reps: 4 },
          { code: "Libre", name: "Choix technique", reps: 3 }
        ]
      }
    },
    {
      id: "cooldown",
      type: "cooldown",
      title: "Retour au calme",
      duration: 8,
      volume: 0,
      assignedTo: athletes.map((a) => a.id)
    }
  ] satisfies SessionBlock[]
};

export const weekSessions = [
  { day: "Lundi", title: "Retour technique", focus: "301C", duration: 90, volume: 128, athletes: 8, status: "Complete" },
  { day: "Mardi", title: demoSession.title, focus: demoSession.focus, duration: 90, volume: 139, athletes: 5, status: "Pret" },
  { day: "Mercredi", title: "Dryland power", focus: "Impulsion", duration: 75, volume: 96, athletes: 8, status: "Brouillon" },
  { day: "Jeudi", title: "Entrees propres", focus: "Ligne", duration: 90, volume: 121, athletes: 6, status: "Pret" },
  { day: "Vendredi", title: "Simulation competition", focus: "Routine", duration: 105, volume: 160, athletes: 8, status: "Pret" },
  { day: "Samedi", title: "Pre-competition", focus: "Qualite", duration: 60, volume: 72, athletes: 5, status: "Brouillon" },
  { day: "Dimanche", title: "", focus: "", duration: 0, volume: 0, athletes: 0, status: "Repos" }
];

export const templates = ["Arriere - ouverture", "Retour technique", "Simulation competition", "Pre-competition", "Dryland power"];

export function athleteName(id: string) {
  const athlete = athletes.find((a) => a.id === id);
  return athlete ? `${athlete.firstName} ${athlete.lastName}` : id;
}

export function blocksForAthlete(id: string) {
  return demoSession.blocks.filter((block) => block.assignedTo.includes(id));
}

export function poolVolumeForAthlete(id: string) {
  return blocksForAthlete(id).reduce((sum, block) => sum + (block.type === "pool" ? block.volume : 0), 0);
}
