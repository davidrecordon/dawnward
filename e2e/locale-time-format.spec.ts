import { test, expect } from "@playwright/test";

test.describe("Time format locale detection", () => {
  test.describe("UK locale (24-hour)", () => {
    test.use({ locale: "en-GB" });

    test("shows 24-hour format in time selects", async ({ page }) => {
      await page.goto("/");

      // Find the wake time select by its label
      const wakeTimeLabel = page.getByText("Usual wake time");
      const wakeTimeSection = wakeTimeLabel.locator("..");
      const wakeTimeSelect = wakeTimeSection.getByRole("combobox");
      await wakeTimeSelect.click();

      // Should show 24-hour format (e.g., "07:00" not "7:00 AM")
      const option = page.getByRole("option", { name: "07:00" });
      await expect(option).toBeVisible();

      // Should NOT have AM/PM group labels
      const amLabel = page.getByText("AM", { exact: true });
      await expect(amLabel).not.toBeVisible();
    });
  });

  test.describe("US locale (12-hour)", () => {
    test.use({ locale: "en-US" });

    test("shows 12-hour format in time selects", async ({ page }) => {
      await page.goto("/");

      // Find the wake time select by its label
      const wakeTimeLabel = page.getByText("Usual wake time");
      const wakeTimeSection = wakeTimeLabel.locator("..");
      const wakeTimeSelect = wakeTimeSection.getByRole("combobox");
      await wakeTimeSelect.click();

      // Should show 12-hour format with AM/PM (e.g., "7:00 AM")
      const option = page.getByRole("option", { name: /7:00 AM/i });
      await expect(option).toBeVisible();

      // Should have AM group label
      const amLabel = page.getByText("AM", { exact: true });
      await expect(amLabel).toBeVisible();
    });
  });

  test.describe("Singapore locale (12-hour)", () => {
    test.use({ locale: "en-SG" });

    test("shows 12-hour format in time selects", async ({ page }) => {
      await page.goto("/");

      // Find the wake time select by its label
      const wakeTimeLabel = page.getByText("Usual wake time");
      const wakeTimeSection = wakeTimeLabel.locator("..");
      const wakeTimeSelect = wakeTimeSection.getByRole("combobox");
      await wakeTimeSelect.click();

      // Singapore uses 12-hour format
      const option = page.getByRole("option", { name: /7:00 AM/i });
      await expect(option).toBeVisible();
    });
  });
});
