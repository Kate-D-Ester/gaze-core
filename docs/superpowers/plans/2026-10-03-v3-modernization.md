# V3 modernization implementation plan

**Goal:** Preserve the screen, remote, and scene trackers while replacing Vite routing with stable Next.js, migrating handwritten styles to Tailwind utilities, removing duplication, and making code readable and modular.

**Authority:** The user's October 3 request authorizes implementation without additional approval, the v2 checkpoint commit, creation of v3 in the current checkout, deletion of obsolete code, and leaving v3 source changes uncommitted. No push or worktree.

**Architecture:** Use explicit Next.js App Router pages, client boundaries for browser camera/worker pipelines, and a shared account controller for auth/dashboard. Keep backend auth/API routes and the independent Python vision assistant. Camera transport is local development tooling, never a server-side tracking engine. Shared UI and numerical helpers have clear responsibilities; distinct tracker algorithms stay distinct.

**Versions:** Next.js 16.3.8, confirmed against the official September 30 security release and npm latest tag. Pin stable package versions. Keep Bun tooling and port 4001.

## Constraints
- No pupil algorithm changes without a demonstrated defect and regression coverage.
- No secrets or environment files in source control; existing ignored environment files remain local.
- No custom CSS selectors or handwritten CSS rules. Tailwind entry directives/theme tokens are configuration; computed canvas/gaze coordinates may use runtime style values.
- Every declared or structural application type belongs in a matching .types.ts module. Type imports/annotations in implementation files remain necessary TypeScript.
- No nested ternaries, comma-packed declarations, or single-line control-flow bodies.
- No v3 commits or pushes. Preserve the v2 checkpoint as rollback.

## Tasks
1. **Checkpoint and audit** — verify v2 tests/security, commit, create v3; inventory duplication, routing, CSS, Python isolation, workers and auth. Write audit findings and resolutions in docs/v3-codebase-audit.md.
2. **Next.js application** — replace Vite/App/React Router with explicit app routes and client boundaries; preserve OAuth, callback URLs, port 4001, browser workers and local model assets; remove obsolete configuration/dependencies. Verify production build, route responses, auth/public boundaries, worker loading and camera lifecycle.
3. **Tailwind UI** — convert tracking component/page styles to static Tailwind utilities and reusable primitives; retain current dark/sea-green appearance, responsive layouts, canvas geometry, tooltips, calibration animations and source/calibration persistence. Verify screenshots at desktop/mobile and component regressions.
4. **Type/readability/shared-code cleanup** — extract named and inline object types to mirror modules; eliminate nested ternaries and packed control flow; share only behaviorally equivalent implementations. Keep numerical algorithms unchanged. Enforce rules through lint/source checks; run numerical and lifecycle tests.
5. **Backend and legacy cleanup** — keep auth/API routes, isolate Python; remove unused duplicate packages/runtime paths only after proving no consumers. Verify backend tests, typecheck and dependency/security review.
6. **Integration and report** — update tests/tooling/docs to Next, run all regression suites, lint/typecheck/build and secret scans; verify UI and production routes; document exact outcomes and remaining real-world validation limits.

## Review focus
- Client-only camera APIs and workers must never execute while server rendering.
- OAuth callbacks, account routing and local origin/port assumptions must be preserved.
- Tailwind must discover static variants; canvases retain coordinates and fixed calibration geometry.
- Extracted type imports must not create runtime cycles or pull browser dependencies into workers/server.
- Missing devices, blocked storage, camera loss and saved scene profiles retain existing recovery behavior.

## Progress
- Task 1: v2 checkpoint c1d817b; 620 frontend tests, lint/types/build passed. Gitleaks history (53 commits) and 417 current text files: no findings. 71 added/modified staged files: no files >1 MB, no env/dependencies/build outputs. Created v3 in place.
- Tasks 2–5: implemented; Next routing/client boundaries, standalone hosting, Tailwind migration, shared components/types/readability lint, auth security fixes and unused legacy runtime removal are complete.
- Task 6: full regression/build/lint/typecheck and browser worker checks passed. Independent review found a runtime environment precedence issue; fixed and compiled-output verification included in the final gate. Final report: docs/v3-codebase-audit.md. Real hardware/mobile/OAuth acceptance limits are explicit there.
