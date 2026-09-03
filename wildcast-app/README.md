# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Create a `.env.local` file in this project's root (`wildcast-app/`) with:

```
VERCEL_OIDC_TOKEN=...
WILDCAST_KEYS=...
BLOB_READ_WRITE_TOKEN=...
```

Get these values from the Vercel project settings (Environment Variables tab), or from whoever on the team holds access.

Once the app is running, use the following activation key to log in:

```
WILD-Demo-KEY
```

### 3. Run the dev server

This project has a frontend (Vite) plus serverless functions in [api/](api/) (used for features like save/load project, publish template, export CMYK, etc). There are two ways to run it:

**Option A — frontend only** (features that call `/api/*` won't work):

```bash
npm run dev
```

**Option B — full stack, including API routes** (recommended):

```bash
npx vercel dev
```

The Vercel CLI runs the Vite dev server while also emulating the `api/` serverless functions locally, using the env variables from `.env.local`.

### Other commands

```bash
npm run build    # build for production into dist/
npm run preview  # preview the production build locally
npm run lint     # run ESLint
```

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.


