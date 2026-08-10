import { createFileRoute } from '@tanstack/react-router'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { listNotes } from '../../data/notes'
import { createNote } from '../../mutations/notes'

export const Route = createFileRoute('/notes/')({
  loader: () => listNotes(),
  component: NotesPage,
})

function NotesPage() {
  const notes = Route.useLoaderData()
  const router = useRouter()
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)

  return (
    <main className="page-wrap px-4 pb-10 pt-10">
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <p className="island-kicker mb-2">ALS + SQLite demo</p>
        <h1 className="display-title mb-3 text-3xl font-bold text-[var(--sea-ink)] sm:text-4xl">
          Shared notes
        </h1>
        <p className="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          Notes live in SQLite. The fetch wrapper enters{' '}
          <code className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5 text-sm">
            AsyncLocalStorage
          </code>{' '}
          once per request, so this loader,{' '}
          <code className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5 text-sm">
            POST /api/notes
          </code>
          , and the create mutation below all call{' '}
          <code className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5 text-sm">
            getDb()
          </code>{' '}
          without passing a connection around.
        </p>

        <ul
          id="notes-list"
          className="mt-6 space-y-3 border-t border-[var(--line)] pt-6"
        >
          {notes.map((note) => (
            <li
              key={note.id}
              className="demo-card text-[var(--sea-ink)]"
              data-note-id={note.id}
            >
              {note.body}
            </li>
          ))}
        </ul>

        <form
          className="mt-6 flex flex-col gap-3 sm:flex-row"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!draft.trim()) return
            setPending(true)
            try {
              await createNote({ data: { body: draft.trim() } })
              setDraft('')
              await router.invalidate()
            } finally {
              setPending(false)
            }
          }}
        >
          <input
            name="body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a note via TanStack server fn…"
            className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-[var(--sea-ink)]"
          />
          <button
            type="submit"
            disabled={pending}
            className="demo-button disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Add note'}
          </button>
        </form>
      </section>
    </main>
  )
}
