import Link from "next/link";

export default function TripNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Trip not found</h1>
      <p className="mt-2 text-slate-600">
        This trip may have been deleted or the link is invalid.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block text-sky-600 underline hover:text-sky-700"
      >
        Create a new jet lag schedule
      </Link>
    </div>
  );
}
