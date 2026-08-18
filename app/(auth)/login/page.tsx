"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "@/app/actions/auth";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await signIn(new FormData(e.currentTarget));
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-6 p-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">
          Sign in to your PropSim account
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-muted">Email</label>
          <input
            name="email"
            type="email"
            required
            className="input w-full"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted">Password</label>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            className="input w-full"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <button type="submit" disabled={loading} className="btn-buy w-full">
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="flex items-center justify-between text-xs">
        <Link href="/forgot-password" className="text-muted hover:text-accent">
          Forgot password?
        </Link>
        <Link href="/signup" className="text-accent hover:underline">
          Create account
        </Link>
      </div>
    </div>
  );
}
