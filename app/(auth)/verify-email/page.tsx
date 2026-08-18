"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function VerifyEmailPage() {
  const email = useSearchParams().get("email");

  return (
    <div className="card space-y-6 p-6 text-center">
      <h1 className="text-xl font-semibold">Check your email</h1>
      <p className="text-sm text-muted">
        We sent a verification link to{" "}
        <span className="text-white">{email || "your email"}</span>.
      </p>
      <p className="text-xs text-muted">
        Click the link to verify your account, then sign in.
      </p>
      <Link href="/login" className="btn-secondary block w-full">
        Go to sign in
      </Link>
    </div>
  );
}
