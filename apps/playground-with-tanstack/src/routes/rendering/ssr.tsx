import { createFileRoute } from '@tanstack/react-router'
import { RenderProbePanel, probe } from '../../components/RenderProbe'

/**
 * SSR — the default. No route option turns this on.
 *
 * The document is rendered (and streamed) by the TanStack handler on every
 * request: in dev through Vite's SSR module runner behind `@typeway/connect`,
 * in prod through the built handler `.mount()`ed on Elysia.
 */
export const Route = createFileRoute('/rendering/ssr')({
  loader: () => probe(),
  // The router's default staleTime is 0, so it revalidates the moment it
  // hydrates — which would immediately replace the server's timestamp with a
  // browser one and make this page look identical to the SPA route. Keeping
  // the data fresh forever means what you see is what the server sent.
  staleTime: Infinity,
  component: SsrPage,
})

function SsrPage() {
  const loaderProbe = Route.useLoaderData()

  return (
    <section className="island-shell mt-6 rounded-2xl p-6 sm:p-8">
      <p className="island-kicker mb-2">SSR · per request</p>
      <h1 className="display-title mb-3 text-3xl font-bold text-[var(--sea-ink)] sm:text-4xl">
        Rendered on the server, every time.
      </h1>
      <p className="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
        The loader runs on the server for the initial request, React renders to
        the streamed response, and the browser hydrates what it received. On a
        client-side navigation (say, from the tabs above) the same loader runs
        in the browser instead — which is why the origin line changes depending
        on how you arrived here.
      </p>

      <RenderProbePanel
        loaderProbe={loaderProbe}
        expectation="Every hard reload produces a new loader timestamp, a few milliseconds before hydration."
        marker="ssr-content-in-html"
      />
    </section>
  )
}
