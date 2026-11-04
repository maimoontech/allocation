import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoleAvatar } from "./RoleAvatar";

describe("RoleAvatar", () => {
  it("shows initials when there is no photograph", () => {
    render(<RoleAvatar role="member" name="Fakhruddin Kaukawala" />);

    expect(screen.getByText("FK")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the member's photograph when one is available", () => {
    render(
      <RoleAvatar role="member" name="Fakhruddin Kaukawala" photoUrl="blob:photo-url" />
    );

    const image = screen.getByRole("img", { name: /profile photograph/i });
    expect(image).toHaveAttribute("src", "blob:photo-url");
    expect(screen.queryByText("FK")).not.toBeInTheDocument();
  });
});
