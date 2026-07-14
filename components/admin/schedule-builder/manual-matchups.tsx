import type { ManualMatchup } from "./use-schedule-builder";

export function ManualMatchups({
  matches,
  options,
  onAdd,
  onRemove,
  onChange
}: {
  matches: ManualMatchup[];
  options: Array<{ id: string; label: string }>;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, side: "aId" | "bId", value: string) => void;
}) {
  return (
    <div className="stack">
      <h3>Manual matchups</h3>
      {matches.map((row, index) => (
        <div className="field-row" key={index}>
          <label className="field">
            <span>Team/Player A</span>
            <select onChange={(event) => onChange(index, "aId", event.target.value)} value={row.aId}>
              <option value="">Select</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Team/Player B</span>
            <select onChange={(event) => onChange(index, "bId", event.target.value)} value={row.bId}>
              <option value="">Select</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button className="button secondary small" disabled={matches.length === 1} onClick={() => onRemove(index)} type="button">
            Remove
          </button>
        </div>
      ))}
      <button className="button secondary small" onClick={onAdd} type="button">
        Add matchup
      </button>
    </div>
  );
}
