import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '../../lib/api'

export const Route = createFileRoute('/notes/new')({
  component: NoteNew,
})

function NoteNew() {
  const navigate = useNavigate()
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)

  return (
    <main className="page-wrap px-4 pb-10 pt-10">
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <p>
          <Link to="/notes" className="text-sm font-semibold text-[var(--lagoon-deep)]">
            ← Shared notes
          </Link>
        </p>
        <h1 className="display-title mt-3 text-3xl font-bold text-[var(--sea-ink)]">
          New note
        </h1>
        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!body.trim()) return
            setPending(true)
            try {
              const { data, error } = await api().api.notes.post({
                body: body.trim(),
              })
              if (error) throw error
              await navigate({
                to: '/notes/$id',
                params: { id: String(data.id) },
              })
            } finally {
              setPending(false)
            }
          }}
        >
          <textarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-32 rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-[var(--sea-ink)]"
          />
          <button type="submit" disabled={pending} className="demo-button disabled:opacity-60">
            {pending ? 'Saving…' : 'Create'}
          </button>
        </form>
      </section>
    </main>
  )
}
