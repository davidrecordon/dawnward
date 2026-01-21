/**
 * Flight Day Email Template
 *
 * Plain-text aesthetic email with flight day schedule organized into sections.
 */

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { DaySchedule } from "@/types/schedule";
import {
  formatFlightDayForEmail,
  formatDayForText,
} from "@/lib/intervention-formatter";

export interface FlightDayEmailProps {
  /** User's name for greeting */
  userName?: string;
  /** The flight day schedule */
  flightDaySchedule: DaySchedule;
  /** Route label (e.g., "LAX → LHR") */
  routeLabel: string;
  /** Departure time in HH:MM format */
  departureTime: string;
  /** Arrival time in HH:MM format */
  arrivalTime: string;
  /** Origin airport code */
  originCode: string;
  /** Destination airport code */
  destCode: string;
  /** User's 24-hour format preference */
  use24Hour?: boolean;
  /** Whether email is sent night before */
  isNightBefore?: boolean;
  /** Trip ID for "View full schedule" link */
  tripId: string;
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dawnward.app";

export function FlightDayEmail({
  userName,
  flightDaySchedule,
  routeLabel,
  departureTime,
  arrivalTime,
  originCode,
  destCode,
  use24Hour = false,
  isNightBefore = false,
  tripId,
}: FlightDayEmailProps) {
  const greeting = userName ? `Hi ${userName.split(" ")[0]},` : "Hi,";
  const dayLabel = isNightBefore ? "Tomorrow" : "Today";
  const previewText = `${dayLabel}'s jet lag plan for ${routeLabel}`;

  // Format the schedule content
  const scheduleContent = formatFlightDayForEmail(
    flightDaySchedule,
    use24Hour,
    departureTime,
    arrivalTime,
    originCode,
    destCode
  );

  const tripUrl = `${baseUrl}/trip/${tripId}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerStyle}>
            <Heading style={headingStyle}>
              ✈️ {dayLabel}&apos;s Jet Lag Plan
            </Heading>
            <Text style={subheadingStyle}>{routeLabel}</Text>
          </Section>

          <Hr style={hrStyle} />

          {/* Greeting */}
          <Section style={sectionStyle}>
            <Text style={textStyle}>{greeting}</Text>
            <Text style={textStyle}>
              {isNightBefore
                ? "Here's your jet lag plan for tomorrow's flight. Follow these timed interventions to help your body adapt faster."
                : "Here's your jet lag plan for today. Follow these timed interventions to help your body adapt faster."}
            </Text>
          </Section>

          {/* Schedule Content */}
          <Section style={scheduleStyle}>
            <pre style={preStyle}>{scheduleContent}</pre>
          </Section>

          <Hr style={hrStyle} />

          {/* Tips */}
          <Section style={sectionStyle}>
            <Text style={tipsHeadingStyle}>Quick Tips:</Text>
            <Text style={tipsStyle}>
              • Light exposure is your most powerful tool for shifting your
              clock
            </Text>
            <Text style={tipsStyle}>
              • Stay hydrated and avoid alcohol during the flight
            </Text>
            <Text style={tipsStyle}>
              • Stick to the schedule even if you feel tired at unusual times
            </Text>
          </Section>

          <Hr style={hrStyle} />

          {/* CTA */}
          <Section style={ctaStyle}>
            <Link href={tripUrl} style={linkStyle}>
              View Full Schedule →
            </Link>
          </Section>

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              Safe travels! 🌍
              <br />
              <br />
              —
              <br />
              <Link href={baseUrl} style={footerLinkStyle}>
                Dawnward
              </Link>{" "}
              · Science-based jet lag optimization
            </Text>
            <Text style={unsubscribeStyle}>
              You received this because you enabled flight day emails.{" "}
              <Link href={`${baseUrl}/settings`} style={footerLinkStyle}>
                Manage preferences
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/**
 * Render the flight day email to HTML string.
 */
export async function renderFlightDayEmail(
  props: FlightDayEmailProps
): Promise<string> {
  // Dynamic import to avoid bundling issues
  const { render } = await import("@react-email/components");
  return render(<FlightDayEmail {...props} />);
}

/**
 * Generate plain text version of the email.
 */
export function renderFlightDayEmailText(
  props: FlightDayEmailProps
): string {
  const { userName, flightDaySchedule, routeLabel, departureTime, arrivalTime, originCode, destCode, use24Hour, isNightBefore, tripId } = props;
  const greeting = userName ? `Hi ${userName.split(" ")[0]},` : "Hi,";
  const dayLabel = isNightBefore ? "Tomorrow" : "Today";
  const tripUrl = `${baseUrl}/trip/${tripId}`;

  const scheduleContent = formatFlightDayForEmail(
    flightDaySchedule,
    use24Hour ?? false,
    departureTime,
    arrivalTime,
    originCode,
    destCode
  );

  return `${dayLabel}'s Jet Lag Plan - ${routeLabel}

${greeting}

${isNightBefore
    ? "Here's your jet lag plan for tomorrow's flight. Follow these timed interventions to help your body adapt faster."
    : "Here's your jet lag plan for today. Follow these timed interventions to help your body adapt faster."}

${scheduleContent}

---

Quick Tips:
• Light exposure is your most powerful tool for shifting your clock
• Stay hydrated and avoid alcohol during the flight
• Stick to the schedule even if you feel tired at unusual times

---

View full schedule: ${tripUrl}

Safe travels! 🌍

—
Dawnward · Science-based jet lag optimization
https://dawnward.app

You received this because you enabled flight day emails.
Manage preferences: ${baseUrl}/settings
`;
}

// =============================================================================
// Styles
// =============================================================================

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
  margin: 0,
  padding: "20px 0",
};

const containerStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  margin: "0 auto",
  maxWidth: "600px",
  padding: "0",
};

const headerStyle: React.CSSProperties = {
  backgroundColor: "#f0f9ff",
  borderRadius: "8px 8px 0 0",
  padding: "32px 40px 24px",
  textAlign: "center" as const,
};

const headingStyle: React.CSSProperties = {
  color: "#0c4a6e",
  fontSize: "24px",
  fontWeight: "600",
  margin: "0 0 8px",
};

const subheadingStyle: React.CSSProperties = {
  color: "#0369a1",
  fontSize: "18px",
  fontWeight: "500",
  margin: "0",
};

const hrStyle: React.CSSProperties = {
  borderColor: "#e2e8f0",
  borderStyle: "solid",
  borderWidth: "1px 0 0 0",
  margin: "0",
};

const sectionStyle: React.CSSProperties = {
  padding: "24px 40px",
};

const textStyle: React.CSSProperties = {
  color: "#334155",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 0 16px",
};

const scheduleStyle: React.CSSProperties = {
  backgroundColor: "#fafafa",
  padding: "24px 40px",
};

const preStyle: React.CSSProperties = {
  backgroundColor: "transparent",
  color: "#334155",
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, monospace',
  fontSize: "14px",
  lineHeight: "1.8",
  margin: "0",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const tipsHeadingStyle: React.CSSProperties = {
  color: "#334155",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0 0 12px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const tipsStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 8px",
};

const ctaStyle: React.CSSProperties = {
  padding: "24px 40px",
  textAlign: "center" as const,
};

const linkStyle: React.CSSProperties = {
  backgroundColor: "#0ea5e9",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "500",
  padding: "12px 24px",
  textDecoration: "none",
};

const footerStyle: React.CSSProperties = {
  padding: "24px 40px 32px",
};

const footerTextStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 16px",
  textAlign: "center" as const,
};

const footerLinkStyle: React.CSSProperties = {
  color: "#0ea5e9",
  textDecoration: "none",
};

const unsubscribeStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "12px",
  textAlign: "center" as const,
  margin: "0",
};

export default FlightDayEmail;
