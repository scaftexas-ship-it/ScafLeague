"use client";

import { useReducer } from "react";
import type { DivisionFormat, ScheduleType, Sport } from "@/lib/types";

/** Sensible default target score per sport. */
function defaultTargetScore(sport: Sport | undefined) {
  switch (sport) {
    case "tennis":
      return "6";
    case "badminton":
      return "21";
    case "volleyball":
      return "25";
    default:
      return "11";
  }
}

/**
 * The old admin-workspace.tsx tracked this wizard as ~24 separate useState
 * calls. That made it impossible to see the wizard's shape in one place and
 * meant every "reset when X changes" effect had to remember to touch every
 * field individually. This hook collapses it to one state object + a small
 * action set, so the wizard's shape is defined once, here.
 */
export type ManualMatchup = { aId: string; bId: string };

export type ScheduleBuilderState = {
  step: "setup" | "entries";
  divisionId: string; // "" means "create a new division"
  name: string;
  skillLevel: string;
  numberOfSets: string;
  scheduleType: ScheduleType;
  format: DivisionFormat;
  startDate: string;
  restrictScoreUpdates: boolean;
  scoreUpdateBeforeDays: string;
  scoreUpdateAfterDays: string;
  allowForfeit: boolean;
  forfeitBeforeDays: string;
  forfeitAfterDays: string;
  changeWinningScore: boolean;
  targetScore: string;
  selectedPlayerIds: string[];
  selectedTeamIds: string[];
  manualMatches: ManualMatchup[];
  playerSearch: string;
  ratingFilter: string;
  showSelectedPlayersOnly: boolean;
  teamSearch: string;
  showSelectedTeamsOnly: boolean;
  replaceExisting: boolean;
};

function initialState(startDate: string, sport?: Sport): ScheduleBuilderState {
  return {
    step: "setup",
    divisionId: "",
    name: "Division 1",
    skillLevel: "3.5",
    numberOfSets: "3",
    scheduleType: "round_robin",
    format: "singles",
    startDate,
    restrictScoreUpdates: false,
    scoreUpdateBeforeDays: "7",
    scoreUpdateAfterDays: "7",
    allowForfeit: true,
    forfeitBeforeDays: "7",
    forfeitAfterDays: "0",
    changeWinningScore: false,
    targetScore: defaultTargetScore(sport),
    selectedPlayerIds: [],
    selectedTeamIds: [],
    manualMatches: [{ aId: "", bId: "" }],
    playerSearch: "",
    ratingFilter: "all",
    showSelectedPlayersOnly: false,
    teamSearch: "",
    showSelectedTeamsOnly: false,
    replaceExisting: false
  };
}

type Action =
  | { type: "patch"; patch: Partial<ScheduleBuilderState> }
  | { type: "reset"; startDate: string; sport?: Sport }
  | { type: "toggle-player"; id: string }
  | { type: "toggle-team"; id: string }
  | { type: "clear-visible-players"; visibleIds: string[] }
  | { type: "select-visible-players"; visibleIds: string[] }
  | { type: "clear-visible-teams"; visibleIds: string[] }
  | { type: "select-visible-teams"; visibleIds: string[] }
  | { type: "add-manual-match" }
  | { type: "remove-manual-match"; index: number }
  | { type: "update-manual-match"; index: number; side: "aId" | "bId"; value: string };

function reducer(state: ScheduleBuilderState, action: Action): ScheduleBuilderState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.patch };
    case "reset":
      return initialState(action.startDate, action.sport);
    case "toggle-player": {
      const selected = state.selectedPlayerIds.includes(action.id)
        ? state.selectedPlayerIds.filter((id) => id !== action.id)
        : [...state.selectedPlayerIds, action.id];
      return { ...state, selectedPlayerIds: selected };
    }
    case "toggle-team": {
      const selected = state.selectedTeamIds.includes(action.id)
        ? state.selectedTeamIds.filter((id) => id !== action.id)
        : [...state.selectedTeamIds, action.id];
      return { ...state, selectedTeamIds: selected };
    }
    case "select-visible-players":
      return { ...state, selectedPlayerIds: Array.from(new Set([...state.selectedPlayerIds, ...action.visibleIds])) };
    case "clear-visible-players":
      return { ...state, selectedPlayerIds: state.selectedPlayerIds.filter((id) => !action.visibleIds.includes(id)) };
    case "select-visible-teams":
      return { ...state, selectedTeamIds: Array.from(new Set([...state.selectedTeamIds, ...action.visibleIds])) };
    case "clear-visible-teams":
      return { ...state, selectedTeamIds: state.selectedTeamIds.filter((id) => !action.visibleIds.includes(id)) };
    case "add-manual-match":
      return { ...state, manualMatches: [...state.manualMatches, { aId: "", bId: "" }] };
    case "remove-manual-match":
      return { ...state, manualMatches: state.manualMatches.length > 1 ? state.manualMatches.filter((_, index) => index !== action.index) : state.manualMatches };
    case "update-manual-match":
      return {
        ...state,
        manualMatches: state.manualMatches.map((row, index) => (index === action.index ? { ...row, [action.side]: action.value } : row))
      };
    default:
      return state;
  }
}

export function useScheduleBuilder(startDate: string, sport?: Sport) {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(startDate, sport));

  return {
    state,
    patch: (patch: Partial<ScheduleBuilderState>) => dispatch({ type: "patch", patch }),
    reset: (nextStartDate: string, sport?: Sport) => dispatch({ type: "reset", startDate: nextStartDate, sport }),
    togglePlayer: (id: string) => dispatch({ type: "toggle-player", id }),
    toggleTeam: (id: string) => dispatch({ type: "toggle-team", id }),
    selectVisiblePlayers: (visibleIds: string[]) => dispatch({ type: "select-visible-players", visibleIds }),
    clearVisiblePlayers: (visibleIds: string[]) => dispatch({ type: "clear-visible-players", visibleIds }),
    selectVisibleTeams: (visibleIds: string[]) => dispatch({ type: "select-visible-teams", visibleIds }),
    clearVisibleTeams: (visibleIds: string[]) => dispatch({ type: "clear-visible-teams", visibleIds }),
    addManualMatch: () => dispatch({ type: "add-manual-match" }),
    removeManualMatch: (index: number) => dispatch({ type: "remove-manual-match", index }),
    updateManualMatch: (index: number, side: "aId" | "bId", value: string) => dispatch({ type: "update-manual-match", index, side, value })
  };
}

export type ScheduleBuilder = ReturnType<typeof useScheduleBuilder>;
