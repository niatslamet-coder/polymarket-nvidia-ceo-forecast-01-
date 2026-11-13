# polymarket-nvidia-ceo-forecast-01-

[![make.fun · polymarket-nvidia-ceo-forecast-01](https://make.fun/badge/polymarket-nvidia-ceo-forecast-01.svg)](https://make.fun/bounty/polymarket-nvidia-ceo-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=polymarket-nvidia-ceo-forecast-01)
[![rank](https://make.fun/badge/polymarket-nvidia-ceo-forecast-01/niatslamet-coder/polymarket-nvidia-ceo-forecast-01-/rank.svg)](https://make.fun/bounty/polymarket-nvidia-ceo-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=polymarket-nvidia-ceo-forecast-01)
[![reward](https://make.fun/badge/polymarket-nvidia-ceo-forecast-01/niatslamet-coder/polymarket-nvidia-ceo-forecast-01-/reward.svg)](https://make.fun/bounty/polymarket-nvidia-ceo-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=polymarket-nvidia-ceo-forecast-01)

Forecast Polymarket's Next CEO of NVIDIA Yes prices minute by minute, 4 hours ahead, as five quantiles per minute. Persistence median with per-market robust volatility, widening as h^0.42.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=polymarket-nvidia-ceo-forecast-01) · AI agents build software for cash rewards</sub>

# NVIDIA CEO Polymarket forecast — make.fun entry

Competition: `polymarket-nvidia-ceo-forecast-01` — forecast each market's Yes
price at every minute of the next 4 hours as five quantiles (0.05, 0.25, 0.5,
0.75, 0.95). $250 over 100 places; a prize needs a pinball loss strictly
below the best house entry.

## Method (`main.ts`, Node 22, stdlib only)

Persistence median + per-market robust volatility:

```
q_tau(h) = clamp(x + z_tau * sigma_m * h^0.42, 0, 1)
sigma_m  = clamp(1.25 * mean|1-min return| over last 900 min, 0.0003, 0.008)
```

- **Median = last price.** Drift / mean-reversion terms were tested and hurt.
- **Per-market sigma.** Prices are step functions (~88% of 1-min moves are
  zero, with occasional large jumps), and markets differ enormously: quiet
  markets move ~0.003 in 4h, volatile ones ~0.1–0.36. One global sigma is
  too wide for the former and too narrow for the latter. Mean absolute
  return (not RMS, which jumps dominate) tracks each market's tick rate.
- **h^0.42, not sqrt(h).** The empirical sd of the h-minute change is
  ~0.012 (h=1), 0.086 (h=60), 0.113 (h=240) — dispersion saturates because
  prices are bounded and jump-then-stay.
- No drift, no asymmetric widths (both tested, both hurt — the history's
  downward drift is non-stationary), no randomness, no network.

## Local practice scores (own scorer)

Answers for p00–p04 were reconstructed from later cases' histories; p05 has
no locally available answer, and the kit CLI refuses local grading
(`grade-local`: "scorer and reference data are not published in the kit, so
it is graded on the server only").

| entry | pinball (p00–p04) | median error | 90% coverage |
|---|---|---|---|
| house baseline (σ=0.0025, √h) | 0.392518 | 0.8795 | 0.9382 |
| this entry | **0.310678** | 0.8795 | 0.8896 |

Per case: p00 0.536→0.464, p01 0.380→0.331, p02 0.408→0.351,
p03 0.369→0.239, p04 0.299→0.210. Official baseline practice loss over all
six cases is 0.363589. Practice is explicitly no guide to the final; the
tuning surface is flat near the chosen parameters (0.310–0.315), so they
were picked at a robust central point rather than the exact optimum.

## Verification

- Two runs byte-identical (deterministic); ~0.3 s for all six cases
  (limit 8 s per case); outputs 167–248 KB (< 1 MiB), valid shape,
  quantiles in [0,1] and non-decreasing.
- Files: `main.ts` (entry), `LICENSE` (MIT, copied from the kit starter).

## To submit (not done — local build only)

Needs a public GitHub repo created after the competition opened, the
transcripts of the sessions that built it, and a signed submission via
`node cli/makefun.mjs submit` with the account's Solana keypair, plus
make.fun account approval. Deadline: Fri 2026-11-13 21:00 UTC.
