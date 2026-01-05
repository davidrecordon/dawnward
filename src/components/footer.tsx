import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-white/20 bg-white/30 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
        <p className="text-center text-sm text-slate-500">
          Built with{" "}
          <Link
            href="/science"
            className="font-medium text-slate-700 hover:text-slate-900"
          >
            circadian science
          </Link>
          . Not medical advice.
        </p>
      </div>
    </footer>
  );
}
