import { test, expect } from "@playwright/test";

test.describe("Date selector cross-browser", () => {
  test("date input receives direct clicks (iOS Safari fix)", async ({
    page,
  }) => {
    await page.goto("/");

    // Find the date input directly (the transparent input that receives clicks)
    // This is the key fix: removing pointer-events-none allows direct interaction
    const dateInput = page.locator('input[type="date"]').first();

    // Verify the input exists
    await expect(dateInput).toBeAttached();

    // Verify the input does NOT have pointer-events-none class
    // This is the core fix we're testing
    await expect(dateInput).not.toHaveClass(/pointer-events-none/);

    // Click should not throw - verifies the input is directly clickable
    await dateInput.click();

    // Press Escape to close any picker that may have opened
    await page.keyboard.press("Escape");

    // Verify the component didn't crash
    await expect(dateInput).toBeAttached();
  });

  test("date input is keyboard accessible", async ({ page }) => {
    await page.goto("/");

    // Find the date input
    const dateInput = page.locator('input[type="date"]').first();

    // Verify the input does NOT have tabIndex={-1} (should be keyboard accessible)
    // This is part of the iOS fix - removing tabIndex makes it accessible
    const tabIndex = await dateInput.getAttribute("tabindex");
    expect(tabIndex).not.toBe("-1");

    // Focus the input via keyboard (tab navigation)
    await dateInput.focus();

    // Verify focus was received
    await expect(dateInput).toBeFocused();
  });
});
