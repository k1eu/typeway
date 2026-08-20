import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { signUp } from '../lib/auth-client'

export const Route = createFileRoute('/signup')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect:
      typeof search.redirect === 'string' && search.redirect.startsWith('/')
        ? search.redirect
        : '/account',
  }),
  component: SignupPage,
})

function SignupPage() {
  const { redirect } = Route.useSearch()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  return (
    <main className="page-wrap px-4 pb-10 pt-10">
      <section className="island-shell mx-auto max-w-md rounded-2xl p-6 sm:p-8">
        <p className="island-kicker mb-2">Better Auth</p>
        <h1 className="display-title mb-2 text-3xl font-bold text-[var(--sea-ink)]">
          Create account
        </h1>
        <p className="m-0 mb-6 text-sm text-[var(--sea-ink-soft)]">
          Registers a credential account in SQLite through Better Auth&apos;s
          email/password endpoints.
        </p>

        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            setError(null)
            setPending(true)
            try {
              const { error: signUpError } = await signUp.email({
                name,
                email,
                password,
              })
              if (signUpError) {
                setError(signUpError.message ?? 'Sign up failed')
                return
              }
              await navigate({ to: redirect })
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Sign up failed')
            } finally {
              setPending(false)
            }
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--sea-ink)]">
            Name
            <input
              type="text"
              name="name"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 font-normal text-[var(--sea-ink)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--sea-ink)]">
            Email
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 font-normal text-[var(--sea-ink)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--sea-ink)]">
            Password
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 font-normal text-[var(--sea-ink)]"
            />
          </label>

          {error ? (
            <p
              role="alert"
              className="m-0 rounded-xl border border-[rgba(180,60,60,0.35)] bg-[rgba(180,60,60,0.08)] px-3 py-2 text-sm text-[var(--sea-ink)]"
            >
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={pending} className="demo-button">
            {pending ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 mb-0 text-sm text-[var(--sea-ink-soft)]">
          Already registered?{' '}
          <Link
            to="/login"
            search={{ redirect }}
            className="font-semibold text-[var(--lagoon-deep)]"
          >
            Sign in
          </Link>
        </p>
      </section>
    </main>
  )
}
