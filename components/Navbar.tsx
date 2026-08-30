import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export default async function Navbar() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-bg/80 px-4 md:px-6 backdrop-blur-xl">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono text-xs font-bold tracking-tighter group-hover:border-indigo-500/40 group-hover:bg-indigo-500/20 transition-all">
            PS
          </div>
          <span className="text-sm font-semibold tracking-tight text-white/90 group-hover:text-white transition-colors">
            Prop<span className="text-indigo-400">Sim</span>
          </span>
        </Link>

        {user && (
          <nav className="hidden items-center gap-1 sm:flex">
            <Link
              href="/dashboard"
              className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/4 hover:text-white transition-colors"
            >
              Terminal Desk
            </Link>
          </nav>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* System Simulation Live Indicator */}
        <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-emerald-400 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          SIMULATOR ENGINE
        </div>

        {user ? (
          <div className="flex items-center gap-3">
            <div className="hidden text-right text-[11px] sm:block">
              <span className="font-mono text-zinc-400">{user.email}</span>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-zinc-400 hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400 transition-all"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link href="/signup" className="btn-buy text-xs">
              Start Challenge
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
