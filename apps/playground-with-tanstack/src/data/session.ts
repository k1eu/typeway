import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '../../server/auth'

/** Current session from the request cookie — used by loaders / beforeLoad. */
export const getSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await auth.api.getSession({
      headers: getRequestHeaders(),
    })
    return session
  },
)
