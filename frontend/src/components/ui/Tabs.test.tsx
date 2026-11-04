import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Tabs } from "./Tabs";
import { renderWithProviders } from "../../test-utils";

const TABS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma", hasError: true }
];

describe("Tabs", () => {
  it("renders one tab per definition, numbered", () => {
    renderWithProviders(
      <Tabs tabs={TABS} activeId="a" onChange={() => {}}>
        <div>panel</div>
      </Tabs>
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveTextContent("1");
    expect(tabs[0]).toHaveTextContent("Alpha");
  });

  it("marks only the active tab as selected", () => {
    renderWithProviders(
      <Tabs tabs={TABS} activeId="b" onChange={() => {}}>
        <div>panel</div>
      </Tabs>
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "false");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
  });

  // Roving tabindex: one stop in the tab order, arrow keys to move. Twelve tab stops before
  // reaching the form would make keyboard use miserable.
  it("keeps only the active tab in the tab order", () => {
    renderWithProviders(
      <Tabs tabs={TABS} activeId="b" onChange={() => {}}>
        <div>panel</div>
      </Tabs>
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("tabindex", "-1");
    expect(tabs[1]).toHaveAttribute("tabindex", "0");
  });

  it("reports the clicked tab", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <Tabs tabs={TABS} activeId="a" onChange={onChange}>
        <div>panel</div>
      </Tabs>
    );

    fireEvent.click(screen.getByRole("tab", { name: /Gamma/ }));
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it.each([
    ["ArrowRight", "a", "b"],
    ["ArrowLeft", "a", "c"],
    ["End", "a", "c"],
    ["Home", "c", "a"]
  ])("moves with %s", (key, from, expected) => {
    const onChange = vi.fn();
    renderWithProviders(
      <Tabs tabs={TABS} activeId={from} onChange={onChange}>
        <div>panel</div>
      </Tabs>
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key });
    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it("shows a marker on tabs with errors", () => {
    renderWithProviders(
      <Tabs tabs={TABS} activeId="a" onChange={() => {}}>
        <div>panel</div>
      </Tabs>
    );

    expect(screen.getByLabelText("has errors")).toBeInTheDocument();
  });

  it("renders the panel and links it to the active tab", () => {
    renderWithProviders(
      <Tabs tabs={TABS} activeId="b" onChange={() => {}}>
        <div>the beta panel</div>
      </Tabs>
    );

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveTextContent("the beta panel");
    expect(panel).toHaveAttribute("aria-labelledby", "tab-b");
  });
});
