import { createFileRoute } from '@tanstack/react-router'
import {
  DevModeNote,
  RenderProbePanel,
  probe,
} from '../../components/RenderProbe'

/**
 * SSG — prerendered at build time.
 *
 * The route itself is ordinary; what makes it static is the `pages` entry in
 * `vite.config.ts`. After `bun run build` this page exists as
 * `dist/client/rendering/ssg/index.html`, and `server.prod.ts` serves that file
 * directly, so the loader timestamp below is frozen at build time.
 */
export const Route = createFileRoute('/rendering/ssg')({
  loader: () => probe(),
  // Without this the router would revalidate on hydration and overwrite the
  // build-time timestamp with a browser one — see the note in ssr.tsx.
  staleTime: Infinity,
  component: SsgPage,
})

function SsgPage() {
  const loaderProbe = Route.useLoaderData()

  return (
    <>
      <section className="island-shell mt-6 rounded-2xl p-6 sm:p-8">
        <p className="island-kicker mb-2">SSG · prerendered</p>
        <h1 className="display-title mb-3 text-3xl font-bold text-[var(--sea-ink)] sm:text-4xl">
          Rendered once, at build time.
        </h1>
        <p className="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          TanStack Start prerenders this path during the build by running the
          real SSR handler in-process and writing the resulting HTML to the
          client output directory.
        </p>

        <pre className="demo-code-block mt-4 overflow-x-auto text-xs">
          <code>{`// vite.config.ts
tanstackStart({
  pages: [
    { path: '/rendering/ssg', prerender: { enabled: true, crawlLinks: false } },
  ],
})`}</code>
        </pre>

        <RenderProbePanel
          loaderProbe={loaderProbe}
          expectation="In production the loader timestamp never changes, no matter how many times you reload — it is the moment the build ran."
          marker="ssg-content-in-html"
        />

        <p className="m-0 mt-4 text-sm text-[var(--sea-ink-soft)]">
          Arriving here through the tabs above is a client-side navigation: the
          router runs the loader in the browser and never fetches the static
          file, so the timestamp is live. Prerendering only shows up on a full
          page load, which is also all a crawler ever does.
        </p>

        <DevModeNote>
          prerendering is a build step, so right now this page is rendered per
          request just like the SSR one. Run <code>bun run build</code> then{' '}
          <code>bun run start</code> to see the timestamp freeze.
        </DevModeNote>
      </section>
    </>
  )
}
