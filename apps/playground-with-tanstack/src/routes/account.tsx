import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '../data/session'
import { signOut } from '../lib/auth-client'

export const Route = createFileRoute('/account')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({
        to: '/login',
        search: { redirect: '/account' },
      })
    }
    return { session }
  },
  component: AccountPage,
})

function AccountPage() {
  const { session } = Route.useRouteContext()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)

  return (
    <main className="page-wrap px-4 pb-10 pt-10">
      <section className="island-shell mx-auto max-w-lg rounded-2xl p-6 sm:p-8">
        <p className="island-kicker mb-2">Better Auth</p>
        <h1 className="display-title mb-2 text-3xl font-bold text-[var(--sea-ink)]">
          Your account
        </h1>
        <p className="m-0 mb-6 text-sm text-[var(--sea-ink-soft)]">
          This page is guarded in{' '}
          <code className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5">
            beforeLoad
          </code>{' '}
          with{' '}
          <code className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5">
            auth.api.getSession
          </code>
          .
        </p>

        <dl className="m-0 grid gap-3 border-t border-[var(--line)] pt-5 text-sm">
          <div>
            <dt className="font-semibold text-[var(--sea-ink)]">Name</dt>
            <dd className="m-0 text-[var(--sea-ink-soft)]" data-testid="user-name">
              {session.user.name}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--sea-ink)]">Email</dt>
            <dd
              className="m-0 text-[var(--sea-ink-soft)]"
              data-testid="user-email"
            >
              {session.user.email}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--sea-ink)]">User id</dt>
            <dd className="m-0 break-all font-mono text-xs text-[var(--sea-ink-soft)]">
              {session.user.id}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            className="demo-button demo-button-danger"
            onClick={async () => {
              setPending(true)
              try {
                await signOut()
                await navigate({
                  to: '/login',
                  search: { redirect: '/account' },
                })
              } finally {
                setPending(false)
              }
            }}
          >
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
          <Link to="/" className="demo-button demo-button-secondary no-underline">
            Home
          </Link>
        </div>
      </section>
    </main>
  )
}
