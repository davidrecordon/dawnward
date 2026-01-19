import { test, expect } from "@playwright/test";

// Increase timeout for this test since schedule generation can be slow
test.describe("Now marker positioning", () => {
  test("You are here marker appears in correct chronological position", async ({
    page,
  }) => {
    // Increase test timeout to 60s to account for schedule generation time
    test.setTimeout(60000);

    await page.goto("/");

    // Use the "Show me" example to quickly generate a schedule
    // This sets up SFO → LHR with departure in 2 days (so today is a prep day)
    await page.getByRole("button", { name: /Show me/i }).click();

    // Wait for the schedule to generate (the example auto-submits after 500ms)
    // First wait for navigation to trip page (URL changes from / to /trip/...)
    await page.waitForURL(/\/trip\//, { timeout: 45000 });

    // The schedule page should have a now marker on the preparation day
    const nowMarker = page.locator("#now-marker");

    // Wait for schedule page to load and now marker to be visible
    // Allow longer timeout since schedule generation takes time
    await expect(nowMarker).toBeVisible({ timeout: 15000 });

    // Get the now marker's parent container (the timeline item wrapper)
    const nowMarkerWrapper = nowMarker.locator("xpath=..");

    // Get all timeline items in the same day section
    // The timeline is structured as .space-y-3 > div (each item)
    const daySection = nowMarkerWrapper.locator(
      "xpath=ancestor::*[contains(@class, 'space-y-3')]"
    );
    const timelineItems = daySection.locator("> div");

    const totalItems = await timelineItems.count();
    expect(totalItems).toBeGreaterThan(1);

    // Find the index of the now marker
    let nowMarkerIndex = -1;
    for (let i = 0; i < totalItems; i++) {
      const item = timelineItems.nth(i);
      const hasNowMarker = (await item.locator("#now-marker").count()) > 0;
      if (hasNowMarker) {
        nowMarkerIndex = i;
        break;
      }
    }

    expect(nowMarkerIndex).toBeGreaterThan(-1);

    // The bug: now marker always appears at the end of the list
    // After fix: now marker should appear in chronological order based on current time
    //
    // For a robust test: parse the time from now marker badge and compare with
    // times from surrounding cards to verify chronological ordering

    // Get the time displayed on the now marker
    const nowMarkerTime = await nowMarker
      .getByRole("status")
      .or(nowMarker.locator("span.shrink-0, [class*='Badge']"))
      .textContent();

    // Parse times from intervention cards before and after the now marker
    const parseTimeMinutes = (timeStr: string | null): number | null => {
      if (!timeStr) return null;
      // Match patterns like "3:36 PM", "15:36", "8:30 AM PST"
      const match12h = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      const match24h = timeStr.match(/(\d{1,2}):(\d{2})(?!\s*[AP]M)/i);

      if (match12h) {
        let hours = parseInt(match12h[1]);
        const minutes = parseInt(match12h[2]);
        const period = match12h[3].toUpperCase();
        if (period === "PM" && hours !== 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;
        return hours * 60 + minutes;
      }

      if (match24h) {
        const hours = parseInt(match24h[1]);
        const minutes = parseInt(match24h[2]);
        return hours * 60 + minutes;
      }

      return null;
    };

    const nowTimeMinutes = parseTimeMinutes(nowMarkerTime);

    // Check items before and after now marker for chronological order
    if (nowMarkerIndex > 0) {
      // Get the item before now marker
      const prevItem = timelineItems.nth(nowMarkerIndex - 1);
      // Skip timezone transitions which don't have times
      const prevTimeText = await prevItem
        .locator("span, p")
        .first()
        .textContent();
      const prevTimeMatch = prevTimeText?.match(/\d{1,2}:\d{2}\s*(AM|PM)?/i);

      if (prevTimeMatch && nowTimeMinutes !== null) {
        const prevTimeMinutes = parseTimeMinutes(prevTimeMatch[0]);
        // Item before should have earlier or equal time
        if (prevTimeMinutes !== null) {
          expect(prevTimeMinutes).toBeLessThanOrEqual(nowTimeMinutes);
        }
      }
    }

    if (nowMarkerIndex < totalItems - 1) {
      // Get the item after now marker
      const nextItem = timelineItems.nth(nowMarkerIndex + 1);
      const nextTimeText = await nextItem
        .locator("span, p")
        .first()
        .textContent();
      const nextTimeMatch = nextTimeText?.match(/\d{1,2}:\d{2}\s*(AM|PM)?/i);

      if (nextTimeMatch && nowTimeMinutes !== null) {
        const nextTimeMinutes = parseTimeMinutes(nextTimeMatch[0]);
        // Item after should have later or equal time
        if (nextTimeMinutes !== null) {
          expect(nextTimeMinutes).toBeGreaterThanOrEqual(nowTimeMinutes);
        }
      }
    }

    // Additional assertion: if current time is before late evening (say, before 10 PM),
    // the now marker should NOT be the last item (sleep_target is typically late)
    if (nowTimeMinutes !== null && nowTimeMinutes < 22 * 60) {
      // Before 10 PM - marker should not be at the very end
      // (There should be at least sleep_target after it)
      expect(nowMarkerIndex).toBeLessThan(totalItems - 1);
    }
  });
});
