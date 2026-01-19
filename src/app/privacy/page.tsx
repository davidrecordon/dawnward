import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Dawnward",
  description: "Privacy Policy for Dawnward jet lag optimization app",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold">Privacy Policy</h1>
      <p className="mb-4 text-sm text-slate-500">Last updated: January 2026</p>

      <div className="prose prose-slate">
        <h2 className="mt-8 text-xl font-semibold">Overview</h2>
        <p className="mt-2 text-slate-600">
          Dawnward is committed to protecting your privacy. This policy explains
          what data we collect, how we use it, and your rights regarding that
          data.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Data We Collect</h2>

        <h3 className="mt-6 text-lg font-medium">Without an Account</h3>
        <p className="mt-2 text-slate-600">
          You can use Dawnward without creating an account. In this case, we
          store your trip data temporarily and do not collect any personal
          information.
        </p>

        <h3 className="mt-6 text-lg font-medium">With a Google Account</h3>
        <p className="mt-2 text-slate-600">
          If you sign in with Google, we collect:
        </p>
        <ul className="mt-2 list-disc pl-6 text-slate-600">
          <li>Your email address and name (from Google)</li>
          <li>Your profile picture (from Google)</li>
          <li>Your trip schedules and preferences</li>
        </ul>

        <h3 className="mt-6 text-lg font-medium">Google Calendar Access</h3>
        <p className="mt-2 text-slate-600">
          If you enable Google Calendar sync, we request permission to:
        </p>
        <ul className="mt-2 list-disc pl-6 text-slate-600">
          <li>Create calendar events for your jet lag schedule</li>
          <li>Modify events we previously created</li>
          <li>Delete events we previously created</li>
        </ul>
        <p className="mt-2 text-slate-600">
          We do not read, access, or modify any calendar events that were not
          created by Dawnward. We only access the specific calendar events we
          create for your schedules.
        </p>

        <h2 className="mt-8 text-xl font-semibold">How We Use Your Data</h2>
        <ul className="mt-2 list-disc pl-6 text-slate-600">
          <li>To generate personalized jet lag schedules</li>
          <li>To save your preferences for future trips</li>
          <li>To sync schedules to your Google Calendar (if enabled)</li>
          <li>To maintain your trip history</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">Data Sharing</h2>
        <p className="mt-2 text-slate-600">
          We do not sell, rent, or share your personal data with third parties,
          except:
        </p>
        <ul className="mt-2 list-disc pl-6 text-slate-600">
          <li>When required by law</li>
          <li>
            With service providers who help operate Dawnward (e.g., hosting)
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">Data Storage</h2>
        <p className="mt-2 text-slate-600">
          Your data is stored securely on servers provided by Vercel and their
          infrastructure partners. We use industry-standard security measures to
          protect your data.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Analytics</h2>
        <p className="mt-2 text-slate-600">
          We use Vercel Analytics to understand how people use Dawnward. This
          collects anonymous usage data and respects Do Not Track (DNT) and
          Global Privacy Control (GPC) signals.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Your Rights</h2>
        <p className="mt-2 text-slate-600">You have the right to:</p>
        <ul className="mt-2 list-disc pl-6 text-slate-600">
          <li>Access your data</li>
          <li>Delete your account and associated data</li>
          <li>Revoke Google Calendar access at any time</li>
          <li>Export your trip data</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">Revoking Access</h2>
        <p className="mt-2 text-slate-600">
          You can revoke Dawnward&apos;s access to your Google account at any
          time by visiting{" "}
          <a
            href="https://myaccount.google.com/permissions"
            className="text-purple-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Account Permissions
          </a>
          .
        </p>

        <h2 className="mt-8 text-xl font-semibold">Children&apos;s Privacy</h2>
        <p className="mt-2 text-slate-600">
          Dawnward is not intended for children under 13. We do not knowingly
          collect data from children under 13.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Changes to This Policy</h2>
        <p className="mt-2 text-slate-600">
          We may update this privacy policy from time to time. We will notify
          users of significant changes by posting a notice on the site.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Contact</h2>
        <p className="mt-2 text-slate-600">
          For privacy-related questions, please email{" "}
          <a
            href="mailto:hello@dawnward.app"
            className="text-purple-600 hover:underline"
          >
            hello@dawnward.app
          </a>
          .
        </p>
      </div>
    </div>
  );
}
