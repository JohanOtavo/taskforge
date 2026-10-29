import { describe, expect, test } from "vitest";

import { buildInvitationEmail } from "./message";

const BASE = {
  inviterName: "Ana Rivas",
  organizationName: "Acme",
  url: "https://taskforge.example.com/invite/token-de-prueba",
  expiresAt: new Date("2026-11-05T10:00:00.000Z"),
};

describe("buildInvitationEmail", () => {
  test("incluye el enlace en el texto plano y en el HTML", () => {
    const email = buildInvitationEmail(BASE);

    expect(email.text).toContain(BASE.url);
    expect(email.html).toContain(BASE.url);
  });

  test("nombra el tablero cuando la invitacion es a un tablero", () => {
    const email = buildInvitationEmail({ ...BASE, projectName: "TaskForge" });

    expect(email.subject).toBe("Ana Rivas te invita al tablero TaskForge");
    expect(email.text).toContain("el tablero TaskForge");
  });

  test("nombra el espacio de trabajo cuando no hay tablero", () => {
    const email = buildInvitationEmail(BASE);

    expect(email.subject).toBe("Ana Rivas te invita a Acme");
    expect(email.text).toContain("el espacio de trabajo Acme");
  });

  test("dice cuando caduca", () => {
    const email = buildInvitationEmail(BASE);

    // Fecha en UTC a proposito: sin fijar la zona, esta prueba pasaria en
    // Madrid y fallaria en Bogota por un dia de diferencia.
    expect(email.text).toContain("5 de noviembre de 2026");
  });

  test("escapa el HTML del nombre de quien invita", () => {
    const email = buildInvitationEmail({
      ...BASE,
      inviterName: '<script>alert("x")</script>',
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  test("escapa el HTML del nombre del tablero", () => {
    const email = buildInvitationEmail({ ...BASE, projectName: '"><img src=x>' });

    expect(email.html).not.toContain("<img src=x>");
    expect(email.html).toContain("&lt;img src=x&gt;");
  });

  test("avisa de que el enlace es de un solo uso", () => {
    const email = buildInvitationEmail(BASE);

    expect(email.text).toContain("una vez");
  });
});
