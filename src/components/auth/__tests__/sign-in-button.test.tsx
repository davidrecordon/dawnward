import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignInButton } from "../sign-in-button";

describe("SignInButton", () => {
  it("renders with Google branding", () => {
    render(<SignInButton />);
    expect(screen.getByRole("button")).toHaveTextContent("Sign in with Google");
  });

  it("renders Google icon", () => {
    render(<SignInButton />);
    // Google icon is an SVG with specific viewBox
    const svg = document.querySelector('svg[viewBox="0 0 24 24"]');
    expect(svg).toBeInTheDocument();
  });

  it("accepts custom className", () => {
    render(<SignInButton className="custom-class" />);
    expect(screen.getByRole("button")).toHaveClass("custom-class");
  });

  it("has submit type for form usage", () => {
    render(<SignInButton />);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });
});
