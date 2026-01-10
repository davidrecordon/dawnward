import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock the auth module
vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
}));

// Mock next-auth/react for UserMenu
vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

// Need to import after mocks are set up
import { Header } from "../header";
import { auth } from "@/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedAuth = auth as any;

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders logo and brand name", async () => {
    mockedAuth.mockResolvedValue(null);
    const HeaderComponent = await Header();
    render(HeaderComponent);

    expect(screen.getByText("Dawnward")).toBeInTheDocument();
  });

  it("shows Sign in button when not authenticated", async () => {
    mockedAuth.mockResolvedValue(null);
    const HeaderComponent = await Header();
    render(HeaderComponent);

    expect(
      screen.getByRole("button", { name: /sign in/i })
    ).toBeInTheDocument();
  });

  it("shows user menu when authenticated", async () => {
    mockedAuth.mockResolvedValue({
      user: {
        id: "123",
        name: "Test User",
        email: "test@example.com",
        image: null,
      },
      expires: "2099-01-01",
    });
    const HeaderComponent = await Header();
    render(HeaderComponent);

    // Should show avatar button (UserMenu trigger), not Sign in
    expect(
      screen.queryByRole("button", { name: /sign in/i })
    ).not.toBeInTheDocument();
    // Should show user initials in avatar fallback
    expect(screen.getByText("TU")).toBeInTheDocument();
  });

  it("links logo to home page", async () => {
    mockedAuth.mockResolvedValue(null);
    const HeaderComponent = await Header();
    render(HeaderComponent);

    const homeLink = screen.getByRole("link", { name: /dawnward/i });
    expect(homeLink).toHaveAttribute("href", "/");
  });
});
