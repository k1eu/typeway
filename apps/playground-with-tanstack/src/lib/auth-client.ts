import { createAuthClient } from "better-auth/react"

/**
 * Browser client for Better Auth. Same-origin `/api/auth/*` via Elysia —
 * no baseURL needed when the UI and API share a host.
 */
export const authClient = createAuthClient()

export const { signIn, signUp, signOut, useSession } = authClient
