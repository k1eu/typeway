import { createFileRoute } from '@tanstack/react-router'
import { echoFn, uploadFn } from '../serverFn'

/**
 * The server-function invocation URLs are compiler-generated
 * (`/_serverFn/<functionId>`). We publish them in the SSR'd markup so the
 * fetch-level test suite can replicate a real client call without a browser.
 */
export const Route = createFileRoute('/serverfn')({
  component: ServerFnRoute,
})

function ServerFnRoute() {
  return (
    <div
      id="serverfn"
      data-echo-url={echoFn.url}
      data-upload-url={uploadFn.url}
    >
      E2E_SERVERFN
    </div>
  )
}
