import { createFileRoute } from '@tanstack/react-router'
import { RenderProbePanel, probe } from '../../components/RenderProbe'

/**
 * SPA — client-only rendering for this route.
 *
 * `ssr: false` is per route: the rest of the app keeps server rendering, but
 * this route's loader and component are skipped on the server. The response
 * still comes from the SSR handler — it just contains the shell plus a
 * placeholder where this page will mount.
 */
export const Route = createFileRoute('/rendering/spa')({
  ssr: false,
  loader: () => probe(),
  component: SpaPage,
})

function SpaPage() {
  const loaderProbe = Route.useLoaderData()

  return (
    <section className="island-shell mt-6 rounded-2xl p-6 sm:p-8">
      <p className="island-kicker mb-2">SPA · client only</p>
      <h1 className="display-title mb-3 text-3xl font-bold text-[var(--sea-ink)] sm:text-4xl">
        Rendered in the browser.
      </h1>
      <p className="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
        One route option opts this page out of server rendering. The loader
        never runs on the server, so it can safely touch browser-only APIs — and
        nothing below this heading exists in the HTML the server sent.
      </p>

      <pre className="demo-code-block mt-4 overflow-x-auto text-xs">
        <code>{`export const Route = createFileRoute('/rendering/spa')({
  ssr: false,
  loader: () => probe(),
  component: SpaPage,
})`}</code>
      </pre>

      <RenderProbePanel
        loaderProbe={loaderProbe}
        expectation="The loader always reports the browser, and its timestamp lands after the page has already painted the shell."
        marker="spa-content-in-browser-only"
      />

      <p className="m-0 mt-4 text-sm text-[var(--sea-ink-soft)]">
        Try <code>curl -s localhost:3000/rendering/spa | grep spa-content</code>{' '}
        — no match, while the same grep against the SSG and SSR pages hits.
      </p>
    </section>
  )
}
