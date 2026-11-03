import { describe, expect, it } from "vitest";

import { parseTheme } from "./theme";

describe("parseTheme", () => {
  it("acepta los temas conocidos", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
  });

  it("cae en el del sistema con cualquier otra cosa", () => {
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("rosa")).toBe("system");
    expect(parseTheme({ startsWith: "d" })).toBe("system");
  });
});
