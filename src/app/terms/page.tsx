import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Dawnward",
  description: "Terms of Service for Dawnward jet lag optimization app",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold">Terms of Service</h1>
      <p className="mb-4 text-sm text-slate-500">Last updated: January 2026</p>

      <div className="prose prose-slate">
        <h2 className="mt-8 text-xl font-semibold">1. Acceptance of Terms</h2>
        <p className="mt-2 text-slate-600">
          By using Dawnward, you agree to these terms. If you don&apos;t agree,
          please don&apos;t use the service.
        </p>

        <h2 className="mt-8 text-xl font-semibold">
          2. Description of Service
        </h2>
        <p className="mt-2 text-slate-600">
          Dawnward is a jet lag optimization tool that generates personalized
          schedules for adapting to new timezones. The service provides
          recommendations for light exposure, sleep timing, and optional use of
          melatonin and caffeine.
        </p>

        <h2 className="mt-8 text-xl font-semibold">3. Medical Disclaimer</h2>
        <p className="mt-2 text-slate-600">
          Dawnward is not a medical device and does not provide medical advice.
          The schedules generated are based on circadian science research but
          are not a substitute for professional medical guidance. Consult a
          healthcare provider before using melatonin or making significant
          changes to your sleep schedule, especially if you have existing health
          conditions.
        </p>

        <h2 className="mt-8 text-xl font-semibold">
          4. Google Calendar Integration
        </h2>
        <p className="mt-2 text-slate-600">
          If you choose to sync your schedule to Google Calendar, Dawnward will
          request permission to create, modify, and delete calendar events. We
          only access events created by Dawnward and do not read or modify your
          other calendar data.
        </p>

        <h2 className="mt-8 text-xl font-semibold">5. User Accounts</h2>
        <p className="mt-2 text-slate-600">
          You may use Dawnward without an account. Creating an account via
          Google Sign-In allows you to save your preferences and trip history.
          You are responsible for maintaining the security of your account.
        </p>

        <h2 className="mt-8 text-xl font-semibold">6. Acceptable Use</h2>
        <p className="mt-2 text-slate-600">
          You agree not to misuse the service, attempt to access it through
          unauthorized means, or use it for any unlawful purpose.
        </p>

        <h2 className="mt-8 text-xl font-semibold">
          7. Limitation of Liability
        </h2>
        <p className="mt-2 text-slate-600">
          Dawnward is provided &quot;as is&quot; without warranties of any kind.
          We are not liable for any damages arising from your use of the
          service, including but not limited to missed flights, health issues,
          or any other consequences of following the generated schedules.
        </p>

        <h2 className="mt-8 text-xl font-semibold">8. Changes to Terms</h2>
        <p className="mt-2 text-slate-600">
          We may update these terms from time to time. Continued use of Dawnward
          after changes constitutes acceptance of the new terms.
        </p>

        <h2 className="mt-8 text-xl font-semibold">9. Contact</h2>
        <p className="mt-2 text-slate-600">
          For questions about these terms, please email{" "}
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
