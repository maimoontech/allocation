import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { YesNoField } from "./YesNoField";
import { RadioGroup } from "./RadioGroup";
import { renderWithProviders } from "../../test-utils";

describe("YesNoField", () => {
  it("renders two radios, neither selected when unanswered", () => {
    renderWithProviders(<YesNoField label="Regular Donor" value={null} onChange={() => {}} />);

    const yes = screen.getByRole("radio", { name: "Yes" }) as HTMLInputElement;
    const no = screen.getByRole("radio", { name: "No" }) as HTMLInputElement;

    expect(yes.checked).toBe(false);
    expect(no.checked).toBe(false);
  });

  /**
   * The reason this is radios rather than a checkbox.
   *
   * The server stores these as NULLABLE booleans, so "not answered" is a third state and it
   * matters: a checkbox would render an unanswered question as No, and for "do you attend
   * the Karachi Tamreen session?" that would then demand a reason the member never meant to
   * give (FR-081).
   */
  it("distinguishes unanswered from No", () => {
    const { rerender } = renderWithProviders(
      <YesNoField label="Attends" value={null} onChange={() => {}} />
    );
    expect((screen.getByRole("radio", { name: "No" }) as HTMLInputElement).checked).toBe(false);

    rerender(<YesNoField label="Attends" value={false} onChange={() => {}} />);
    expect((screen.getByRole("radio", { name: "No" }) as HTMLInputElement).checked).toBe(true);
  });

  it.each([
    ["Yes", true],
    ["No", false]
  ])("reports %s as %s", (label, expected) => {
    const onChange = vi.fn();
    renderWithProviders(<YesNoField label="Donor" value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: label }));
    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it("shows the selected value", () => {
    renderWithProviders(<YesNoField label="Donor" value onChange={() => {}} />);
    expect((screen.getByRole("radio", { name: "Yes" }) as HTMLInputElement).checked).toBe(true);
  });

  it("surfaces an error message", () => {
    renderWithProviders(
      <YesNoField label="Donor" value={null} onChange={() => {}} error="Please answer." />
    );
    expect(screen.getByText("Please answer.")).toBeInTheDocument();
  });
});

describe("RadioGroup", () => {
  it("groups the options under a legend", () => {
    renderWithProviders(
      <RadioGroup
        label="Occupation Type"
        options={[
          { value: "Job", label: "Job" },
          { value: "Business", label: "Business" }
        ]}
        value="Job"
        onChange={() => {}}
      />
    );

    expect(screen.getByRole("group", { name: "Occupation Type" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  // Tab 9 renders one "Attended With" group per attendance record, so two groups on one
  // page must not share input names or clicking one would clear the other.
  it("keeps two groups independent on the same page", () => {
    const first = vi.fn();
    const second = vi.fn();

    renderWithProviders(
      <>
        <RadioGroup
          label="First"
          options={[{ value: "a", label: "Option A" }]}
          value={null}
          onChange={first}
        />
        <RadioGroup
          label="Second"
          options={[{ value: "a", label: "Option A" }]}
          value={null}
          onChange={second}
        />
      </>
    );

    const radios = screen.getAllByRole("radio", { name: "Option A" }) as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(radios[0].name).not.toBe(radios[1].name);

    fireEvent.click(radios[0]);
    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });
});
