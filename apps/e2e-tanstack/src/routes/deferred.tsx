import { Await, createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

// Feature: streaming SSR. The loader returns an unawaited promise; the shell
// must reach the client before the promise resolves ~300ms later.
export const Route = createFileRoute('/deferred')({
  loader: () => ({
    slow: new Promise<string>((resolve) =>
      setTimeout(() => resolve('DEFERRED_DATA'), 300),
    ),
  }),
  component: Deferred,
})

function Deferred() {
  const { slow } = Route.useLoaderData()

  return (
    <div id="deferred">
      <div id="deferred-shell">DEFERRED_SHELL</div>
      <Suspense fallback={<div id="deferred-pending">DEFERRED_PENDING</div>}>
        <Await promise={slow}>
          {(value) => <div id="deferred-value">{value}</div>}
        </Await>
      </Suspense>
    </div>
  )
}
