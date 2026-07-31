import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

// Deliberately minimal: no tailwind, no devtools. Fixtures exercise the
// HTTP protocol surface that crosses @typeway/connect, not the UI.
export default defineConfig({
  plugins: [tanstackStart(), viteReact()],
})
