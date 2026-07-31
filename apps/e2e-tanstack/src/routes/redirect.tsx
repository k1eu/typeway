import { createFileRoute, redirect } from '@tanstack/react-router'

// Feature: loader-thrown redirect surfaces as a real 302 + Location.
export const Route = createFileRoute('/redirect')({
  loader: () => {
    throw redirect({ to: '/', statusCode: 302 })
  },
  component: () => <div id="redirect">E2E_REDIRECT_UNREACHABLE</div>,
})
