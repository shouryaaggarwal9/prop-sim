import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        A simulated prop-firm evaluation
      </h1>
      <p className="mt-4 text-muted">
        Trade a live-replayed synthetic market against real evaluation rules — a profit
        target, a daily loss limit, and a trailing drawdown — the same shape of account
        a prop trading firm actually gives you at the entry level. No real money, no
        real market data, and no ambiguity about that: everything here is simulated.
      </p>
      <Link href="/dashboard" className="btn-buy mt-8 inline-flex px-6 py-3">
        Start a free evaluation
      </Link>
    </div>
  );
}
