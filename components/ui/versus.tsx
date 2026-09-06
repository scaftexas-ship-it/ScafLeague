import { Trophy } from "lucide-react";

export type WinnerSide = "home" | "away";

/**
 * The "A vs B" line every match display shares, with the home/away sides
 * labelled. entry_a is the home side by convention -- generateRoundRobinSchedule
 * already alternates which competitor lands there each round (see homeFirst in
 * lib/league-rules.ts), so teams get a fair split of home games. That was always
 * true in the data; this just makes it visible.
 *
 * `winnerSide` marks who actually won. Before it, a finished match showed two
 * names and a row of numbers and left you to work out which way the score ran.
 *
 * The winner is marked with a trophy and heavier text while the loser is
 * muted, deliberately NOT with colour: green and purple are already spoken for
 * by the Home and Away badges on the same line, and a third hue would have
 * turned the row into a colour puzzle. Weight and an icon also survive being
 * read by someone who cannot separate those colours.
 */
export function Versus({
  homeLabel,
  awayLabel,
  winnerSide
}: {
  homeLabel?: string;
  awayLabel?: string;
  winnerSide?: WinnerSide;
}) {
  const outcome = (side: WinnerSide) => (winnerSide ? (winnerSide === side ? "won" : "lost") : undefined);

  return (
    <div className="versus">
      <span className="versus-side" data-outcome={outcome("home")}>
        <span className="versus-name">
          {winnerSide === "home" ? <Trophy size={14} aria-hidden /> : null}
          {homeLabel || "Entry A"}
          {winnerSide === "home" ? <span className="visually-hidden">(winner)</span> : null}
        </span>
        <small className="versus-role" data-role="home">
          Home
        </small>
      </span>
      <span className="subtle">vs</span>
      <span className="versus-side" data-outcome={outcome("away")}>
        <span className="versus-name">
          {winnerSide === "away" ? <Trophy size={14} aria-hidden /> : null}
          {awayLabel || "Entry B"}
          {winnerSide === "away" ? <span className="visually-hidden">(winner)</span> : null}
        </span>
        <small className="versus-role" data-role="away">
          Away
        </small>
      </span>
    </div>
  );
}
