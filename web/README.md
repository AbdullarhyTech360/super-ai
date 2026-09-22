# Super-AI Web Frontend

The React single-page client for Super-AI: landing, authentication, and the chat experience. It talks to the FastAPI service in [`../api`](../api) and streams answers as they are generated.

Part of the [Super-AI monorepo](../README.md).

## Stack

- [Vite](https://vitejs.dev/) 5 with the React SWC plugin
- [React](https://react.dev/) 18 + TypeScript 5 (`strict` mode)
- [React Router](https://reactrouter.com/) v6 — `BrowserRouter` with a flat route table
- [shadcn/ui](https://ui.shadcn.com/) primitives on Radix UI, configured in `components.json`
- [Tailwind CSS](https://tailwindcss.com/) 3 with the design tokens in `src/index.css`
- [@tanstack/react-query](https://tanstack.com/query) 5 for server state and caching
- react-markdown with `remark-gfm`, `remark-math`, `rehype-katex`, `rehype-highlight`
- lucide-react icons, zod + react-hook-form for validation, sonner for toasts

This is a Vite SPA, not a Next.js app — there is no server-rendering or app router here.

## Requirements

- Node.js 20 or newer (CI uses 20; `Dockerfile` uses `node:22-alpine`)
- npm. `package-lock.json` is the lockfile used by CI and Docker; `bun.lockb` is present for local use with Bun.

## Getting Started

```bash
npm install
npm run dev
```

The dev server binds **port 8080** (`server.port` in `vite.config.ts`) on all interfaces, so the app is at http://localhost:8080.

The backend must be reachable and its origin must be allowed by that backend's `CORS_ORIGINS`. Point the client at it with `VITE_API_BASE_URL` in `.env.development` (already set to `http://localhost:8000`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR, on port 8080 |
| `npm run build` | Production bundle into `dist/` |
| `npm run build:seo` | Bundle, then prerender the public routes with `scripts/prerender.mjs` |
| `npm run build:dev` | Bundle in development mode (includes the Lovable component tagger) |
| `npm run preview` | Serve the built bundle locally |
| `npm run lint` | ESLint 9 flat config over the project |

`build:seo` drives a headless Chromium through `puppeteer-core` to emit static HTML for the indexable routes, so crawlers receive full markup. It needs a Chrome/Chromium binary available to `puppeteer-core`.

## Project Structure

```
web/
├── index.html              # SPA entry, base meta tags
├── vite.config.ts          # Port, @ alias, manual vendor/markdown/ui chunks
├── tailwind.config.ts      # Design tokens and animations
├── components.json         # shadcn/ui configuration
├── eslint.config.js        # Flat config, typescript-eslint
├── scripts/
│   ├── prerender.mjs       # Static route generation for build:seo
│   └── generate-favicon.mjs
├── public/                 # Served verbatim (logo, CNAME, og-image, sitemap, robots)
├── Designs/                # Mockups and DESIGN_SYSTEM.md — reference only, not shipped
└── src/
    ├── main.tsx            # Mounts <App />
    ├── App.tsx             # Providers and the route table
    ├── index.css           # CSS custom properties for light/dark themes
    ├── pages/              # One component per route
    ├── components/         # App components
    │   └── ui/             # Generated shadcn primitives — treat as vendored
    ├── hooks/              # useAuth, useTheme, use-mobile, use-toast
    ├── lib/                # api client, chatThemes, preferences, notifications, utils
    ├── seo/routes.ts       # Per-route metadata, canonical URLs, JSON-LD
    └── vite-env.d.ts       # Import-meta env typing
```

### Routes

Defined in `src/App.tsx`:

| Path | Page | Guard |
|---|---|---|
| `/` | `Landing` | — |
| `/login`, `/signup` | `Login`, `Signup` | — |
| `/forgot-password`, `/reset-password`, `/verify-email` | Recovery flow | — |
| `/chat` | `Chat` | `ProtectedRoute` |
| `/settings`, `/profile`, `/help` | Account screens | `ProtectedRoute` |
| `*` | `NotFound` | — |

`/chat`, `/settings`, `/profile`, and `/help` are not in `src/seo/routes.ts`, so they stay unindexed. Every route is wrapped in an `ErrorBoundary` keyed by pathname, so a render error in one page cannot blank the app.

## Working With the Code

- **Imports:** use the `@/` alias (mapped to `src/`) rather than long relative paths.
- **API calls:** go through `src/lib/api.ts`, which resolves `API_BASE_URL` from `import.meta.env.VITE_API_BASE_URL` and attaches the bearer token. Chat streaming is read incrementally from the NDJSON response body and can be aborted through an `AbortController`.
- **UI components:** prefer an existing primitive in `src/components/ui/`. Add new ones with the shadcn CLI instead of hand-rolling equivalents, and do not edit generated files beyond intentional local overrides — they will be overwritten on the next add.
- **Styling:** Tailwind utilities plus the CSS variables declared in `src/index.css`. Colour choices should work in light, dark, and system modes. Chat surface colours come from `src/lib/chatThemes.ts` (Default, Aurora, Sunset, Ocean, Midnight, Emerald, Blush, Mist).
- **Design reference:** `Designs/DESIGN_SYSTEM.md` and the mockups in `Designs/images/` describe the intended visual language.
- **Client state:** server data belongs in TanStack Query; cache keys and persisted identifiers come from `src/lib/preferences.ts`. Reuse those constants instead of inventing string keys.
- **Upload limits:** the composer enforces the same ceilings the API does — 25 MB per file and 8 files per message — and toasts what it dropped. Keep the two in sync (`MAX_FILES_PER_MESSAGE` here, `CHAT_MAX_FILES` on the server).

## Environment

| File | Used by | Contents |
|---|---|---|
| `.env.development` | `npm run dev`, `build:dev` | `VITE_API_BASE_URL=http://localhost:8000` |
| `.env.production` | `npm run build` | `VITE_API_BASE_URL` pointing at the deployed API |

Only variables prefixed `VITE_` reach the bundle. Never put a secret in a `VITE_*` variable — it is public.

## Docker

```bash
docker build -t super-ai-web .
docker run -p 5173:5173 super-ai-web
```

The image runs the **dev server** on port 5173 and is intended for Compose-based development (`docker-compose up frontend` at the repository root), not for production hosting. `.dockerignore` keeps `node_modules` and `dist` out of the image.

## Deployment

`.github/workflows/deploy-web.yml` builds on pushes that touch `web/**` on `main`, runs `npm run build:seo`, and publishes `dist/` to the `gh-pages` branch. `public/CNAME` carries the custom domain.

Because the build is served from a domain root, `vite.config.ts` does not set a `base` path. Deploying to a project subpath such as `user.github.io/repo/` would require setting `base` there as well.

## Lint and Types

`npm run lint` covers ESLint with `typescript-eslint`, the react-hooks and react-refresh plugins. TypeScript is configured through `tsconfig.app.json` and `tsconfig.node.json`; `vite build` performs no type-check on its own, so run `npx tsc --noEmit -p tsconfig.app.json` when you want that explicitly.
