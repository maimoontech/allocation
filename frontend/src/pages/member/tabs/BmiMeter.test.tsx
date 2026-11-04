import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BmiMeter } from "./BmiMeter";
import { bmiCategory } from "./shared";

describe("bmiCategory", () => {
  it.each([
    [18.49, "underweight"],
    [18.5, "normal"],
    [24.99, "normal"],
    [25, "overweight"],
    [52, "overweight"]
  ])("puts %s in %s", (bmi, expected) => {
    expect(bmiCategory(bmi)).toBe(expected);
  });
});

describe("BmiMeter", () => {
  it("reads out the value and its band", () => {
    render(<BmiMeter bmi={24.22} />);

    const meter = screen.getByRole("meter", { name: "Body mass index meter" });
    expect(meter).toHaveAttribute("aria-valuetext", "24.2, Normal");
    expect(screen.getByText("24.2")).toBeInTheDocument();
  });

  it("leaves the readout empty until there is a value", () => {
    render(<BmiMeter bmi={null} />);

    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "Not calculated yet");
    expect(screen.getByText(/Enter your height and weight/)).toBeInTheDocument();
  });
});
