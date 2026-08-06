import { formatStatusLabel } from "@/lib/format";
import type { MatchStatus } from "@/lib/types";

/**
 * A match's status, colour-coded by what it means.
 *
 * Every list used to render this pill orange whatever the status was, so a
 * finished match and one that hadn't been played yet looked identical at a
 * glance -- the only difference was the word itself. Colour carries the
 * meaning now, and the word still spells it out for anyone who can't rely on
 * the colour.
 *
 * The styling deliberately sits apart from the soft tinted pills beside it:
 * a decided match gets a solid fill. Those neighbours include the green
 * "at Home" badge, so a soft green "completed" would have read as just
 * another piece of metadata sitting next to it.
 */
export function StatusPill({ status }: { status: MatchStatus }) {
  return (
    <span className="pill status-pill" data-status={status}>
      {formatStatusLabel(status)}
    </span>
  );
}
