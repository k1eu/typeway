import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({
      /**
       * SSG for the /rendering/ssg demo. At the end of the build TanStack runs
       * the freshly built SSR handler in-process, fetches these paths and
       * writes the HTML into the client output (`dist/client/<path>/index.html`).
       *
       * `crawlLinks` defaults to true, which would follow every <a> in the
       * rendered page — the header alone would drag the whole site into the
       * prerender. Off, so "static" stays exactly the page we asked for.
       */
      pages: [
        {
          path: '/rendering/ssg',
          prerender: { enabled: true, crawlLinks: false },
        },
      ],
    }),
    viteReact(),
  ],
})

export default config
