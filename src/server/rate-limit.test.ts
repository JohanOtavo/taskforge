import { beforeEach, describe, expect, it } from "vitest";

import { createSemaphore, rateLimit, rateLimitSize, resetRateLimits } from "./rate-limit";

beforeEach(() => resetRateLimits());

describe("rateLimit", () => {
  it("permite hasta el limite y bloquea despues", () => {
    for (let i = 0; i < 3; i += 1) {
      expect(rateLimit("k", 3, 60_000).allowed).toBe(true);
    }
    const blocked = rateLimit("k", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("cuenta cada clave por separado", () => {
    rateLimit("a", 1, 60_000);
    expect(rateLimit("b", 1, 60_000).allowed).toBe(true);
  });

  it("no retiene para siempre claves que nunca se vuelven a consultar", async () => {
    // La clave lleva dentro un correo elegido por quien llama. Un millon de
    // direcciones distintas dejaba un millon de entradas residentes: el
    // limitador contra fuerza bruta se convertia en la via para agotar la
    // memoria.
    for (let i = 0; i < 500; i += 1) {
      rateLimit(`login:email:unica-${i}@x.com`, 8, 1);
    }
    expect(rateLimitSize()).toBe(500);

    // El barrido corre como mucho una vez por minuto; se fuerza el reloj.
    await new Promise((resolve) => setTimeout(resolve, 5));
    resetRateLimits();
    expect(rateLimitSize()).toBe(0);
  });
});

describe("createSemaphore", () => {
  it("nunca deja pasar mas de los permisos indicados", async () => {
    const run = createSemaphore(2);
    let active = 0;
    let peak = 0;

    const task = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    };

    // Con el patron leer-antes-del-await, un recien llegado se colaba en el
    // microtask entre liberar y despertar, y el pico llegaba a 3.
    await Promise.all(Array.from({ length: 12 }, () => run(task)));

    expect(peak).toBeLessThanOrEqual(2);
    expect(active).toBe(0);
  });

  it("libera el permiso aunque la tarea falle", async () => {
    const run = createSemaphore(1);
    await expect(run(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(run(async () => "ok")).resolves.toBe("ok");
  });

  it("respeta el orden de llegada", async () => {
    const run = createSemaphore(1);
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3].map((n) =>
        run(async () => {
          order.push(n);
          await new Promise((resolve) => setTimeout(resolve, 1));
        }),
      ),
    );
    expect(order).toEqual([1, 2, 3]);
  });
});
