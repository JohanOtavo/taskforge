import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Dos proyectos: `unit` no toca la base de datos y corre en cualquier
    // sitio; `integration` necesita la Postgres de docker-compose.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["./tests/global-setup.ts"],
          setupFiles: ["./tests/setup-integration.ts"],
          // Las pruebas comparten una base de datos: sin aislamiento de
          // procesos se pisan los datos entre si.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Solo logica de negocio. Un umbral global que incluya componentes
      // solo incentiva pruebas de snapshot sin valor.
      include: ["src/server/modules/**", "src/server/authz/**", "src/lib/**", "src/server/password.ts"],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
