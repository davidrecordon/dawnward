/**
 * Email client wrapper using Resend
 *
 * Provides a simple interface for sending emails with React Email templates.
 */

import { Resend } from "resend";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Email sender configuration
const FROM_EMAIL = "Dawnward <notifications@dawnward.app>";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Send an email using Resend.
 *
 * @param options - Email options (to, subject, html, text)
 * @returns Result with success status and message ID or error
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.error("[Email] RESEND_API_KEY not configured");
    return {
      success: false,
      error: "Email service not configured",
    };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      console.error("[Email] Resend error:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    console.log(`[Email] Sent successfully to ${options.to}, id: ${data?.id}`);
    return {
      success: true,
      id: data?.id,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[Email] Exception:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Check if the email service is configured.
 */
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}
