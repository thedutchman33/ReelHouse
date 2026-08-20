// Test stub for the `server-only` package.
//
// The real `server-only` module throws at import time outside a React Server
// Component. Under Vitest we alias `server-only` to this empty module (see
// `vitest.config.mts`) so server-only modules such as `src/lib/opensubtitles.ts`
// can be imported to unit-test their pure exports (e.g. `ensureVtt`).
export {};
