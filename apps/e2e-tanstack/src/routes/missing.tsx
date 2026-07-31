import { createFileRoute, notFound } from '@tanstack/react-router'

// Feature: notFound() from a loader must produce a 404 status on the wire.
export const Route = createFileRoute('/missing')({
  loader: () => {
    throw notFound()
  },
  component: () => <div id="missing">E2E_MISSING_UNREACHABLE</div>,
})
