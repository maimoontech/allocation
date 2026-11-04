import type { ReactNode } from "react";

export type TabDefinition = {
  id: string;
  label: string;
  /** Shown as a dot on the tab, so a member can see which sections need attention. */
  hasError?: boolean;
};

export type TabsProps = {
  tabs: TabDefinition[];
  activeId: string;
  onChange: (id: string) => void;
  children: ReactNode;
};

/**
 * Tab strip for the member profile.
 *
 * Two deliberate properties:
 *
 *   - The strip scrolls horizontally rather than wrapping or collapsing, so all twelve tabs
 *     stay reachable at phone width (FR-025). A select would hide where you are; wrapping
 *     would push the form off the screen.
 *   - Only the active panel is rendered. Unsaved edits survive a tab switch because they
 *     live in the profile slice, not in the inputs (FR-026) — so keeping every panel mounted
 *     would cost twelve tabs of DOM for nothing.
 *
 * Uses the roving-tabindex pattern the ARIA tabs role expects: one tab in the tab order,
 * arrow keys to move between them.
 */
export function Tabs({ tabs, activeId, onChange, children }: TabsProps) {
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeId)
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (activeIndex + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (activeIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;

    if (next !== null) {
      event.preventDefault();
      onChange(tabs[next].id);
    }
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Profile sections"
        onKeyDown={onKeyDown}
        className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              // Only the active tab is in the tab order; arrow keys move between them.
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={[
                "shrink-0 whitespace-nowrap rounded-button px-3 py-2 text-sm font-semibold",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                isActive
                  ? "bg-primary text-white"
                  : "bg-transparent text-textMuted hover:bg-black/5"
              ].join(" ")}
            >
              <span className="mr-1 text-xs opacity-70">{index + 1}</span>
              {tab.label}
              {tab.hasError ? (
                <span
                  aria-label="has errors"
                  className={[
                    "ml-2 inline-block h-2 w-2 rounded-full align-middle",
                    isActive ? "bg-white" : "bg-danger"
                  ].join(" ")}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${activeId}`} aria-labelledby={`tab-${activeId}`}>
        {children}
      </div>
    </div>
  );
}
