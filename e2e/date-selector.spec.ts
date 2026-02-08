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

  test("empty date input gets positioned to ~1 week from now on click", async ({
    page,
  }) => {
    await page.goto("/");

    // The departure date input (first one)
    const dateInput = page.locator('input[type="date"]').first();

    // Before clicking, value should be empty
    await expect(dateInput).toHaveValue("");

    // Click the wrapper div to trigger handleDateClick
    const wrapper = dateInput.locator("..");
    await wrapper.click();

    // After clicking, the native input value should be set to ~7 days from now
    // (this positions the browser's date picker to a useful date)
    const inputValue = await dateInput.inputValue();

    // Parse the value and verify it's approximately 7 days from now
    const pickerDate = new Date(inputValue + "T00:00:00");
    const now = new Date();
    const diffDays =
      (pickerDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    // Should be ~7 days from now (allow ±1 day for timezone edge cases)
    expect(diffDays).toBeGreaterThanOrEqual(5.5);
    expect(diffDays).toBeLessThanOrEqual(8.5);

    // Close any picker that opened
    await page.keyboard.press("Escape");
  });

  test("date input with existing value is not overridden on click", async ({
    page,
  }) => {
    await page.goto("/");

    // Use the "Show me" example to fill in dates
    await page.getByRole("button", { name: /Show me/i }).click();

    // Wait for the form to fill in
    await page.waitForTimeout(300);

    // The departure date input should now have a value
    const dateInput = page.locator('input[type="date"]').first();
    const originalValue = await dateInput.inputValue();
    expect(originalValue).not.toBe("");

    // Click the wrapper
    const wrapper = dateInput.locator("..");
    await wrapper.click();

    // Value should not have been changed to a week from now
    const afterClickValue = await dateInput.inputValue();
    expect(afterClickValue).toBe(originalValue);

    await page.keyboard.press("Escape");
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
