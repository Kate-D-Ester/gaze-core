# Frontend Monorepo

This is a Bun workspaces monorepo with a Vite app and a shared UI package.

## Workspace Commands

Run these from [frontend/package.json](frontend/package.json):

```bash
bun run dev
bun run build
bun run lint
bun run typecheck
```

## Adding Components

To add components to your app, run the following command at the root of your web app:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

This will place the ui components in the `packages/ui/src/components` directory.

## Using components

To use the components in your app, import them from the `ui` package.

```tsx
import { Button } from "@workspace/ui/components/button";
```
