import theGrind from "@/data/spy/epoch-the-grind.json";
import theChop from "@/data/spy/epoch-the-chop.json";
import theSqueeze from "@/data/spy/epoch-the-squeeze.json";
import theRout from "@/data/spy/epoch-the-rout.json";
import theRecovery from "@/data/spy/epoch-the-recovery.json";
import type { Bar } from "./types";

export interface EpochData {
  name: string;
  symbol: string;
  barSeconds: number;
  subTicksPerBar: number;
  startDate: string;
  endDate: string;
  totalBars: number;
  bars: Bar[];
  vix: Record<string, number>;
}

export const EPOCHS: Record<string, EpochData> = {
  "the-grind": theGrind as EpochData,
  "the-chop": theChop as EpochData,
  "the-squeeze": theSqueeze as EpochData,
  "the-rout": theRout as EpochData,
  "the-recovery": theRecovery as EpochData,
};

export const EPOCH_SLUGS = Object.keys(EPOCHS);

export type EpochSlug = (typeof EPOCH_SLUGS)[number];

export function getEpoch(slug: string): EpochData | undefined {
  return EPOCHS[slug];
}

export function getRandomEpochSlug(): EpochSlug {
  return EPOCH_SLUGS[Math.floor(Math.random() * EPOCH_SLUGS.length)];
}

export interface EpochMeta {
  slug: string;
  name: string;
  description: string;
  regime: string;
}

export const EPOCH_META: EpochMeta[] = [
  {
    slug: "the-grind",
    name: "The Grind",
    description: "Low-volatility trend. Steady climb, shallow pullbacks.",
    regime: "Trend",
  },
  {
    slug: "the-chop",
    name: "The Chop",
    description: "Sideways grind. Tight range, false breakouts.",
    regime: "Range",
  },
  {
    slug: "the-squeeze",
    name: "The Squeeze",
    description: "Volatility compression. Quiet before the storm.",
    regime: "Low Vol",
  },
  {
    slug: "the-rout",
    name: "The Rout",
    description: "High-volatility crash. Sharp selloffs, VIX spike.",
    regime: "Crash",
  },
  {
    slug: "the-recovery",
    name: "The Recovery",
    description: "V-bottom bounce. Capitulation then sharp reversal.",
    regime: "Reversal",
  },
];
