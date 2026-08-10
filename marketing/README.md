# marketing/

The Typeway "coming soon" page. One self-contained `index.html` — no build step, no
dependencies, no framework. Fonts come from Google Fonts with local fallbacks, so the
page renders fine offline too.

## Themes

Four themes ship in the file. Pick one by editing the `data-theme` attribute on `<html>`:

| `data-theme` | Look |
| --- | --- |
| `slate` | Monochrome dark. No chroma at all — white accent, highlight made by dimming the surrounding text. The default. |
| `terminal` | Black with a phosphor-green accent. Leans into the CLI identity. |
| `paper` | Warm light editorial. Ink text, rust accent, dark code cards for contrast. |
| `ember` | Warm dark with an orange accent. |

Every colour decision lives in the `[data-theme="…"]` blocks at the top of the stylesheet;
nothing below them hardcodes a colour. A new theme is one more variable set — no markup
changes, no duplicated file.

To compare them, add `?themes` to the URL for a floating switcher, or `?theme=paper` to
load one directly. The switcher only renders with `?themes` present, so the deployed page
shows nothing but the chosen theme.

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

The stats row and the roadmap pills reflect real repo state:

- `0.985x` / `1.010x` come from `bench/README.md` (paired A/B runs, Apple M1 Max).
- **Shipped** items run and are covered by `bun test`, `test:integration` and
  `test:e2e-tanstack`.
- **Building** items exist as prototypes in `apps/playground-with-tanstack`.
- **Planned** items are the umbrella list in the root `README.md`.

When those change, update this page in the same commit.
