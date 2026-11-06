import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import * as orgs from "@/server/modules/orgs/service";

import { actorOf, makeOrg, makeUser } from "../factories";

describe("renombrar el espacio de trabajo", () => {
  it("el dueno lo renombra y el slug no cambia", async () => {
    const owner = await makeUser();
    const org = await makeOrg([{ user: owner, role: "OWNER" }]);

    await orgs.renameOrganization(db, actorOf(owner), { orgId: org.id, name: "Bananera SAS" });

    const row = await db.organization.findUniqueOrThrow({
      where: { id: org.id },
      select: { name: true, slug: true },
    });
    expect(row).toEqual({ name: "Bananera SAS", slug: org.slug });
  });

  it("un miembro no puede renombrarlo", async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const org = await makeOrg([
      { user: owner, role: "OWNER" },
      { user: member, role: "MEMBER" },
    ]);

    await expect(
      orgs.renameOrganization(db, actorOf(member), { orgId: org.id, name: "Otro" }),
    ).rejects.toThrow();
  });
});
