import { Link, createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '../../lib/api'

export const Route = createFileRoute('/notes/$id/edit')({
  loader: async ({ params }) => {
    const { data, error } = await api().api.notes({ id: Number(params.id) }).get()
    if (error?.status === 404) throw notFound()
    if (error) throw error
    return data
  },
  component: NoteEdit,
})

function NoteEdit() {
  const note = Route.useLoaderData()
  const navigate = useNavigate()
  const [body, setBody] = useState(note.body)
  const [pending, setPending] = useState(false)

  return (
    <main className="page-wrap px-4 pb-10 pt-10">
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <p>
          <Link
            to="/notes/$id"
            params={{ id: String(note.id) }}
            className="text-sm font-semibold text-[var(--lagoon-deep)]"
          >
            ← Note {note.id}
          </Link>
        </p>
        <h1 className="display-title mt-3 text-3xl font-bold text-[var(--sea-ink)]">
          Edit note
        </h1>
        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!body.trim()) return
            setPending(true)
            try {
              const { error } = await api().api.notes({ id: note.id }).patch({
                body: body.trim(),
              })
              if (error) throw error
              await navigate({
                to: '/notes/$id',
                params: { id: String(note.id) },
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
            {pending ? 'Saving…' : 'Save'}
          </button>
        </form>
      </section>
    </main>
  )
}
