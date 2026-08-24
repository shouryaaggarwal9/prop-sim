import { describe, it, expect } from "vitest";
import {
  upfrontCash,
  validateCoverage,
  optionMaxOutflow,
  reservationFor,
  quoteFunds,
  settlementCashDelta,
  type MarginLeg,
} from "./margin";
import { positionPnl } from "./engine";

/* Fixtures below use REAL fills from the user's verified sessions. */

const USER_CONDOR: MarginLeg[] = [
  // Real fill: credit condor, spot ~573, settled day_end (+50 total)
  {
    instrument_type: "put",
    side: "short",
    quantity: 1,
    strike: 570,
    entry_price: 0.2,
  },
  {
    instrument_type: "put",
    side: "long",
    quantity: 1,
    strike: 565,
    entry_price: 0.01,
  },
  {
    instrument_type: "call",
    side: "short",
    quantity: 1,
    strike: 575,
    entry_price: 0.32,
  },
  {
    instrument_type: "call",
    side: "long",
    quantity: 1,
    strike: 580,
    entry_price: 0.01,
  },
];

const BEAR_CALL_SPREAD: MarginLeg[] = [
  {
    instrument_type: "call",
    side: "short",
    quantity: 1,
    strike: 585,
    entry_price: 1.04,
  },
  {
    instrument_type: "call",
    side: "long",
    quantity: 1,
    strike: 590,
    entry_price: 0.11,
  },
];

const BEAR_PUT_SPREAD: MarginLeg[] = [
  {
    instrument_type: "put",
    side: "long",
    quantity: 1,
    strike: 590,
    entry_price: 0.77,
  },
  {
    instrument_type: "put",
    side: "short",
    quantity: 1,
    strike: 585,
    entry_price: 0.0,
  },
];

describe("upfrontCash", () => {
  it("REGRESSION C5 — condor credits +50 IMMEDIATELY (was invisible until day_end)", () => {
    expect(upfrontCash(USER_CONDOR)).toBeCloseTo(50, 8);
  });

  it("bear put spread debits -77 at entry (real fill)", () => {
    expect(upfrontCash(BEAR_PUT_SPREAD)).toBeCloseTo(-77, 8);
  });

  it("equity legs never move upfront cash (leverage model)", () => {
    expect(
      upfrontCash([
        {
          instrument_type: "equity",
          side: "long",
          quantity: 100,
          entry_price: 573.06,
        },
      ]),
    ).toBe(0);
  });

  it("covered call: only the short call's credit lands (+104)", () => {
    expect(
      upfrontCash([
        {
          instrument_type: "equity",
          side: "long",
          quantity: 100,
          entry_price: 573.06,
        },
        {
          instrument_type: "call",
          side: "short",
          quantity: 1,
          strike: 575,
          entry_price: 1.04,
        },
      ]),
    ).toBeCloseTo(104, 8);
  });
});

describe("validateCoverage", () => {
  it("naked short put is rejected outright", () => {
    expect(
      validateCoverage([
        {
          instrument_type: "put",
          side: "short",
          quantity: 1,
          strike: 570,
          entry_price: 0.2,
        },
      ]),
    ).toMatch(/Uncovered net short puts/);
  });

  it("short call with 100 shares is covered", () => {
    expect(
      validateCoverage([
        {
          instrument_type: "equity",
          side: "long",
          quantity: 100,
          entry_price: 573,
        },
        {
          instrument_type: "call",
          side: "short",
          quantity: 1,
          strike: 575,
          entry_price: 1,
        },
      ]),
    ).toBeNull();
  });

  it("99 shares cannot cover one short call", () => {
    expect(
      validateCoverage([
        {
          instrument_type: "equity",
          side: "long",
          quantity: 99,
          entry_price: 573,
        },
        {
          instrument_type: "call",
          side: "short",
          quantity: 1,
          strike: 575,
          entry_price: 1,
        },
      ]),
    ).toMatch(/Uncovered net short calls/);
  });
});

describe("reservationFor", () => {
  it("REGRESSION EXHIBIT A — covered call costs ~$5,731, not $57,361", () => {
    const r = reservationFor(
      [
        {
          instrument_type: "equity",
          side: "long",
          quantity: 100,
          entry_price: 573.06,
        },
        {
          instrument_type: "call",
          side: "short",
          quantity: 1,
          strike: 575,
          entry_price: 1.04,
        },
      ],
      10,
    );
    expect(r).toBeCloseTo(5730.6, 6); // shares' margin ONLY — the wall is gone
  });

  it("condor reserves GROSS wing width (500, not 450) — credit already sits in balance", () => {
    expect(reservationFor(USER_CONDOR, 10)).toBeCloseTo(500, 8);
  });

  it("credit vertical reserves wing width x100 (real bear call spread)", () => {
    expect(reservationFor(BEAR_CALL_SPREAD, 10)).toBeCloseTo(500, 8);
  });

  it("debit spread reserves ZERO — the debit already left the building", () => {
    expect(reservationFor(BEAR_PUT_SPREAD, 10)).toBe(0);
  });

  it("naked equity reserves notional ÷ leverage (both sides)", () => {
    const long = reservationFor(
      [
        {
          instrument_type: "equity",
          side: "long",
          quantity: 10,
          entry_price: 573,
        },
      ],
      10,
    );
    const short = reservationFor(
      [
        {
          instrument_type: "equity",
          side: "short",
          quantity: 10,
          entry_price: 573,
        },
      ],
      10,
    );
    expect(long).toBeCloseTo(573, 8);
    expect(short).toBeCloseTo(573, 8);
  });

  it("throws on uncovered shorts (defense in depth behind validation)", () => {
    expect(() =>
      reservationFor(
        [
          {
            instrument_type: "put",
            side: "short",
            quantity: 1,
            strike: 570,
            entry_price: 0.2,
          },
        ],
        10,
      ),
    ).toThrow();
  });
});

describe("quoteFunds", () => {
  it("fresh $50k account affords the real condor comfortably", () => {
    const q = quoteFunds(50000, USER_CONDOR, 10);
    expect(q.affordable).toBe(true);
    expect(q.upfront).toBeCloseTo(50, 8);
    expect(q.reservation).toBeCloseTo(500, 8);
    expect(q.error).toBeNull();
  });

  it("rejects a condor on a nearly-blown account (worst case would go negative)", () => {
    const q = quoteFunds(400, USER_CONDOR, 10);
    expect(q.affordable).toBe(false);
    expect(q.error).toMatch(/Insufficient funds/);
  });

  it("boundary: exactly-enough cash passes (epsilon-guarded)", () => {
    // Need balance + 50 ≥ 500 → balance = 450 suffices exactly.
    expect(quoteFunds(450, USER_CONDOR, 10).affordable).toBe(true);
  });
});

describe("settlementCashDelta — the ledger law", () => {
  it("REAL SL TRADE: equity books full P&L (-9.30), upfront was zero", () => {
    const leg = {
      instrument_type: "equity" as const,
      side: "long" as const,
      quantity: 10,
      entry_price: 595.93,
    };
    expect(upfrontCash([leg])).toBe(0);
    expect(settlementCashDelta(leg, 595)).toBeCloseTo(-9.3, 8);
  });

  it("long call: upfront -200 + settlement +1000 = pnl +800", () => {
    const leg = {
      instrument_type: "call" as const,
      side: "long" as const,
      quantity: 1,
      strike: 100,
      entry_price: 2,
    };
    expect(upfrontCash([leg]) + settlementCashDelta(leg, 10)).toBeCloseTo(
      positionPnl(leg, 10),
      8,
    );
  });

  it("REGRESSION C1 companion — short put settled at intrinsic keeps the ledger law", () => {
    const leg = {
      instrument_type: "put" as const,
      side: "short" as const,
      quantity: 1,
      strike: 585,
      entry_price: 0,
    };
    expect(upfrontCash([leg]) + settlementCashDelta(leg, 0)).toBeCloseTo(
      positionPnl(leg, 0),
      8,
    );
  });

  it("condor legs collectively: upfront + intrinsic settlements at S=540 = worst-case −450", () => {
    const S = 540;
    // Terminal value per leg at S: intrinsic for options, spot for equity.
    // Written as a narrowing chain so no cast is ever needed.
    const settleAtS = (l: MarginLeg) => {
      const K = l.strike ?? S;
      const terminal =
        l.instrument_type === "put"
          ? Math.max(0, K - S)
          : l.instrument_type === "call"
            ? Math.max(0, S - K)
            : S; // equity settles at spot (none in this fixture)
      return settlementCashDelta(l, terminal);
    };

    const total = USER_CONDOR.reduce((sum, l) => sum + settleAtS(l), 0);

    // long 565p: +2,500 · short 570p: −3,000 · both calls expire worthless
    expect(total).toBeCloseTo(-500, 8);
    // Ledger law across the workflow: +50 credit − 500 worst = −450 max loss
    expect(upfrontCash(USER_CONDOR) + total).toBeCloseTo(-450, 8);
  });
});
