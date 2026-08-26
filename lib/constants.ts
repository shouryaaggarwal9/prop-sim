/** Single source of truth for the funded-account activation fee. */
export const EVALUATION_FEE_CENTS = 10_000; // $100.00

export const formatUsd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
