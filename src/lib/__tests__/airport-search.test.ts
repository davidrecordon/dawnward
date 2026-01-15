import { describe, it, expect } from "vitest";
import { searchAirports, findAirportByCode } from "../airport-search";
import type { Airport } from "@/types/airport";

// Sample airports for testing
const mockAirports: Airport[] = [
  {
    code: "SFO",
    name: "San Francisco International",
    city: "San Francisco",
    country: "US",
    tz: "America/Los_Angeles",
  },
  {
    code: "LAX",
    name: "Los Angeles International",
    city: "Los Angeles",
    country: "US",
    tz: "America/Los_Angeles",
  },
  {
    code: "LHR",
    name: "London Heathrow",
    city: "London",
    country: "GB",
    tz: "Europe/London",
  },
  {
    code: "LGW",
    name: "London Gatwick",
    city: "London",
    country: "GB",
    tz: "Europe/London",
  },
  {
    code: "JFK",
    name: "John F Kennedy International",
    city: "New York",
    country: "US",
    tz: "America/New_York",
  },
  {
    code: "NRT",
    name: "Narita International",
    city: "Tokyo",
    country: "JP",
    tz: "Asia/Tokyo",
  },
  {
    code: "HND",
    name: "Haneda Airport",
    city: "Tokyo",
    country: "JP",
    tz: "Asia/Tokyo",
  },
  {
    code: "CDG",
    name: "Charles de Gaulle",
    city: "Paris",
    country: "FR",
    tz: "Europe/Paris",
  },
  {
    code: "SAN",
    name: "San Diego International",
    city: "San Diego",
    country: "US",
    tz: "America/Los_Angeles",
  },
  {
    code: "SJC",
    name: "San Jose International",
    city: "San Jose",
    country: "US",
    tz: "America/Los_Angeles",
  },
];

describe("searchAirports", () => {
  describe("query length validation", () => {
    it("returns empty array for single character query", async () => {
      expect(await searchAirports("S", mockAirports)).toEqual([]);
    });

    it("returns empty array for empty query", async () => {
      expect(await searchAirports("", mockAirports)).toEqual([]);
    });

    it("returns results for 2+ character query", async () => {
      expect((await searchAirports("SF", mockAirports)).length).toBeGreaterThan(
        0
      );
    });
  });

  describe("exact code matching", () => {
    it("gives highest priority to exact code match", async () => {
      const results = await searchAirports("sfo", mockAirports);
      expect(results[0].code).toBe("SFO");
    });

    it("is case insensitive for code matching", async () => {
      const results = await searchAirports("SFO", mockAirports);
      expect(results[0].code).toBe("SFO");

      const resultsLower = await searchAirports("sfo", mockAirports);
      expect(resultsLower[0].code).toBe("SFO");
    });
  });

  describe("code prefix matching", () => {
    it("matches airports by code prefix", async () => {
      const results = await searchAirports("LH", mockAirports);
      expect(results[0].code).toBe("LHR");
    });

    it("code prefix ranks higher than city match", async () => {
      // "SA" should match SAN (code starts with SA) before San Francisco
      const results = await searchAirports("SA", mockAirports);
      expect(results[0].code).toBe("SAN");
    });
  });

  describe("city matching", () => {
    it("finds airports by city name", async () => {
      const results = await searchAirports("London", mockAirports);
      expect(results.length).toBe(2);
      expect(results.map((a) => a.code)).toContain("LHR");
      expect(results.map((a) => a.code)).toContain("LGW");
    });

    it("city start match ranks higher than city contains", async () => {
      // "San" starts San Francisco, San Diego, San Jose
      const results = await searchAirports("San", mockAirports);
      expect(results.length).toBe(3);
      // All should be San* cities
      expect(results.every((a) => a.city.startsWith("San"))).toBe(true);
    });

    it("finds airports with partial city match", async () => {
      const results = await searchAirports("York", mockAirports);
      expect(results[0].code).toBe("JFK");
    });
  });

  describe("name matching", () => {
    it("finds airports by name", async () => {
      const results = await searchAirports("Kennedy", mockAirports);
      expect(results[0].code).toBe("JFK");
    });

    it("finds airports by partial name match", async () => {
      const results = await searchAirports("Gatwick", mockAirports);
      expect(results[0].code).toBe("LGW");
    });
  });

  describe("scoring priority", () => {
    it("exact code match gets highest priority", async () => {
      // Create test data that exercises scoring paths
      const testAirports: Airport[] = [
        {
          code: "XYZ",
          name: "Some Airport",
          city: "Abcville",
          country: "US",
          tz: "UTC",
        },
        {
          code: "ABC",
          name: "Test Airport",
          city: "Somewhere",
          country: "US",
          tz: "UTC",
        },
        {
          code: "DEF",
          name: "Airport ABC",
          city: "Other",
          country: "US",
          tz: "UTC",
        },
      ];

      const results = await searchAirports("ABC", testAirports);

      // Exact match should be first
      expect(results[0].code).toBe("ABC");
    });

    it("code prefix ranks higher than city contains", async () => {
      const testAirports: Airport[] = [
        {
          code: "XYZ",
          name: "Some Airport",
          city: "Abctown",
          country: "US",
          tz: "UTC",
        },
        {
          code: "ABD",
          name: "Another Airport",
          city: "Place",
          country: "US",
          tz: "UTC",
        },
      ];

      const results = await searchAirports("AB", testAirports);

      // Code prefix match should be first
      expect(results[0].code).toBe("ABD");
    });
  });

  describe("limit parameter", () => {
    it("respects default limit of 10", async () => {
      // All airports should match "a" (appears in many places)
      const manyAirports = Array.from({ length: 20 }, (_, i) => ({
        code: `A${String(i).padStart(2, "0")}`,
        name: `Airport ${i}`,
        city: `City ${i}`,
        country: "US",
        tz: "UTC",
      }));

      const results = await searchAirports("Airport", manyAirports);
      expect(results.length).toBeLessThanOrEqual(10);
    });

    it("respects custom limit", async () => {
      const results = await searchAirports("London", mockAirports, 1);
      expect(results.length).toBe(1);
    });
  });

  describe("no matches", () => {
    it("returns empty array when no matches found", async () => {
      const results = await searchAirports("ZZZZZ", mockAirports);
      expect(results).toEqual([]);
    });
  });

  describe("whitespace handling", () => {
    it("trims whitespace from query", async () => {
      const results = await searchAirports("  SFO  ", mockAirports);
      expect(results[0].code).toBe("SFO");
    });
  });
});

describe("findAirportByCode", () => {
  it("finds airport by exact code", () => {
    const airport = findAirportByCode("SFO", mockAirports);
    expect(airport).toBeDefined();
    expect(airport!.code).toBe("SFO");
    expect(airport!.city).toBe("San Francisco");
  });

  it("is case insensitive", () => {
    const upperResult = findAirportByCode("SFO", mockAirports);
    const lowerResult = findAirportByCode("sfo", mockAirports);
    const mixedResult = findAirportByCode("Sfo", mockAirports);

    expect(upperResult).toBeDefined();
    expect(lowerResult).toBeDefined();
    expect(mixedResult).toBeDefined();
    expect(upperResult!.code).toBe(lowerResult!.code);
    expect(lowerResult!.code).toBe(mixedResult!.code);
  });

  it("returns undefined for non-existent code", () => {
    const airport = findAirportByCode("ZZZ", mockAirports);
    expect(airport).toBeUndefined();
  });

  it("returns undefined for empty code", () => {
    const airport = findAirportByCode("", mockAirports);
    expect(airport).toBeUndefined();
  });
});
