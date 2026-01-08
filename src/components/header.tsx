import Link from "next/link";
import { Plane } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/20 bg-white/70 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500">
            <Plane className="h-4 w-4 -rotate-45 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Dawnward</span>
        </Link>

        <button className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">
          Sign in
        </button>
      </div>
    </header>
  );
}
