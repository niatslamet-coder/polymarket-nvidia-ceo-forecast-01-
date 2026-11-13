// polymarket-nvidia-ceo-forecast-01 entry (Node 22, standard library only).
//
// Method: persistence median + per-market, robustly estimated volatility.
//
//   q_tau(h) = clamp(x + z_tau * sigma_m * h^0.42, 0, 1), rounded to 6 decimals
//
// where x is the market's price at the checkpoint, z_tau is the standard normal
// quantile at each level (0.05, 0.25, 0.5, 0.75, 0.95), h = 1..240 minutes after
// the checkpoint, and sigma_m is that market's own 1-minute volatility:
//
//   sigma_m = clamp(1.25 * mean|1-minute return| over the last 900 minutes,
//                   0.0003, 0.008)
//
// Why this beats the house baseline (fixed sigma 0.0025, sqrt(h) widening):
// - Prices are step functions: ~88% of 1-minute moves are exactly zero, with
//   occasional large jumps, so the pooled return distribution is extremely
//   heavy-tailed. RMS volatility is dominated by those jumps and badly
//   overstates the typical move; the mean absolute 1-minute return is robust
//   to them and tracks the market's true tick rate.
// - Markets differ enormously: quiet markets (e.g. Hock Tan) move ~0.003 in
//   4 hours while volatile ones (Colette Kress, Lisa Su, Ian Buck) move
//   ~0.1-0.36. One global sigma is far too wide for the former and too narrow
//   for the latter. Per-market sigma fixes that.
// - Dispersion grows slower than sqrt(h): the empirical sd of the h-minute
//   change is ~0.012 at h=1, 0.086 at h=60 and 0.113 at h=240, i.e. an
//   exponent near 0.42, not 0.5 (prices are bounded and jump-then-stay, so
//   long-horizon spread saturates). h^0.42 matches that.
// - Median is persistence (x). Drift / mean-reversion terms were tested on
//   the practice cases and hurt: recent moves do not reliably reverse over
//   the next 4 hours, and the history's downward drift is non-stationary
//   (early inflated prices), so no drift is applied. Asymmetric up/down
//   widths were also tested and hurt for the same reason.
//
// Backtest (local scorer, answers for p00-p04 reconstructed from later
// cases' histories; p05 has no locally available answer):
//   house baseline:  pinball 0.392518, median error 0.8795, 90% coverage 0.9382
//   this entry:      pinball 0.310678, median error 0.8795, 90% coverage 0.8896
// Improvement is consistent in every practice case (p00 0.536->0.463,
// p01 0.380->0.334, p02 0.408->0.350, p03 0.369->0.241, p04 0.299->0.210).
// The official practice loss of the baseline over all six cases is 0.363589;
// this entry's p05 score cannot be computed locally. Practice is explicitly
// no guide to the final, and the tuning surface is flat near the chosen
// parameters (0.310-0.315), so parameters were picked at a robust central
// point rather than the exact optimum, to limit overfitting to p00-p04.
//
// Deterministic, no randomness, no network, stdlib only. Runs in well under
// a second per case (limit 8 s).
//
// Input/output contract (as the starter): read every <id>.in in the input
// directory, write <id>.out to the output directory:
// {"forecasts":[{"id","q"}]}, q = 240 rows of 5 non-decreasing numbers in
// [0,1]. MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR override /input and /output.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The quantile levels the contest scores, in the order each row lists them. */
const QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level, to 6 decimals. */
const Z = [-1.644854, -0.67449, 0, 0.67449, 1.644854];

/** Minutes of history used to estimate a market's tick rate. */
const VOL_WINDOW = 900;
/** Horizon exponent: dispersion grows like h^ALPHA, not sqrt(h). */
const ALPHA = 0.42;
/** Per-market sigma is clamped to [SIGMA_FLOOR, SIGMA_CAP]. */
const SIGMA_FLOOR = 0.0003;
const SIGMA_CAP = 0.008;
/** 1.25 converts mean |return| to a Gaussian sigma (sqrt(pi/2) ~ 1.253). */
const MEANABS_TO_SIGMA = 1.25;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  horizon_minutes: number;
  quantiles: number[];
  markets: CaseMarket[];
}

/** x clamped to [0,1] and rounded to 6 decimals (0, never -0). */
const price6 = (x: number): number => Math.round(Math.min(1, Math.max(0, x)) * 1e6) / 1e6 + 0;

/** A market's 1-minute volatility from the mean absolute 1-minute return. */
function marketSigma(prices: number[]): number {
  const start = Math.max(0, prices.length - VOL_WINDOW);
  const n = prices.length - 1 - start;
  if (n <= 0) return SIGMA_FLOOR;
  let sum = 0;
  for (let i = start; i < prices.length - 1; i++) sum += Math.abs(prices[i + 1] as number - (prices[i] as number));
  const sigma = MEANABS_TO_SIGMA * (sum / n);
  return Math.min(SIGMA_CAP, Math.max(SIGMA_FLOOR, sigma));
}

/** The forecast of one market: horizon rows of the five quantiles around its last price. */
function forecast(m: CaseMarket, horizon: number): number[][] {
  if (m.prices.length === 0) throw new Error(`market ${m.id} has no prices`);
  const x = m.prices[m.prices.length - 1] as number;
  const sigma = marketSigma(m.prices);
  const rows: number[][] = [];
  for (let h = 1; h <= horizon; h++) {
    const w = sigma * Math.pow(h, ALPHA);
    rows.push(Z.map((z) => price6(x + z * w)));
  }
  return rows;
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (c.quantiles.length !== QUANTILES.length || c.quantiles.some((t, j) => t !== QUANTILES[j])) throw new Error(`${file} asks for quantiles ${JSON.stringify(c.quantiles)}, not ${JSON.stringify(QUANTILES)}`);
  const forecasts = c.markets.map((m) => ({ id: m.id, q: forecast(m, c.horizon_minutes) }));
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ forecasts })}\n`);
}
