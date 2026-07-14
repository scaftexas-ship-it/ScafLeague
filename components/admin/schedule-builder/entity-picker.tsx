import type { ReactNode } from "react";

/**
 * Generic searchable / filterable / multi-select checkbox list. The old
 * admin-workspace.tsx wrote this exact "search + selected-only checkbox +
 * bulk select/clear + checkbox list + selected summary pills" block out
 * twice by hand (once for players, once for teams). This is that block,
 * written once and parameterized by item type.
 */
export function EntityPicker<T>({
  items,
  getId,
  getLabel,
  getSublabel,
  selectedIds,
  search,
  onSearchChange,
  showSelectedOnly,
  onToggleShowSelectedOnly,
  onToggle,
  onSelectVisible,
  onClearVisible,
  onClearAll,
  extraFilter,
  emptyText
}: {
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  getSublabel?: (item: T) => string | undefined;
  selectedIds: string[];
  search: string;
  onSearchChange: (value: string) => void;
  showSelectedOnly: boolean;
  onToggleShowSelectedOnly: (value: boolean) => void;
  onToggle: (id: string) => void;
  onSelectVisible: (ids: string[]) => void;
  onClearVisible: (ids: string[]) => void;
  onClearAll: () => void;
  extraFilter?: ReactNode;
  emptyText: string;
}) {
  const query = search.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (query && !getLabel(item).toLowerCase().includes(query) && !(getSublabel?.(item) || "").toLowerCase().includes(query)) return false;
    if (showSelectedOnly && !selectedIds.includes(getId(item))) return false;
    return true;
  });
  const visibleIds = filtered.map(getId);
  const selectedItems = items.filter((item) => selectedIds.includes(getId(item)));

  return (
    <div className="entity-picker">
      <div className="entity-picker-controls">
        <label className="field">
          <span className="visually-hidden">Search</span>
          <input onChange={(event) => onSearchChange(event.target.value)} placeholder="Search..." value={search} />
        </label>
        {extraFilter}
        <label className="checkbox-row">
          <input checked={showSelectedOnly} onChange={(event) => onToggleShowSelectedOnly(event.target.checked)} type="checkbox" />
          Selected only
        </label>
      </div>
      <div className="toolbar">
        <button className="link-button" onClick={() => onSelectVisible(visibleIds)} type="button">
          Select visible
        </button>
        <button className="link-button" onClick={() => onClearVisible(visibleIds)} type="button">
          Clear visible
        </button>
        <button className="link-button" onClick={onClearAll} type="button">
          Clear all
        </button>
      </div>
      <div className="entity-picker-list">
        {filtered.length === 0 ? (
          <p className="subtle">{emptyText}</p>
        ) : (
          filtered.map((item) => {
            const id = getId(item);
            return (
              <label className="entity-picker-row" key={id}>
                <input checked={selectedIds.includes(id)} onChange={() => onToggle(id)} type="checkbox" />
                <span>
                  {getLabel(item)}
                  {getSublabel?.(item) ? <span className="subtle"> · {getSublabel(item)}</span> : null}
                </span>
              </label>
            );
          })
        )}
      </div>
      {selectedItems.length > 0 ? (
        <div className="entity-picker-selected">
          {selectedItems.slice(0, 12).map((item) => (
            <span className="pill blue" key={getId(item)}>
              {getLabel(item)}
            </span>
          ))}
          {selectedItems.length > 12 ? <span className="pill">+{selectedItems.length - 12} more</span> : null}
        </div>
      ) : null}
    </div>
  );
}
