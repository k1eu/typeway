# Typeway throughput benchmarks

**What does the glue cost?** Every number here is a *paired A/B comparison* run
back-to-back on one machine — never an absolute claim. A "Typeway does 100k
req/s" number is meaningless; "Typeway's bridge costs N µs per request compared
to a native handler on the same box in the same minute" is not.

Four questions, one scenario pair each:

| # | Question | Scenario |
|---|----------|----------|
| 1 | Does mounting `connect()` slow down natively registered Elysia routes? | `registered-route-get` |
| 2 | What does a request cost when it actually traverses the bridge? | `bridge-res-end-get`, `bridge-res-end-post-1kb` |
| 3 | What does hosting TanStack Start under Elysia cost vs standalone? | `tanstack-ssr` |
| 4 | What does our prod static-file path cost vs standalone? | `tanstack-static-asset` |

Plus two scenarios added beyond the original plan, because without them the
TanStack numbers are actively misleading:

- `tanstack-ssr-via-bridge` — `server.prod.ts` does **not** use
  `@typeway/connect` at all (in production the app is plain Elysia with an
  `.all("*")` route; the bridge is a dev-mode component). So scenarios 3–4
  measure *Elysia hosting*, not the bridge. This arm measures SSR actually
  routed through `connect()`'s `fallback`.
- `tanstack-ssr-unbundled` — splits the `tanstack-ssr` delta into "Elysia
  hosting" vs "the app's `bun build --target bun` step". See finding 5.

## Running

```sh
bun bench/run.ts                 # full suite (~12 min), writes bench/results/<date>-<machine>.json
bun bench/run.ts --smoke         # boot every arm, one request each, no load (~30 s sanity check)
bun bench/run.ts --only bridge   # filter scenarios by substring
bun bench/micro.ts               # in-process micro-benchmarks (mitata)
```

Useful flags: `--duration <sec>`, `--warmup <sec>`, `--connections <n>`,
`--runs <n>`, `--no-macro` (skip the TanStack scenarios), `--no-build`,
`--generator oha|fallback|auto`, `--out <path>`, `--note <text>`, `--help`.

The TanStack scenarios need `apps/playground-with-tanstack/dist`. The runner
builds it automatically if it is missing; pass `--no-build` to make a missing
build a hard error instead.

### Load generators

**[oha](https://github.com/hatoo/oha) is the primary generator** — multi-threaded
Rust, HdrHistogram latencies, so it is very unlikely to become the bottleneck
itself.

```sh
brew install oha      # macOS
cargo install oha     # anywhere
```

If `oha` is missing the runner prints install instructions and **falls back to a
built-in Bun load generator** (`lib/loadgen.ts` + `lib/loadgen-worker.ts`) so the
suite still produces real numbers. The fallback spawns a small pool of Bun
worker processes, drives a fixed number of concurrent request loops for a fixed
duration, and reports RPS plus p50/p99 from recorded `Bun.nanoseconds()`
latencies.

> **Never compare a fallback number to an oha number.** The fallback is a
> JavaScript load generator and can bottleneck before the server under test
> does, which compresses ratios toward 1.0. Its A/B ratios within a single run
> are meaningful; its absolute throughput is not. Every results JSON records
> which generator produced it under `generator.name`, and the table below is
> labelled.

## Methodology

- **Paired and interleaved.** Arms alternate round by round
  (baseline, typeway, baseline, typeway, …) rather than running as two blocks,
  so machine load drifting during a run perturbs both arms roughly equally.
- **One server listening at a time.** Each arm is booted, measured, killed, and
  awaited before the next starts.
- **Warmup on every boot.** 3 s discarded, then 3 measured runs of 10 s at
  `-c 64`. Because each round boots a fresh process, each boot gets its own
  warmup — JIT state does not carry across processes.
- **Median, not mean.** The median run *by RPS* is kept, and its latency
  percentiles are reported alongside — so throughput and latency always come
  from the same observation rather than being averaged across different runs.
- Servers run with `NODE_ENV=production`, no `--watch`, output silenced.
- Runs abort if an arm's success rate drops below 99 %, so a server that starts
  erroring under load cannot post a flattering RPS.
- **`Δ µs/req`** is the headline column: `1/RPS_typeway − 1/RPS_baseline` in
  microseconds. At saturation `1/RPS` is the effective per-request service time,
  so this is the added cost per request in wall-clock terms.

### Scenario arms

| Scenario | Baseline | Typeway |
|----------|----------|---------|
| `registered-route-get` | `servers/elysia-plain.ts` — `GET /json` | `servers/elysia-with-connect.ts` — same route **plus** a mounted `connect()` |
| `bridge-res-end-get` | `servers/elysia-handler.ts` — native `GET /ok` | `servers/bridge-direct.ts` — `res.end("ok")` in Connect middleware, no registered route |
| `bridge-res-end-post-1kb` | same, `POST` with a 1 KB JSON body, `parse: "none"` | same, middleware drains the raw body stream first |
| `tanstack-ssr` | `servers/tanstack-standalone.ts` — bare `Bun.serve` | `apps/playground-with-tanstack` `dist/app` — what `bun run start` ships |
| `tanstack-ssr-unbundled` | same baseline | `bun server.prod.ts` — same source, skipping `bun build` |
| `tanstack-static-asset` | same baseline, smallest hashed `/assets/*.js` | `dist/app`, same asset |
| `tanstack-ssr-via-bridge` | same baseline | `servers/tanstack-via-connect.ts` — SSR through `connect()`'s `fallback` |

Both arms of every pair are verified to return byte-identical payloads
(`bun bench/run.ts --smoke`). The bridge arm sets `content-type: text/plain`
explicitly so its response matches Elysia's native one — the pair differs in
machinery, not payload.

**Baseline choice for scenarios 3–5.** `@tanstack/react-start`'s build emits
`dist/server/server.js` (a handler with `.fetch(Request)`) and a `dist/client`
asset tree, but no runnable standalone bun/node server target — and `vite preview`
is a dev tool, not a production server. So the baseline is that handler mounted
on a bare `Bun.serve`, written as a line-for-line mirror of the app's
`server.prod.ts` with Elysia removed. The delta is therefore "what Elysia hosting
costs", not a difference in static-file strategy.

The static asset is the **smallest** hashed `.js` file in the build, chosen
automatically so it survives rebuilds. Smallest keeps the scenario dominated by
per-request overhead rather than by bandwidth.

## Latest results

**Generator: `oha 1.15.0`.** Machine: Apple M1 Max, 10 cores, 32 GB, macOS 25.5.0.
Bun 1.4.0, Elysia 2.0.0-exp.61, `@tanstack/react-start` 1.168.34, Vite 8.2.0.
Full data: [`results/2026-07-31-apple-m1-max.json`](./results/2026-07-31-apple-m1-max.json).

> **Measured under contention.** Two sibling coding agents were running builds on
> the same laptop throughout (load average 7–8 at start, 4–7 at end). Absolute
> RPS is therefore depressed. Run-to-run spread came out at **3.2 % max**, inside
> the ~5 % methodology threshold, and the ratios below reproduced across two
> independent full runs — but **absolute numbers here must not be quoted as
> Typeway characteristics**. A re-run on an idle machine is still owed.

| scenario | baseline RPS | typeway RPS | ratio | p99 base | p99 typeway | Δ µs/req |
|---|---|---|---|---|---|---|
| registered route (GET /json) | 100.7k | 98.8k | **0.981x** | 1.29 ms | 1.30 ms | +0.2 |
| bridge res.end (GET /ok) | 104.1k | 50.4k | **0.484x** | 1.25 ms | 2.49 ms | +10.2 |
| bridge res.end (POST 1 KB) | 81.3k | 28.7k | **0.354x** | 1.71 ms | 4.63 ms | +22.5 |
| TanStack SSR (GET /) — shipped `dist/app` | 4981 | 2999 | **0.602x** | 24.8 ms | 41.2 ms | +132.7 |
| TanStack SSR — unbundled `server.prod.ts` | 4968 | 5042 | **1.015x** | 24.8 ms | 24.6 ms | −3.0 |
| static asset (723 B hashed `.js`) | 23.8k | 26.2k | **1.102x** | 5.24 ms | 4.74 ms | −3.9 |
| TanStack SSR via `connect()` fallback | 4977 | 4929 | **0.991x** | 24.9 ms | 25.2 ms | +1.9 |

## Findings

**1. Mounting `connect()` does not slow down registered routes — claim holds.**
−1.93 %, inside the ≤ ~2 % claim, and `Δ µs/req` is +0.2 µs (i.e. nothing). The
wildcard-route mounting works exactly as advertised: `/json` never enters the
bridge. Caveat: −1.93 % is *close to* the 2 % boundary, and per-run spread on
this pair was 1.8–2.4 %, so the honest reading is "no measurable cost, and the
claim is not violated" rather than "comfortably 1.9 %".

**2. The bridge costs ~10 µs per request (GET), ~22 µs with a 1 KB body.**
That is the headline answer to "what does the glue cost". Stated as a ratio it
looks alarming — throughput roughly halves (0.48x) — but that ratio is measured
against a handler that does *nothing*, where 10 µs is most of the request. The
useful framing is the absolute cost:

- ~10 µs/req to construct `IncomingMessage`/`ServerResponse` shims, run the
  Connect chain, and stream the response back out.
- ~22 µs/req when a 1 KB body has to go through `Readable.fromWeb`. The extra
  ~12 µs is the body-streaming path.
- Micro-benchmarks (`bun bench/micro.ts`) put the in-process `handle()`
  round-trip at **3.75 µs** (GET) and **5.01 µs** (POST 1 KB), vs 291 ns for a
  bare `new Response`. So `handle()` itself is roughly a third of the end-to-end
  cost; the rest is Elysia's wildcard dispatch plus the stream plumbing around it.
- `createBridgeRequest` is ~10x `new Request`; `BridgeResponse` → `Response` is
  ~20x `new Response("ok")` at **1.73 µs**.

Whether 10 µs matters is entirely a function of what the route does. On a
no-op route it is a 2x throughput cut. On anything doing real work — the SSR
scenario below, at ~200 µs/req — it disappears into the noise (0.991x).

**3. Hosting TanStack Start under Elysia is free.** The unbundled
`server.prod.ts` is **1.015x** the standalone `Bun.serve` baseline — parity,
within run-to-run spread. Even routing SSR *through the bridge* (`connect()`'s
`fallback`, i.e. the dev-mode shape) is **0.991x**. Both directions say the same
thing: at SSR scale the glue is not measurable.

**4. The prod static-file path is at parity or slightly better** — **1.102x**,
i.e. Elysia + `Bun.file` beat the bare `Bun.serve` + `Bun.file` baseline by 10 %.
This reproduced across runs with ≤1 % spread, so it is not noise, but the cause
was not investigated (this task is measure-only). Treat it as "no cost", not as
"Elysia makes static files faster".

**5. ⚠️ The shipped prod build costs ~40 % of SSR throughput — and it is not the
glue.** `bun run start` (`bun dist/app`) manages **0.602x** the standalone
baseline, which initially reads as a damning number for Typeway. It is not. The
`tanstack-ssr-unbundled` scenario runs the *same source file* without the
`bun build --target bun --outfile dist/app` step and gets **1.015x**. Verified
back-to-back on an otherwise identical setup:

| how `server.prod.ts` is run | SSR RPS |
|---|---|
| standalone baseline (`Bun.serve` + handler) | 4981 |
| `bun server.prod.ts` (unbundled) | 5042 |
| `bun dist/app` (`bun build --target bun`) | 2999 |

So the app's `build:server` step — which re-bundles Vite's already-built
`dist/server/server.js` into a second bundle — is where ~40 % of SSR throughput
goes. **This is a finding about `apps/playground-with-tanstack`'s build
pipeline, not about `@typeway/connect` or Elysia**, and it is worth its own
investigation (likely candidates: the double-bundling losing React's production
build, or module-resolution/`require` shims introduced by `--target bun`). Left
unfixed here deliberately — plan 03 is measure-and-report only.



## Micro-benchmarks

`bun bench/micro.ts` isolates the bridge internals in-process — no sockets, no
Elysia router — so a regression can be attributed to a specific piece rather
than to "the server got slower". It measures `createBridgeRequest`,
`BridgeResponse`, and the full `handle()` round-trip, with `new Request(...)` /
`new Response("ok")` included purely as scale references.

`micro.ts` re-declares `handle()` as a copy of the closure in
`packages/connect/src/index.ts` — deliberately, because the benchmark must not
require changing the shape of the code it measures. **If `handle()` changes in
the package, update the copy in `micro.ts`.**

## Repo notes

- **`bench/` is not a workspace member.** The root `workspaces` array is
  `["packages/*", "apps/*"]` and the benchmarks have no business being installed
  as part of a normal `bun install`. Consequences:
  - `mitata` is installed by `bench/`'s own `package.json` + `bun.lock`. Run
    `cd bench && bun install` once before `bun bench/micro.ts`.
  - Bun's isolated linker means a bare `elysia` specifier cannot be resolved by
    walking up from `bench/`, and a second copy under `bench/node_modules` would
    be a different module realpath — i.e. a *second Elysia instance*, breaking
    `instanceof Elysia` inside `.use()`. `lib/elysia.ts` re-exports Elysia
    through the workspace-resolved path so there is exactly one instance shared
    with `@typeway/connect`. Import Elysia from `../lib/elysia` in bench code,
    never as a bare specifier.
  - `@typeway/connect` is imported by relative path
    (`../../packages/connect/src/index.ts`).
- **Elysia v2 takes the route config as the *second* argument and the handler
  third** — `.post(path, { parse: "none" }, handler)`. Passing the config third
  silently makes it the *response body* rather than erroring, which is an easy
  way to benchmark the wrong thing. (`parse: "none"` is what keeps the POST
  baseline fair: it stops Elysia JSON-parsing a body the bridge only streams.)
- **oha ≥ 1.x replaced `--json` with `--output-format json`.**
- In oha's JSON, `summary.total` is the **elapsed wall time in seconds**, not a
  request count. The request count only exists in `statusCodeDistribution`.

## CI posture

Benchmarks are **not** part of PR CI — shared runners are too noisy to produce
anything trustworthy, and a flaky perf gate trains people to ignore CI.

`bench.workflow.yml` in this directory is a `workflow_dispatch`-only job that
runs the suite and uploads the results JSON as an artifact, clearly labelled
directional-only. **It is inert where it sits — move it to
`.github/workflows/bench.yml` to enable it.**

The source of truth is local runs on a quiet machine, committed to
`bench/results/`.

## Pending: root `package.json` script

Not applied here (the root manifest is owned by another change). Merge into
`scripts`:

```json
"bench": "bun bench/run.ts",
"bench:micro": "cd bench && bun install && bun micro.ts"
```

Do **not** add `bench` to the root `workspaces` array — see
[Repo notes](#repo-notes).
