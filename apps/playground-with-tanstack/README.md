Welcome to your new TanStack Start app!

# Getting Started

To run this application:

```bash
bun install
bun --bun run dev
```

## Better Auth (`/login`, `/signup`, `/account`)

Email/password auth via [Better Auth](https://www.better-auth.com), mounted on
Elysia at `/api/auth/*`. Better Auth uses the Drizzle adapter against the same
SQLite file as notes; its tables come from `db/auth.schema.ts` (Better Auth
CLI) and are applied by Drizzle migrations in `drizzle/`.

```bash
bun run auth:generate   # Better Auth CLI → db/auth.schema.ts
bun run db:generate     # drizzle-kit → drizzle/*.sql
```

| Path | Purpose |
| --- | --- |
| `/signup` | Create an account |
| `/login` | Sign in |
| `/account` | Session-guarded profile (redirects to `/login` when signed out) |
| `GET /api/me` | JSON session probe (401 without a cookie) |

Override `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` in the environment when the
app is not on `http://localhost:$PORT`.

# Building For Production

To build this application for production:

```bash
bun --bun run build
```

## Rendering modes (`/rendering`)

The header's **Rendering** menu holds one page per rendering strategy. Each runs
the same loader — it stamps the time and records where it ran — so the
difference between them is visible on a hard reload:

| Page              | Rendered            | Turned on by                                            |
| ----------------- | ------------------- | ------------------------------------------------------- |
| `/rendering/ssg`  | once, at build time | `pages: [{ path, prerender }]` in `vite.config.ts`       |
| `/rendering/ssr`  | per request, server | nothing — this is the default                            |
| `/rendering/spa`  | in the browser      | `ssr: false` in the route options                        |

Notes worth knowing:

- **SSG only exists in a production build.** `bun run dev` renders every page per
  request; prerendering runs at the end of `bun run build`, writing
  `dist/client/rendering/ssg/index.html`.
- `server.prod.ts` registers that file under its clean URL (`/rendering/ssg`), so
  the request is answered by Elysia's static route and never reaches the SSR
  handler.
- `crawlLinks` is off for the prerendered page — left on (the default), the
  prerenderer follows every `<a>` in the rendered HTML and statically generates
  the whole site.
- The demo routes set `staleTime: Infinity`; with the router's default of `0` the
  loader revalidates right after hydration and overwrites the server/build
  timestamp with a browser one.

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

### Removing Tailwind CSS

If you prefer not to use Tailwind CSS:

1. Remove the demo pages in `src/routes/demo/`
2. Replace the Tailwind import in `src/styles.css` with your own styles
3. Remove `tailwindcss()` from the plugins array in `vite.config.ts`
4. Remove `@tailwindcss/vite` and `tailwindcss` from `package.json`



## Routing

This project uses [TanStack Router](https://tanstack.com/router) with file-based routing. Routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from "@tanstack/react-router";
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you render `{children}` in the `shellComponent`.

Here is an example layout that includes a header:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My App' },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
```

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Server Functions

TanStack Start provides server functions that allow you to write server-side code that seamlessly integrates with your client components.

```tsx
import { createServerFn } from '@tanstack/react-start'

const getServerTime = createServerFn({
  method: 'GET',
}).handler(async () => {
  return new Date().toISOString()
})

// Use in a component
function MyComponent() {
  const [time, setTime] = useState('')
  
  useEffect(() => {
    getServerTime().then(setTime)
  }, [])
  
  return <div>Server time: {time}</div>
}
```

## API Routes

You can create API routes by using the `server` property in your route definitions:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: () => json({ message: 'Hello, World!' }),
    },
  },
})
```

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/people')({
  loader: async () => {
    const response = await fetch('https://swapi.dev/api/people')
    return response.json()
  },
  component: PeopleComponent,
})

function PeopleComponent() {
  const data = Route.useLoaderData()
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  )
}
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).


# Demo files

Files prefixed with `demo` can be safely deleted. They are there to provide a starting point for you to play around with the features you've installed.


# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

For TanStack Start specific documentation, visit [TanStack Start](https://tanstack.com/start).
