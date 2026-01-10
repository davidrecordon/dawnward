import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserMenu } from "../user-menu";

// Mock next-auth/react
vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

describe("UserMenu", () => {
  const mockUser = {
    name: "John Doe",
    email: "john@example.com",
    image: "https://example.com/avatar.jpg",
  };

  it("renders user avatar with image", () => {
    render(<UserMenu user={mockUser} />);
    const avatar = screen.getByRole("button");
    expect(avatar).toBeInTheDocument();
  });

  it("calculates initials correctly for two-word name", () => {
    render(<UserMenu user={{ ...mockUser, image: null }} />);
    // Avatar fallback should show initials
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("calculates initials correctly for single-word name", () => {
    render(<UserMenu user={{ ...mockUser, name: "John", image: null }} />);
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("calculates initials correctly for three-word name", () => {
    render(
      <UserMenu user={{ ...mockUser, name: "John Bob Smith", image: null }} />
    );
    // Should take first two initials
    expect(screen.getByText("JB")).toBeInTheDocument();
  });

  it("shows fallback U when no name provided", () => {
    render(<UserMenu user={{ ...mockUser, name: null, image: null }} />);
    expect(screen.getByText("U")).toBeInTheDocument();
  });
});
