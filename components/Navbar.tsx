import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export default async function Navbar() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <nav className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 bg-[#0a0a0a] px-6">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        PropSim
      </Link>

      <div className="flex items-center gap-4">
        {user ? (
          <>
            <Link
              href="/dashboard"
              className="text-sm text-muted hover:text-white"
            >
              Dashboard
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-muted hover:text-danger"
              >
                Sign out
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login" className="text-sm text-muted hover:text-white">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-green-400"
            >
              Get started
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
