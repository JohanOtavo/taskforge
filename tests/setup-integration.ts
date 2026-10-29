import { config } from "dotenv";
import { afterAll, beforeEach } from "vitest";

// Sin `override`: si el entorno ya trae DATABASE_URL (CI), gana el
// entorno. En local no hay ninguna puesta, asi que se usa .env.test.
config({ path: ".env.test", quiet: true });

const { db } = await import("@/server/db");

/// Vaciado en cascada antes de cada test. Mas rapido que recrear el esquema y
/// deja las secuencias reiniciadas, asi que el primer issue es siempre TF-1.
///
/// El orden es irrelevante gracias a CASCADE, pero se lista explicitamente:
/// una tabla nueva que no aparezca aqui filtra datos entre tests, y es mejor
/// que sea evidente al leer el archivo.
const TABLES = [
  "ProjectEvent",
  "AuditLog",
  "Comment",
  "IssueLabel",
  "Issue",
  "BoardColumn",
  "WorkflowState",
  "ProjectMember",
  "Project",
  "Label",
  "Invitation",
  "Membership",
  "Organization",
  "Session",
  "User",
];

beforeEach(async () => {
  const list = TABLES.map((table) => `"public"."${table}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await db.$disconnect();
});
