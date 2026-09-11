export type Sport = "pickleball" | "badminton" | "tennis" | "volleyball" | "ping_pong";

/**
 * Every sport the club runs, in the order they appear in menus. Kept here so
 * adding one is a single edit rather than a hunt through each pane's own copy.
 * Must stay in step with the sport_type enum in Postgres -- see
 * supabase/add-ping-pong.sql.
 */
export const SPORTS: Sport[] = ["pickleball", "badminton", "tennis", "volleyball", "ping_pong"];

/**
 * What each sport is called on screen. Four places used to capitalise the
 * stored value directly, which works only while every sport is one lowercase
 * word -- "ping_pong" would have shown up as "Ping_pong".
 */
const SPORT_LABELS: Record<Sport, string> = {
  pickleball: "Pickleball",
  badminton: "Badminton",
  tennis: "Tennis",
  volleyball: "Volleyball",
  ping_pong: "Ping Pong"
};

export function sportLabel(sport: Sport) {
  return SPORT_LABELS[sport] || sport;
}
export type DivisionFormat = "singles" | "doubles";
export type UserRole = "admin" | "player";
export type MatchStatus = "scheduled" | "score_submitted" | "completed" | "forfeit" | "cancelled";
export type RegistrationStatus = "pending" | "approved" | "declined";
export type ScheduleType = "round_robin" | "eliminator" | "manual";

export type Player = {
  id: string;
  name: string;
  email: string;
  rating?: string;
};

export type Team = {
  id: string;
  name: string;
  playerIds: string[];
};

export type DivisionEntry = {
  id: string;
  divisionId: string;
  label: string;
  playerIds: string[];
};

export type Tournament = {
  id: string;
  name: string;
  sport: Sport;
  startDate: string;
  endDate: string;
  clubName: string;
};

export type Division = {
  id: string;
  tournamentId: string;
  name: string;
  skillLevel: string;
  format: DivisionFormat;
};

export type MatchSet = {
  setNumber: number;
  entryAScore: number;
  entryBScore: number;
};

export type Match = {
  id: string;
  divisionId: string;
  round: number;
  roundLabel?: string;
  entryAId: string;
  entryBId: string;
  targetScore?: number;
  numberOfSets?: number;
  restrictScoreUpdates?: boolean;
  scoreUpdateBeforeDays?: number;
  scoreUpdateAfterDays?: number;
  allowForfeit?: boolean;
  forfeitBeforeDays?: number;
  forfeitAfterDays?: number;
  scheduleWeekStart: string;
  scheduleWeekEnd: string;
  extensionWeekStart: string;
  extensionWeekEnd: string;
  status: MatchStatus;
  sets: MatchSet[];
  winnerEntryId?: string;
  forfeitByEntryId?: string;
};

export type Registration = {
  id: string;
  divisionId: string;
  playerId: string;
  status: RegistrationStatus;
};

export type Standing = {
  entryId: string;
  played: number;
  wins: number;
  losses: number;
  forfeitsWon: number;
  forfeitsLost: number;
  cancelled: number;
  points: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
};

export type ScoringRules = {
  pointsPerWin: number;
  pointsPerPlayedLoss: number;
  bonusPointPerSetWonWhenLost: number;
};

/** Default scoring rules -- a club can override these (see clubs.points_per_win etc.), so treat this as a fallback, not the source of truth. */
export const SCORING_RULES: ScoringRules = {
  pointsPerWin: 4,
  pointsPerPlayedLoss: 1,
  bonusPointPerSetWonWhenLost: 1
};
