import { execFileSync } from "node:child_process";

import { config } from "dotenv";

/// Se ejecuta UNA vez antes de toda la suite de integracion: carga el entorno
/// de test y aplica las migraciones. `migrate deploy` (no `dev`) para que
/// corra el MISMO SQL que produccion, incluidas las restricciones escritas a
/// mano que Prisma no sabe expresar.
export default function setup() {
  // Sin `override`: si el entorno ya trae DATABASE_URL (CI), gana el
// entorno. En local no hay ninguna puesta, asi que se usa .env.test.
config({ path: ".env.test", quiet: true });

  if (!process.env.DATABASE_URL?.includes("taskforge_test")) {
    throw new Error(
      "DATABASE_URL no apunta a taskforge_test. Abortando para no tocar datos de desarrollo.",
    );
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
}
