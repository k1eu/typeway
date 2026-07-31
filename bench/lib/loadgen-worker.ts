/**
 * Fallback load-generator worker (used when `oha` is not installed).
 *
 * Drives a fixed number of concurrent request loops for a fixed duration and
 * prints a JSON summary on stdout. Latencies are measured with
 * `Bun.nanoseconds()` and reported as an equal-stride sample of the sorted
 * series (capped at MAX_SAMPLES) so the parent can merge percentiles without
 * shuttling millions of numbers through a pipe.
 *
 * Configured entirely via environment variables — see loadgen.ts.
 */

const MAX_SAMPLES = 20_000;

const url = requireEnv("BENCH_URL");
const method = process.env.BENCH_METHOD || "GET";
const hasBody = process.env.BENCH_HAS_BODY === "1";
const body = process.env.BENCH_BODY ?? "";
const contentType = process.env.BENCH_CONTENT_TYPE || "";
const durationMs = Number(requireEnv("BENCH_DURATION_MS"));
const connections = Number(requireEnv("BENCH_CONNECTIONS"));

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`missing env ${name}`);
	return value;
}

const headers: Record<string, string> = {};
if (hasBody && contentType) headers["content-type"] = contentType;

const init: RequestInit = {
	method,
	headers,
	...(hasBody ? { body } : {}),
};

const latencies: number[] = [];
let ok = 0;

const startedNs = Bun.nanoseconds();
const deadlineNs = startedNs + durationMs * 1e6;

async function loop(): Promise<void> {
	while (Bun.nanoseconds() < deadlineNs) {
		const t0 = Bun.nanoseconds();
		try {
			const response = await fetch(url, init);
			// Drain the body — otherwise the connection is not returned to the pool
			// and we would be measuring header latency only.
			await response.arrayBuffer();
			if (response.status < 400) ok++;
		} catch {
			// counted as a non-ok request below
		}
		latencies.push((Bun.nanoseconds() - t0) / 1e6);
	}
}

await Promise.all(Array.from({ length: connections }, () => loop()));

const elapsedSec = (Bun.nanoseconds() - startedNs) / 1e9;

latencies.sort((a, b) => a - b);

const samples: number[] = [];
if (latencies.length <= MAX_SAMPLES) {
	samples.push(...latencies);
} else {
	// Equal-stride over the sorted series preserves the shape of the distribution.
	const stride = latencies.length / MAX_SAMPLES;
	for (let i = 0; i < MAX_SAMPLES; i++) {
		samples.push(latencies[Math.min(latencies.length - 1, Math.floor(i * stride))]);
	}
}

process.stdout.write(
	JSON.stringify({
		count: latencies.length,
		ok,
		elapsedSec,
		samples,
	}),
);
