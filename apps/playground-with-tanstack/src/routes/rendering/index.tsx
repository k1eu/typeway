import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/rendering/')({
  component: RenderingOverview,
})

const MODES = [
  {
    to: '/rendering/ssg',
    label: 'SSG',
    title: 'Static generation',
    when: 'HTML produced once, at build time',
    how: 'vite.config.ts → tanstackStart({ pages: [{ path, prerender }] })',
    blurb:
      'The page is rendered during `bun run build` and written to disk as dist/client/rendering/ssg/index.html. At runtime nobody renders anything — Elysia serves the file.',
  },
  {
    to: '/rendering/ssr',
    label: 'SSR',
    title: 'Server rendering',
    when: 'HTML produced per request, on the server',
    how: 'the default — no route option needed',
    blurb:
      'Every request runs the loader and React on the server, streams the document, and the client hydrates it. This is what all the other routes in this app do.',
  },
  {
    to: '/rendering/spa',
    label: 'SPA',
    title: 'Client rendering',
    when: 'HTML produced in the browser, after load',
    how: 'ssr: false in the route options',
    blurb:
      'The server sends the shell without this route’s markup; the loader and the component both run in the browser. Useful for anything that cannot run server-side.',
  },
] as const

function RenderingOverview() {
  return (
    <>
      <section className="island-shell mt-6 rounded-2xl p-6 sm:p-8">
        <p className="island-kicker mb-2">Rendering modes</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Same app, three ways to make HTML.
        </h1>
        <p className="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          Each page below runs the same probe — a loader that stamps the time
          and records where it ran. What differs is <em>when</em> that happens.
          Hard-reload each page a couple of times and watch the timestamps.
        </p>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        {MODES.map((mode) => (
          <Link
            key={mode.to}
            to={mode.to}
            className="island-shell feature-card rounded-2xl p-5 no-underline"
          >
            <p className="island-kicker mb-2">{mode.label}</p>
            <h2 className="mb-1 text-lg font-semibold text-[var(--sea-ink)]">
              {mode.title}
            </h2>
            <p className="m-0 mb-3 text-sm text-[var(--sea-ink-soft)]">
              {mode.when}
            </p>
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
              {mode.blurb}
            </p>
            <p className="m-0 mt-3 text-xs text-[var(--sea-ink-soft)]">
              <code>{mode.how}</code>
            </p>
          </Link>
        ))}
      </section>

      <section className="island-shell mt-6 rounded-2xl p-6">
        <p className="island-kicker mb-2">Reading the difference</p>
        <ul className="m-0 list-disc space-y-2 pl-5 text-sm text-[var(--sea-ink-soft)]">
          <li>
            <code>curl -s localhost:3000/rendering/&lt;mode&gt;</code> — the SSG
            and SSR pages ship their content in the HTML; the SPA page does not.
          </li>
          <li>
            Only the production build makes SSG real. Under{' '}
            <code>bun run dev</code> everything is rendered per request, because
            prerendering is a build step.
          </li>
          <li>
            In production the SSG page never reaches the SSR handler at all —{' '}
            <code>server.prod.ts</code> registers the prerendered file as a
            static Elysia route.
          </li>
        </ul>
      </section>
    </>
  )
}
