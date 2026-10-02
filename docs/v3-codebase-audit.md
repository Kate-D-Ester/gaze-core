# V3 modernization and codebase audit

Reviewed on October 3, 2026. The v2 checkpoint is `c1d817b` (`feat: stabilize calibration and persist local camera preferences`). This report accompanies the v3 modernization checkpoint in the original checkout. Nothing was pushed and no worktree was created.

## Framework and application boundaries

The frontend now uses Next.js **16.3.8**, React **19.3.0**, Tailwind CSS **4.3.3**, and Bun. Next 16 is the active LTS line, and 16.3.8 includes the September security fixes. Versions were checked against the [official support policy](https://nextjs.org/support-policy), [September security release](https://nextjs.org/blog/september-2026-security-release), and package registry. The implementation follows the [official migration guidance](https://nextjs.org/docs/app/guides/migrating/from-vite).

Explicit App Router pages serve screen, remote and scene tracking. Browser-only workspaces are loaded through `next/dynamic` with SSR disabled; camera, canvas, worker and inference code runs on the client. The dashboard/auth routes use a shared account controller. Legacy trial links redirect to their corresponding current routes.

Webpack is selected explicitly for development and production. The existing workers depend on native dynamic WASM-loader imports and split worker chunks; emitted worker constructors and actual browser execution were verified. Head model/runtime assets are now served locally instead of fetched from remote CDNs. Remote MediaPipe 1.0.1 and head/hand MediaPipe 0.10.32 remain separate pinned runtimes because their loader/WASM APIs differ.

Development retains port **4001** and starts/reuses the local camera transport on **4022**. That transport only connects local network cameras; it performs no eye tracking and is separate from the auth backend. USB tracking is independent of it. Trusted local HTTPS remains available through the existing certificate/key settings.

The production container now runs the Next standalone server as an unprivileged user. Obsolete Vite, React Router, SPA entry files, Nginx configuration and its shell entrypoint were removed. `/runtime-config.js` exposes only a validated public backend URL. Runtime `GAZECORE_BACKEND_URL` takes precedence, followed by the legacy runtime `VITE_GAZECORE_BACKEND_URL`, then the build-time `NEXT_PUBLIC_GAZECORE_BACKEND_URL` fallback. Private backend variables are never serialized.

## Redundancy findings and changes

| Finding | Resolution |
| --- | --- |
| An old standalone pupil/camera runtime remained in the UI package, with no active consumers. | Removed it after checking imports. Preserved the manual positive-z gaze calculation in `eye-tracking/manual-gaze-vector.ts`; the current worker detector remains shared by manual and automatic tracking. |
| The root `packages/ui/src/lib/gaze-core.ts` was an empty duplicate. | Removed. |
| Scene and remote features repeated identical point-distance math and some structural types. | Shared `src/lib/tracking-math.ts`, consolidated equivalent OpenCV, pair-inspection and RGB physical-model types. |
| Screen and remote headers duplicated branding. | Added shared `TrackingBrand`. |
| Remote mode selection, head readout, preview and result presentation lived inside a large screen file. | Extracted cohesive components with matching type files. Screen state and calibration lifecycle remain together. |
| Legacy `v2-page`/`v2-step-*` file names obscured their shared screen/scene role. | Renamed to `eye-tracking-workspace` and `setup-step-*`. |
| Four handwritten tracking stylesheets repeated panel/button/tooltip/layout rules. | Replaced them with static Tailwind primitives in eight purpose-based modules. No runtime CSS lookup table or handwritten component CSS remains. |
| shadcn CLI and Zod were installed in the UI package without active consumers. | Removed them and the unused shadcn stylesheet import. Existing UI primitives remain. |
| Named/structural types were mixed into implementation files. | Moved them into matching `.types.ts` modules, including components and local tooling. |
| Packed variable declarations, nested ternaries and unbraced control bodies made logic difficult to follow. | Expanded them and added ESLint rules to prevent their return. |

Sharing is based on behavior, not similar appearance. Different calibration solvers, coordinate conventions, tolerances, median defaults and sensor models remain separate. Mobile and webcam remote tracking continue sharing their runtime and calibration pipeline, with explicit mode-specific feature behavior. Scene calibration retains its own physical reference model and local named profiles.

## Styling and preserved behavior

`packages/ui/src/styles/globals.css` contains Tailwind imports, design tokens, source registration and the dark variant. Component presentation uses Tailwind utilities. Computed canvas coordinates, ROI bounds, gaze positions, marker dimensions and progress-dependent colors remain runtime values because they are data-dependent geometry.

Dark/sea-green tracker styling and application light/dark behavior are retained. Pill rotation still reflects accepted capture progress; the burst uses the Web Animations API, respects reduced motion and handles cancellation. Camera preferences, scene-only calibration profiles and gaze offsets retain their existing storage keys and behavior.

The scene calibration status area measured **58.5 px** both before and after a synthetic hand-loss message, confirming that the text transition did not resize that part of the layout. Remote Back returns from webcam setup to the three camera choices.

Final follow-up fixes preserve the eight other scene-calibration holds when retrying one location, make that targeted retry the primary action, and allow bounded noisy fits to reach the independent accuracy check. The final validation thresholds remain unchanged. Separate grid selectors now place the eye feed, marker and scene feed in distinct cells; browser checks confirmed this at 1280, 900 and 640 pixels and during active marker capture. Header badges read SCREEN, REMOTE and SCENE.

## Security findings and fixes

- Secret scans found no leaked secrets in the Git history or reviewed current source/configuration/documentation. Existing local `.env` files remain present and ignored. Models, dependencies, build output and environment files were not included in the checkpoint commit.
- The older sign-up flow stored a pending email/password in local storage. Removed that behavior. A small browser migration clears the old entries on all routes without reading their values; verification uses an existing session or returns to sign-in. No password is persisted for later automatic login.
- OAuth errors returned as response data now produce feedback and clear the busy state; they no longer depend on the client throwing an exception.
- Better Auth core/client/API-key packages are aligned at **1.6.33**. Backend Elysia, Drizzle and Resend were updated within the selected stable lines, with compatible security overrides where required. Auth schema and CORS settings were preserved.
- Removed unused dependency trees and pinned compatible frontend transitive fixes. Final `bun audit` reports **no known vulnerabilities** in both frontend and backend graphs. These results are date-specific dependency advisories, not a guarantee of complete security.
- Independent review caught build-time public-variable substitution shadowing the legacy runtime backend URL. The precedence was corrected and checked against the emitted Next route, not just source-level tests.

## Backend and Python scope

The backend remains the separate authentication/API-key service, with health and API documentation support. No eye-camera inference, gaze relay engine, tracking database or calibration persistence was added there. Auth and API-key database records remain required.

The independent `vision_assistant` Python work was left untouched and is not imported or bundled by the application. This checkout contains no tracked Python application files under that directory; the migration does not claim to package or validate that separate work.

## Verification

- Final full frontend regression run: **632 tests passed**, no failures, across 74 files, including account/runtime-configuration and calibration recovery regressions. The relay startup test ran with permission to bind a temporary localhost port.
- Frontend ESLint and Next-generated TypeScript checks: passed. Lint enforces type placement, braces, separate variable declarations, no sequence expressions and no nested ternaries.
- Next production build: passed, including standalone output and explicit public/account routes.
- Backend: **5 tests passed**, typecheck, build and frozen lockfile validation passed.
- Both dependency audits: no known vulnerabilities.
- Latest history secret scan: **55 commits**, no findings. Source scan: **495** source/configuration/documentation files, no findings; excludes ignored environments and binary/model assets. No new source file exceeds 1 MB.
- Standalone server: normal routes returned 200, legacy routes returned 308, unknown route returned 404. Runtime configuration returned a whitelisted URL with no-store headers.
- Exact production Webpack worker browser checks: pupil, head, remote webcam, remote mobile and remote IR initialized and processed a blank synthetic frame. Results were invalid/no-face/no-pupil as expected, not fabricated gaze coordinates.
- Real hand worker/model/WASM loading: passed on a synthetic image, reporting zero hands.
- Desktop browser review: screen and remote route layouts rendered without console errors; remote mode selection/back and scene calibration state changes behaved correctly.
- Normal `bun run dev`: started Next on 4001 and reused the existing local camera transport. The browser-only workspace rendered and had no warning/error logs after explicitly allowing localhost/127.0.0.1 development origins; extra LAN origins are opt-in.
- `git diff --check`: passed.

The independent review reported one P2 runtime-configuration issue, addressed above; no other P1/P2 findings in its reviewed auth, schema, SSR, worker and deployment scope.

## Remaining validation limits

This migration preserves the pupil and gaze solvers; it does not establish new real-world gaze accuracy or compensate for untested camera hardware. Live Google OAuth with a real user account, physical ESP32/USB camera sessions, prolonged head-motion accuracy, mobile hardware and the Docker image itself still need environment-specific acceptance testing. The standalone server artifact was exercised locally; an image build was not. The final scene-marker layout checks include a narrow browser viewport, not physical mobile-device validation.

See `frontend/README.md` for the maintained folder map and commands. Detailed workstream notes are in `v3-logic-audit.md`, `v3-ui-migration-report.md`, and `v3-backend-audit.md`; this report records the integrated result.
