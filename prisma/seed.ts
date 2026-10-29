import { PrismaClient } from "@prisma/client";

import { keysBetween } from "../src/lib/ordering";
import { hashPassword } from "../src/server/password";
import { DEFAULT_WORKFLOW } from "../src/server/modules/projects/schema";

const db = new PrismaClient();

/// Datos de demostracion. Todos sinteticos: dominio .local reservado para uso
/// local, nada parecido a datos reales.
const DEMO_PASSWORD = "taskforge-demo-2026";

const PEOPLE = [
  { email: "ana@taskforge.local", name: "Ana Rivas", role: "OWNER" as const },
  { email: "luis@taskforge.local", name: "Luis Prado", role: "ADMIN" as const },
  { email: "sara@taskforge.local", name: "Sara Nieto", role: "MEMBER" as const },
  { email: "diego@taskforge.local", name: "Diego Soto", role: "VIEWER" as const },
];

const LABELS = [
  { name: "bug", color: "red" },
  { name: "mejora", color: "blue" },
  { name: "deuda tecnica", color: "amber" },
  { name: "ux", color: "violet" },
];

const ISSUES = [
  { title: "Rehacer el flujo de alta", type: "STORY", priority: "HIGH", column: 0, points: 8 },
  { title: "El login acepta correos con espacios", type: "BUG", priority: "URGENT", column: 1, points: 2 },
  { title: "Extraer el cliente de Postgres a un modulo", type: "TASK", priority: "LOW", column: 0, points: 3 },
  { title: "Tablero sin accesibilidad por teclado", type: "BUG", priority: "HIGH", column: 1, points: 5 },
  { title: "Anadir sprints y backlog", type: "EPIC", priority: "MEDIUM", column: 0, points: null },
  { title: "Paginar el listado de issues", type: "TASK", priority: "MEDIUM", column: 2, points: 3 },
  { title: "Registro de auditoria consultable", type: "STORY", priority: "MEDIUM", column: 3, points: 5 },
  { title: "Reconexion del tiempo real pierde eventos", type: "BUG", priority: "URGENT", column: 2, points: 5 },
] as const;

async function main() {
  console.log("Limpiando datos de demostracion...");
  // Orden inverso de dependencias; los ON DELETE CASCADE hacen el resto.
  await db.organization.deleteMany({ where: { slug: "acme" } });
  await db.user.deleteMany({ where: { email: { in: PEOPLE.map((p) => p.email) } } });

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const users = await Promise.all(
    PEOPLE.map((person) =>
      db.user.create({
        data: { email: person.email, name: person.name, passwordHash },
        select: { id: true, email: true },
      }),
    ),
  );

  const org = await db.organization.create({
    data: {
      name: "Acme",
      slug: "acme",
      memberships: {
        create: users.map((user, index) => ({ userId: user.id, role: PEOPLE[index].role })),
      },
      labels: { create: LABELS },
    },
    select: { id: true, labels: { select: { id: true, name: true } } },
  });

  const project = await db.project.create({
    data: {
      orgId: org.id,
      key: "TF",
      name: "Plataforma TaskForge",
      description: "Gestion de proyectos de software.",
      members: { create: { userId: users[0].id, role: "ADMIN" } },
    },
    select: { id: true },
  });

  const columns: { id: string; stateId: string }[] = [];
  for (const [index, step] of DEFAULT_WORKFLOW.entries()) {
    const state = await db.workflowState.create({
      data: {
        projectId: project.id,
        name: step.name,
        category: step.category,
        position: (index + 1) * 1000,
      },
      select: { id: true },
    });
    const column = await db.boardColumn.create({
      data: {
        projectId: project.id,
        stateId: state.id,
        name: step.name,
        position: (index + 1) * 1000,
        // Limite WIP en "En curso" para que el comportamiento sea visible.
        wipLimit: step.category === "IN_PROGRESS" && index === 1 ? 4 : null,
      },
      select: { id: true, stateId: true },
    });
    columns.push(column);
  }

  // Claves de posicion generadas en bloque: una por issue, ya ordenadas.
  const positions = keysBetween(null, null, ISSUES.length);

  for (const [index, issue] of ISSUES.entries()) {
    const column = columns[issue.column];
    const label = org.labels[index % org.labels.length];
    await db.issue.create({
      data: {
        orgId: org.id,
        projectId: project.id,
        number: index + 1,
        title: issue.title,
        description: `Issue de demostracion: ${issue.title}.`,
        type: issue.type,
        priority: issue.priority,
        stateId: column.stateId,
        columnId: column.id,
        position: positions[index],
        reporterId: users[0].id,
        assigneeId: index % 3 === 0 ? users[2].id : index % 3 === 1 ? users[1].id : null,
        storyPoints: issue.points,
        labels: { create: { labelId: label.id } },
      },
    });
  }

  await db.project.update({
    where: { id: project.id },
    data: { issueCounter: ISSUES.length },
  });

  await db.comment.create({
    data: {
      orgId: org.id,
      issueId: (await db.issue.findFirstOrThrow({
        where: { projectId: project.id, number: 2 },
        select: { id: true },
      })).id,
      authorId: users[1].id,
      body: "Reproducido. El correo se normaliza en el cliente pero no en el servidor.",
    },
  });

  console.log("Listo.");
  console.log(`  Organizacion: Acme (acme) - proyecto TF`);
  console.log(`  Usuarios: ${PEOPLE.map((p) => p.email).join(", ")}`);
  console.log(`  Contrasena: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
