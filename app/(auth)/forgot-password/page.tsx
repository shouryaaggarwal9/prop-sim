"use client";

import { useState } from "react";
import Link from "next/link";
import { resetPasswordRequest } from "@/app/actions/auth";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await resetPasswordRequest(new FormData(e.currentTarget));
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="card space-y-6 p-6 text-center">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-muted">
          If an account exists, we sent a password reset link.
        </p>
        <Link href="/login" className="btn-secondary block w-full">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="card space-y-6 p-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Reset password</h1>
        <p className="mt-1 text-sm text-muted">
          Enter your email to receive a reset link
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

        {error && <p className="text-xs text-danger">{error}</p>}

        <button type="submit" disabled={loading} className="btn-buy w-full">
          {loading ? "Sending..." : "Send reset link"}
        </button>
      </form>

      <p className="text-center text-xs text-muted">
        Remember your password?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
