import Link from "next/link";

export default function SharedNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Schedule not found</h1>
      <p className="mt-2 text-slate-600">
        This share link may have expired or been removed.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block text-sky-600 underline hover:text-sky-700"
      >
        Create your own jet lag schedule
      </Link>
    </div>
  );
}
