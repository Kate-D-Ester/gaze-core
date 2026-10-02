# V3 frontend logic audit

Scope: tracking application logic/components/screens, shared gaze-core modules, remaining dashboard/auth components, hooks, client libraries, and UI package components. Account flow, theme provider, Next routes, and configuration are parent-owned. No algorithm thresholds, pupil fitting equations, calibration targets, or numeric solver behavior were changed. No commits or pushes.

## Changes

- Moved 38 named type declarations and 28 inline object types into matching `.types.ts` modules. Replaced generated extraction names with descriptive domain names (for example `IrEyeFrame`, `PairInspectionResult`, `FaceLandmarkerRuntime`, and `RefinedPupilContour`). Existing exported names remain available through type-only reexports so component/test consumers continue working.
- Renamed remote tracker `types.ts` to `remote-eye-tracking.types.ts`; implementation and mirror type modules import the new path. All component and test imports now use the new module; the compatibility barrel was removed.
- Wrapped 996 control-flow bodies in blocks and split 219 comma-packed variable declarations into separate statements. Used TypeScript's parser/printer rather than regular-expression body editing, preserving loop bindings and execution order.
- Removed all seven nested conditional expressions. Nullable result construction uses explicit branches; numeric threshold and prior-pupil choices use named intermediate values. No per-pixel algorithm was restructured.
- Shared the exact Euclidean point-distance implementation in `gaze-core/math.ts` between scene calibration and RGB face geometry. Consolidated identical OpenCV runtime, scene pair-inspection, and RGB physical-model types. Different median defaults, solver tolerances, and coordinate conventions remain distinct because their behavior differs.
- Cleaned imports with TypeScript `organizeImports` and formatted scoped modules using Prettier. Type-only imports avoid new runtime dependency cycles; the internal `IrEyeTrack` class is exported solely to express a moved type through a type-only import.

## Verification

- Focused pure TypeScript suites: 498 passed, 0 failed across 51 eye, remote, and scene tracker files; includes IR replay/pupil evidence, calibration fitting, worker lifecycles, marker geometry, camera transformation, and session persistence.
- Full frontend TypeScript check passes after parent account integration.
- Scoped web implementation/type-module ESLint passes; scoped `git diff --check` passes.
- AST source audit: zero type declarations or object type literals in implementation modules, zero unbraced controls, zero packed variable statements, zero nested conditional expressions.

## Enforcement and handoff

Temporary tools are available at `/tmp/gaze-cleanup.cjs` (one-shot extraction/control normalization), `/tmp/gaze-organize.cjs` (import cleanup), and `/tmp/gaze-verify.cjs` (repeatable AST audit, nonzero exit on violations). They are migration aids, not checked-in production tooling. The extraction script uses TS parsing and is limited to `.ts`; a TSX version must parse with `ScriptKind.TSX`, select TSX paths explicitly, and skip the one-shot `types.ts` rename. Type-only imports copied into mirror modules need organizeImports afterward. Local class references and generic type parameters require review rather than blind extraction.

Recommended lint enforcement: ESLint `curly: [error, all]`, `one-var: [error, never]`, `no-nested-ternary: error`, and scoped restricted AST selectors for `TSInterfaceDeclaration`, `TSTypeAliasDeclaration`, and `TSTypeLiteral` in application implementation files, with `.types.ts` overrides. Retain an AST audit for nested conditionals inside object/array expressions, which some lint traversals overlook.

Parent integration: migrate the old App-based route tests to Next route tests, then run the complete frontend build/regression gate. Hardware camera/NIR validation remains a separate real-device check.

## Tracking TSX follow-up

Expanded the cleanup to 37 tracking components and the two tracking screens after the Tailwind migration settled. Moved one named declaration and 18 inline object types to mirror modules, normalized 156 control bodies and 17 packed declarations, and replaced 13 nested UI conditional expressions with named render values. Existing props, event handlers, camera state transitions, and JSX behavior are preserved. Remote type imports were migrated throughout frontend source/tests, and the compatibility barrel was deleted. A final AST pass also removed the remaining paired loop declaration in polygon geometry.

Full frontend typecheck and tracking component/screen ESLint pass. AST audit across tracking `.ts` and `.tsx` reports no declaration/object-literal/control-body/packed-declaration/nested-conditional violations. Tracker/component execution passed 612 tests; two App-based route files failed to import the deleted legacy App and require parent framework-test migration. The final scoped execution passed 606 tests across 68 files, excluding the two stale App route files and the parent-owned head-worker fixture that lacks `self.location` after the worker URL migration.

Additional migration tools: `/tmp/gaze-cleanup-tsx.cjs`, `/tmp/gaze-organize-tsx.cjs`, and repeatable `/tmp/gaze-verify-tracking.cjs`. These preserve TSX parsing and keep edits within tracking modules/screens; they should not be blindly applied to unrelated UI.

## Remaining frontend source follow-up

Audited `src/components` (excluding parent-owned theme provider), hooks, lib, auth/dashboard screens, and UI package components. Existing type modules already covered nearly all declarations. Extracted the two remaining session-user object casts as `UnvalidatedSession` and `UnvalidatedSessionUser` in `session-user.types.ts`; moved the nested confirmation-password input choice to a named value; wrapped the two remaining backend URL helper return bodies. TypeScript import cleanup and formatting preserve behavior.

Full frontend typecheck, scoped remaining-web ESLint, full UI-package lint, and `git diff --check` pass. `/tmp/gaze-verify-other.cjs` reports zero type declarations/object literals, unbraced controls, packed declarations (including loop initializers), or nested conditionals in this scope. No new broad test run was required for this final mechanical extension.

## Final tooling and enforcement gate

Normalized all five web tooling scripts, extracting one replay reply type and four fixture object types (two identical scene identity casts share one type), wrapping 19 control bodies, and splitting six packed declarations. Fixture frame-confidence selection is a named helper so its evaluation still uses the incremented frame sequence. The parent's fixture layout class remains present. Worker URLs were preserved.

Both web and UI ESLint configs now enforce `curly: all`, `one-var: never`, `no-nested-ternary`, and `no-sequences` including parenthesized expressions. Restricted AST selectors also cover comma sequences and packed loop initializers, which the built-in rules exempt. Source implementation `.ts`/`.tsx` files reject interface declarations, type aliases, and structural object types; `.types.ts` and `.d.ts` remain allowed. Config, tooling, and declaration modules retain appropriate type flexibility.

The global frontend source/tooling AST audit (`/tmp/gaze-verify-all.cjs`) reports zero type/object-literal, unbraced-control, packed-declaration, and nested-conditional violations. Full frontend lint, frontend typecheck, and `git diff --check` pass. The existing web TypeScript project excludes tooling scripts; script syntax/import structure is checked by ESLint, while source and UI package TypeScript are checked by their existing projects.

Two numeric loops were rewritten to eliminate comma updates/initializers without changing their pixel arithmetic. Grayscale output exactly matched the prior formula for 4,097 input lengths (including incomplete RGBA tails); all nine eye-engine regressions passed. The native relay startup/reuse/occupied-port test passed when rerun with localhost binding permitted; its initial sandbox run could not open the ephemeral port. No broad regression rerun was added for this final mechanical gate.
