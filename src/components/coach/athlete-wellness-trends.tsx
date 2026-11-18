import { formatMontrealDate } from "@/lib/timezone";

export type WellnessSession = { id: string; date: Date | string; rating: string | null };

export function AthleteWellnessTrends({ sessions }: { sessions: WellnessSession[] }) {
  const sessionRatingScale = ["pas bien", "difficile", "moyen", "bien", "très bien"];
  const wellnessPoints = sessions
    .filter((session) => session.rating && sessionRatingScale.includes(session.rating.trim().toLocaleLowerCase("fr")))
    .map((session) => ({ ...session, score: sessionRatingScale.indexOf(session.rating!.trim().toLocaleLowerCase("fr")) + 1 }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-7);
  const wellnessAverage = wellnessPoints.length ? wellnessPoints.reduce((sum, point) => sum + point.score, 0) / wellnessPoints.length : null;
  const wellnessCoordinates = wellnessPoints.map((point, index) => `${wellnessPoints.length < 2 ? 54 : 12 + index / (wellnessPoints.length - 1) * 86},${47 - (point.score - 1) * 10}`);
  const wellnessLine = wellnessCoordinates.join(" ");
  return <section className="athlete-panel athlete-session-rating-panel"><h2>Tendances bien-être</h2><div className="athlete-wellbeing"><strong>{wellnessAverage === null ? "—" : wellnessAverage.toFixed(1)}</strong><span>/ 5</span><i aria-hidden="true">⌄</i><p>Ressenti moyen après séance</p></div>{wellnessPoints.length ? <div className="athlete-session-rating-chart"><svg viewBox="0 0 100 56" preserveAspectRatio="none" role="img" aria-label={`Évaluations de fin de séance, moyenne ${wellnessAverage?.toFixed(1)} sur 5`}>
        {[1,2,3,4,5].map((score) => { const y = 47 - (score - 1) * 10; return <g key={score}><line x1="10" x2="99" y1={y} y2={y} stroke="#e7edf3" strokeWidth=".5" vectorEffect="non-scaling-stroke"/><text x="1" y={y + 1.5} fill="#71839a" fontSize="4">{score}</text></g>; })}
        {wellnessPoints.length > 1 && <polygon points={`10,49 ${wellnessLine} 99,49`} fill="url(#session-rating-fill)"/>}
        <defs><linearGradient id="session-rating-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#17b8c9" stopOpacity=".2"/><stop offset="100%" stopColor="#17b8c9" stopOpacity="0"/></linearGradient></defs>
        <polyline points={wellnessLine} fill="none" stroke="#0aa9ba" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
        {wellnessPoints.map((point,index) => <circle key={point.id} cx={wellnessPoints.length < 2 ? 54 : 12 + index / (wellnessPoints.length - 1) * 86} cy={47 - (point.score - 1) * 10} r="2" fill="#fff" stroke="#0aa9ba" strokeWidth="1.5" vectorEffect="non-scaling-stroke"><title>{`${formatMontrealDate(new Date(point.date),{day:"numeric",month:"short"})} · ${point.rating}`}</title></circle>)}
      </svg><div className="athlete-session-rating-dates"><span>{formatMontrealDate(new Date(wellnessPoints[0].date),{day:"numeric",month:"short"})}</span><span>{formatMontrealDate(new Date(wellnessPoints[Math.floor((wellnessPoints.length-1)/2)].date),{day:"numeric",month:"short"})}</span><span>{formatMontrealDate(new Date(wellnessPoints.at(-1)!.date),{day:"numeric",month:"short"})}</span></div><div className="athlete-session-rating-legend"><span><i/>Pas bien</span><span><i/>Difficile</span><span><i/>Moyen</span><span><i/>Bien</span><span><i/>Très bien</span></div></div> : <p className="athlete-empty athlete-session-rating-empty">Aucune évaluation de fin de séance pour le moment.</p>}</section>;
}
