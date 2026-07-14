import type { ReactNode } from "react";

/** A labeled toggle switch, used throughout the schedule builder's advanced options. */
export function SwitchField({
  label,
  checked,
  onChange,
  children
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="stack">
      <label className="toggle-row">
        <span>{label}</span>
        <span className="switch">
          <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
          <span className="switch-track" aria-hidden />
        </span>
      </label>
      {checked && children ? children : null}
    </div>
  );
}
