import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { setCookie, setResponseHeader } from '@tanstack/react-start/server'

// Feature: two Set-Cookie headers must survive as two separate headers
// (guards comma-joining regressions in the bridge's header handling).
const stampCookies = createServerFn({ method: 'GET' }).handler(() => {
  setCookie('e2e_first', 'alpha', { path: '/', httpOnly: true })
  setCookie('e2e_second', 'beta', { path: '/', sameSite: 'lax' })
  setResponseHeader('x-e2e-custom', 'custom-header-value')
  return 'COOKIES_SET'
})

export const Route = createFileRoute('/cookies')({
  loader: () => stampCookies(),
  component: Cookies,
})

function Cookies() {
  return <div id="cookies">{Route.useLoaderData()}</div>
}
