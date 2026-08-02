import { useEffect, useState } from 'react'

/**
 * Shared instrumentation for the /rendering demo pages.
 *
 * Each page runs the same probe and only differs in *when* and *where* the
 * probe runs: at build time (SSG), per request on the server (SSR), or in the
 * browser (SPA). Comparing the two timestamps below across a hard reload is
 * what makes the difference visible.
 */

export type Origin = 'server' | 'browser'

/** Where the code calling this is executing right now. */
export function currentOrigin(): Origin {
  return typeof document === 'undefined' ? 'server' : 'browser'
}

export interface Probe {
  /** ISO time at which the route loader produced this data. */
  at: string
  /** Where the loader ran. */
  origin: Origin
}

export function probe(): Probe {
  return { at: new Date().toISOString(), origin: currentOrigin() }
}

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
  timeZone: 'UTC',
})

function formatTime(iso: string) {
  return `${timeFormat.format(new Date(iso))} UTC`
}

export function RenderProbePanel({
  loaderProbe,
  expectation,
  marker,
}: {
  loaderProbe: Probe
  /** What the reader should see happen when they hard-reload the page. */
  expectation: string
  /**
   * Text emitted into the markup so `curl` can tell whether this page's
   * content was in the HTML at all (it is not, for the SPA route).
   */
  marker: string
}) {
  // Deliberately not useMemo'd on the server: this is the moment the browser
  // took over, so it must be measured after hydration.
  const [hydratedAt, setHydratedAt] = useState<string | null>(null)
  useEffect(() => setHydratedAt(new Date().toISOString()), [])

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className="demo-card">
        <p className="island-kicker mb-2">Loader</p>
        <p className="m-0 font-mono text-lg text-[var(--sea-ink)]">
          {formatTime(loaderProbe.at)}
        </p>
        <p className="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">
          ran in the <strong>{loaderProbe.origin}</strong>
        </p>
      </div>

      <div className="demo-card">
        <p className="island-kicker mb-2">Hydration</p>
        <p className="m-0 font-mono text-lg text-[var(--sea-ink)]">
          {hydratedAt ? formatTime(hydratedAt) : '— not yet in the browser —'}
        </p>
        <p className="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">
          measured by an effect, so it is always the browser
        </p>
      </div>

      <div className="demo-card sm:col-span-2">
        <p className="island-kicker mb-2">Hard-reload this page</p>
        <p className="m-0 text-sm text-[var(--sea-ink-soft)]">{expectation}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="demo-button"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <span className="demo-pill" data-render-marker={marker}>
            {marker}
          </span>
        </div>
      </div>
    </div>
  )
}

export function DevModeNote({ children }: { children: React.ReactNode }) {
  if (!import.meta.env.DEV) return null
  return (
    <div className="demo-alert mt-6 text-sm">
      <strong>Dev server:</strong> {children}
    </div>
  )
}
