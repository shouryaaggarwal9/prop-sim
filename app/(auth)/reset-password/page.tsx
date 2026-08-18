"use client";

import { useState } from "react";
import { updatePassword } from "@/app/actions/auth";

export default function ResetPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirm = formData.get("confirm") as string;

    if (password !== confirm) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    const result = await updatePassword(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-6 p-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold">New password</h1>
        <p className="mt-1 text-sm text-muted">Enter your new password below</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-muted">New password</label>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            className="input w-full"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted">
            Confirm password
          </label>
          <input
            name="confirm"
            type="password"
            required
            minLength={6}
            className="input w-full"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <button type="submit" disabled={loading} className="btn-buy w-full">
          {loading ? "Updating..." : "Update password"}
        </button>
      </form>
    </div>
  );
}
