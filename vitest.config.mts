import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Vitest config for Reelhouse's unit tests.
//
// Scope (Phase 4 / M1): pure-function suites only — no async Server Components
// or route handlers (Vitest can't render async RSC, and routes need Supabase
// mocking). See PROGRESS.md → Phase 4.
export default defineConfig({
  // Resolves the `@/*` path alias from tsconfig.json so tests import the same
  // way the app does.
  plugins: [tsconfigPaths()],
  test: {
    // These suites are pure functions — no DOM needed — so the fast `node`
    // environment keeps the gate quick. jsdom is installed and ready: a future
    // component test opts in per-file with `// @vitest-environment jsdom`.
    environment: "node",
    include: ["src/**/*.test.ts"],
    alias: {
      // `src/lib/opensubtitles.ts` begins with `import "server-only"`, whose real
      // module throws when imported outside a React Server Component. Stub it so
      // the pure `ensureVtt` export is reachable from tests.
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.ts", import.meta.url)
      ),
    },
  },
});
