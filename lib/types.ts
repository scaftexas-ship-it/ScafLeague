export type Sport = "pickleball" | "badminton" | "tennis" | "volleyball";
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
