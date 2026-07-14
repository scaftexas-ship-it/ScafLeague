import type { ReactNode } from "react";

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body?: string }) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      {body ? <p className="subtle">{body}</p> : null}
    </div>
  );
}
