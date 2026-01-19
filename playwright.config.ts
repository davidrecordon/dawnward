import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "bun dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3000" },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], baseURL: "http://localhost:3000" },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"], baseURL: "http://localhost:3000" },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 15 Pro"], baseURL: "http://localhost:3000" },
    },
  ],
});
