import { describe, it, expect } from "vitest";
import {
  positionPnl,
  validateTrigger,
  resolveLeg,
  mergeById,
} from "@/lib/trading/engine";
import { generateOptionsChain } from "@/lib/market/options";

describe("positionPnl", () => {
  it("long equity: gains when price rises", () => {
    expect(
      positionPnl(
        {
          instrument_type: "equity",
          side: "long",
          quantity: 100,
          entry_price: 100,
        },
        110,
      ),
    ).toBe(1000);
  });

  it("short equity: loses when price rises", () => {
    expect(
      positionPnl(
        {
          instrument_type: "equity",
          side: "short",
          quantity: 100,
          entry_price: 100,
        },
        110,
      ),
    ).toBe(-1000);
  });

  it("long call: (exit - entry) * qty * 100", () => {
    expect(
      positionPnl(
        { instrument_type: "call", side: "long", quantity: 1, entry_price: 2 },
        10,
      ),
    ).toBe(800);
  });

  it("REGRESSION C1 — short call (covered-call leg) LOSES when underlying rips", () => {
    // Short call entered at $2.00 credit, settles at intrinsic $10.00.
    // Truth: -$800. The old engine booked +$800.
    const result = positionPnl(
      { instrument_type: "call", side: "short", quantity: 1, entry_price: 2 },
      10,
    );
    expect(result).toBe(-800);
  });

  it("REGRESSION C1 — short put profits when underlying falls to/below strike", () => {
    expect(
      positionPnl(
        { instrument_type: "put", side: "short", quantity: 2, entry_price: 3 },
        0,
      ),
    ).toBe(600);
  });

  it("long put: capped loss at expiry when worthless", () => {
    expect(
      positionPnl(
        { instrument_type: "put", side: "long", quantity: 1, entry_price: 3 },
        0,
      ),
    ).toBe(-300);
  });
});

describe("validateTrigger", () => {
  const SPOT = 590;

  it.each([
    ["limit", "long", 500, true], // rests below market ✓
    ["limit", "long", 590, true], // marketable-equal, fair fill ✓
    ["limit", "long", 600, false], // instant fill ABOVE market ✗
    ["limit", "short", 600, true],
    ["limit", "short", 580, false],
    ["stop", "long", 600, true], // breakout buy ✓
    ["stop", "long", 580, false], // REGRESSION C3 exploit ✗
    ["stop", "short", 580, true],
    ["stop", "short", 600, false],
  ] as const)(
    "(%s %s @ %d with spot %d)",
    (orderType, side, trigger, valid) => {
      expect(validateTrigger(orderType, side, trigger, SPOT))[
        valid ? "toBeNull" : "toBeTruthy"
      ]();
    },
  );

  it("rejects non-positive triggers", () => {
    expect(validateTrigger("stop", "long", 0, SPOT)).toBeTruthy();
  });
});

describe("resolveLeg", () => {
  const chain = generateOptionsChain(590, 16, 6.5);

  it("REGRESSION C2 — a put at strike K resolves to the PUT, not the same-strike call", () => {
    const leg = resolveLeg(chain, "put", chain.atmStrike);
    expect(leg.type).toBe("put");
    expect(leg.delta).toBeLessThan(0); // decisive: ATM put delta is negative
  });

  it("a call at strike K resolves to the CALL", () => {
    const leg = resolveLeg(chain, "call", chain.atmStrike);
    expect(leg.type).toBe("call");
    expect(leg.delta).toBeGreaterThan(0);
  });

  it("throws loudly for strikes outside the chain", () => {
    expect(() => resolveLeg(chain, "call", 1)).toThrow();
  });
});

describe("mergeById", () => {
  it("REGRESSION C4 — APPENDS new positions, preserving existing ones", () => {
    const shares = { id: "shares-1", kind: "equity" };
    const condorLegA = { id: "condor-a", kind: "call" };
    const condorLegB = { id: "condor-b", kind: "put" };
    const merged = mergeById(
      [shares] as any[],
      [condorLegA, condorLegB] as any[],
    );
    expect(merged).toHaveLength(3);
    expect(merged[0].id).toBe("shares-1"); // old share survived
  });

  it("never duplicates an id", () => {
    const a = { id: "x" };
    expect(mergeById([a], [{ ...a }])).toHaveLength(1);
  });
});
