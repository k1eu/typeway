# marketing/

The Typeway "coming soon" page. One self-contained `index.html` — no build step, no
dependencies, no framework. Fonts come from Google Fonts with local fallbacks, so the
page renders fine offline too.

## What's on the page

1. **A generated Typeway app, open in an editor.** The file rail is the conventions; the
   tabs are the same project read five ways — `README.md` for people, `AGENTS.md` and
   `llms.txt` for the things writing code beside them, `src/server.ts` for the compiler,
   and a live terminal that types out `typeway new`, `generate model` and `dev`. The
   terminal starts on first open and has a replay button. Tabs respond to <kbd>1</kbd>–<kbd>5</kbd>.
2. **Roadmap, written as a build log.** Real dates and commit hashes, newest first,
   filterable by shipped / fixed / building / planned, with everything unstarted at the
   bottom.
3. **The ask** — one email field.

## Concepts

`concepts/` holds the alternatives this page was chosen from. They are different
arguments, not restyles; `concepts/index.html` lays them out side by side.

| File | Concept |
| --- | --- |
| `concepts/workspace.html` | **Workspace** — the one that won, before the terminal tab and roadmap section were merged in. |
| `concepts/product.html` | **Product page.** Hero, animated CLI terminal, proof stats, stack cards, roadmap grid. Carries a four-theme system (`slate`, `terminal`, `paper`, `ember`) driven by `[data-theme]` variable blocks; `?themes` adds a live switcher. |
| `concepts/manifesto.html` | **Manifesto.** Bone paper and ink, five numbered statements at poster scale, benchmark figures as display type. |
| `concepts/buildlog.html` | **Build log.** The standalone version of what is now the roadmap section. |

Each file is standalone. To ship a different one, copy it over `index.html`; nothing else
moves. They all share the email-capture behaviour below, so `NOTIFY_ENDPOINT` has to be
set in whichever file you promote.

## Preview locally

```sh
bunx serve marketing        # or: python3 -m http.server -d marketing 8080
open http://localhost:3000
```

## Deploy

Any static host works, because the whole site is one file:

- **Cloudflare Pages / Netlify / Vercel** — point the project at this directory, leave
  the build command empty and set the output directory to `marketing`.
- **GitHub Pages** — publish this directory (or copy `index.html` to the Pages root).
- **A bucket** — `aws s3 cp marketing/index.html s3://<bucket>/index.html`.

## Collecting emails

The signup form is inert by default: with no backend configured it tells visitors to
watch the repo instead of pretending to have stored their address. To turn it on, set
`NOTIFY_ENDPOINT` near the top of the inline `<script>` to any URL that accepts
`POST {"email": "..."}` as JSON — Formspree, Buttondown, a Typeway route, whatever.

## Keeping it honest

Everything on the page reflects real repo state:

- Benchmark ratios come from `bench/README.md` (paired A/B runs, Apple M1 Max).
- **Shipped** entries and their dates come from the git history and are covered by
  `bun test`, `test:integration` and `test:e2e-tanstack`.
- **Building** entries exist as prototypes in `apps/playground-with-tanstack`.
- **Planned** entries are the umbrella list in the root `README.md`.

The `AGENTS.md` and `llms.txt` tabs describe conventions that are still being built, so
they are aspirational by design — keep them in step with the real generators once those
land. When any of this changes, update the page in the same commit.
