/**
 * The "A vs B" line every match display shares, with the home/away sides
 * labelled. entry_a is the home side by convention -- generateRoundRobinSchedule
 * already alternates which competitor lands there each round (see homeFirst in
 * lib/league-rules.ts), so teams get a fair split of home games. That was always
 * true in the data; this just makes it visible.
 */
export function Versus({ homeLabel, awayLabel }: { homeLabel?: string; awayLabel?: string }) {
  return (
    <div className="versus">
      <span className="versus-side">
        <span>{homeLabel || "Entry A"}</span>
        <small className="versus-role">Home</small>
      </span>
      <span className="subtle">vs</span>
      <span className="versus-side">
        <span>{awayLabel || "Entry B"}</span>
        <small className="versus-role">Away</small>
      </span>
    </div>
  );
}
