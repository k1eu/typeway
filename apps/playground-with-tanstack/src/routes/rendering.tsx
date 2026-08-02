import { Link, Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/rendering')({
  component: RenderingLayout,
})

const TABS = [
  { to: '/rendering/ssg', label: 'SSG' },
  { to: '/rendering/ssr', label: 'SSR' },
  { to: '/rendering/spa', label: 'SPA' },
] as const

function RenderingLayout() {
  return (
    <main className="page-wrap px-4 py-10">
      <nav className="island-shell flex flex-wrap items-center gap-x-5 gap-y-2 rounded-full px-5 py-3 text-sm font-semibold">
        <Link
          to="/rendering"
          activeOptions={{ exact: true }}
          className="nav-link"
          activeProps={{ className: 'nav-link is-active' }}
        >
          Overview
        </Link>
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Outlet />
    </main>
  )
}
