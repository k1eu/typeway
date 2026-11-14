import { Link, createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { api } from '../../lib/api'

export const Route = createFileRoute('/notes/$id')({
  loader: async ({ params }) => {
    const { data, error } = await api().api.notes({ id: Number(params.id) }).get()
    if (error?.status === 404) throw notFound()
    if (error) throw error
    return data
  },
  component: NoteShow,
})

function NoteShow() {
  const note = Route.useLoaderData()
  const navigate = useNavigate()

  return (
    <main className="page-wrap px-4 pb-10 pt-10">
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <p>
          <Link to="/notes" className="text-sm font-semibold text-[var(--lagoon-deep)]">
            ← Shared notes
          </Link>
        </p>
        <h1 className="display-title mt-3 text-3xl font-bold text-[var(--sea-ink)]">
          Note {note.id}
        </h1>
        <p className="mt-4 text-base leading-8 text-[var(--sea-ink)]">{note.body}</p>
        <p className="mt-6 flex gap-3">
          <Link
            to="/notes/$id/edit"
            params={{ id: String(note.id) }}
            className="demo-button no-underline"
          >
            Edit
          </Link>
          <button
            type="button"
            className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold"
            onClick={async () => {
              const { error } = await api().api.notes({ id: note.id }).delete()
              if (error) throw error
              await navigate({ to: '/notes' })
            }}
          >
            Delete
          </button>
        </p>
      </section>
    </main>
  )
}
