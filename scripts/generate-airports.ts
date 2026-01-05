/**
 * Generate airports.json from OurAirports data
 *
 * Fetches the OurAirports CSV and filters to major airports with:
 * - type === 'large_airport'
 * - scheduled_service === 'yes'
 * - Valid IATA code (3 letters)
 * - Valid coordinates for timezone lookup
 *
 * Run with: bun run scripts/generate-airports.ts
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { find } from "geo-tz";

const AIRPORTS_CSV_URL = "https://ourairports.com/data/airports.csv";
const OUTPUT_DIR = join(process.cwd(), "public/data");
const OUTPUT_FILE = join(OUTPUT_DIR, "airports.json");

interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
  tz: string;
}

interface RawAirport {
  id: string;
  ident: string;
  type: string;
  name: string;
  latitude_deg: string;
  longitude_deg: string;
  elevation_ft: string;
  continent: string;
  iso_country: string;
  iso_region: string;
  municipality: string;
  scheduled_service: string;
  gps_code: string;
  iata_code: string;
  local_code: string;
  home_link: string;
  wikipedia_link: string;
  keywords: string;
  score: string;
  last_updated: string;
}

function parseCSV(csvText: string): RawAirport[] {
  const lines = csvText.split("\n");
  const headers = parseCSVLine(lines[0]);

  const airports: RawAirport[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const airport: Record<string, string> = {};

    headers.forEach((header, index) => {
      airport[header] = values[index] || "";
    });

    airports.push(airport as unknown as RawAirport);
  }

  return airports;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values;
}

async function main() {
  console.log("Fetching airports from OurAirports...");

  const response = await fetch(AIRPORTS_CSV_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch airports: ${response.status}`);
  }

  const csvText = await response.text();
  console.log("Parsing CSV...");

  const rawAirports = parseCSV(csvText);
  console.log(`Parsed ${rawAirports.length} total airports`);

  // Filter to large airports with scheduled service and valid IATA codes
  const filtered = rawAirports.filter((airport) => {
    if (airport.type !== "large_airport") return false;
    if (airport.scheduled_service !== "yes") return false;
    if (!airport.iata_code || airport.iata_code.length !== 3) return false;
    if (!/^[A-Z]{3}$/.test(airport.iata_code)) return false;
    return true;
  });

  console.log(`Filtered to ${filtered.length} large airports with IATA codes`);

  // Transform to our format
  const airports: Airport[] = [];
  let skippedNoTz = 0;

  for (const raw of filtered) {
    const lat = parseFloat(raw.latitude_deg);
    const lon = parseFloat(raw.longitude_deg);

    // Skip if coordinates are invalid
    if (isNaN(lat) || isNaN(lon)) {
      skippedNoTz++;
      continue;
    }

    // Look up timezone from coordinates
    const timezones = find(lat, lon);
    if (!timezones || timezones.length === 0) {
      skippedNoTz++;
      continue;
    }

    // Use the first timezone (most relevant for the exact point)
    const tz = timezones[0];

    // Clean up the airport name
    const name = raw.name
      .replace(" International Airport", " International")
      .replace(" Airport", "")
      .replace(/\s+/g, " ")
      .trim();

    airports.push({
      code: raw.iata_code,
      name: name,
      city: raw.municipality || name,
      country: raw.iso_country,
      tz: tz,
    });
  }

  console.log(`Skipped ${skippedNoTz} airports without valid coordinates/timezone`);

  // Sort by code
  airports.sort((a, b) => a.code.localeCompare(b.code));

  console.log(`Final count: ${airports.length} airports`);

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write JSON
  writeFileSync(OUTPUT_FILE, JSON.stringify(airports, null, 2));
  console.log(`Wrote ${OUTPUT_FILE}`);

  // Print some stats
  const countries = new Set(airports.map((a) => a.country));
  console.log(`\nCoverage: ${countries.size} countries`);

  const countryCounts = [...countries]
    .map((c) => ({ country: c, count: airports.filter((a) => a.country === c).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  console.log("Top countries:", countryCounts.map((c) => `${c.country}: ${c.count}`).join(", "));
}

main().catch(console.error);
