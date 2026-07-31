import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'typeway e2e fixture' },
    ],
  }),
  notFoundComponent: () => <div id="not-found">E2E_NOT_FOUND</div>,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="e2e-root">E2E_ROOT</div>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
