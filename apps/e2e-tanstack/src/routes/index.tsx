import { createFileRoute } from '@tanstack/react-router'

// Feature: plain SSR.
export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return <div id="index">E2E_INDEX</div>
}
