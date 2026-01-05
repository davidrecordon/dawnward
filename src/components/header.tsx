import Link from "next/link";
import { Plane } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/20 bg-white/70 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500">
            <Plane className="h-4 w-4 text-white -rotate-45" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Dawnward
          </span>
        </Link>

        <button className="px-3 py-1.5 text-sm rounded-md hover:bg-slate-100 text-slate-500">
          Sign in
        </button>
      </div>
    </header>
  );
}
