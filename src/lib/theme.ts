/// Tema de la interfaz. Se guarda en una cookie, no en localStorage, para que
/// el servidor pinte ya el `data-theme` correcto y no haya un parpadeo con el
/// tema equivocado al cargar. Sin cookie manda la preferencia del sistema.
export const THEME_COOKIE = "tf_theme";

export const THEMES = ["system", "light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

export function parseTheme(value: unknown): Theme {
  return THEMES.find((theme) => theme === value) ?? "system";
}
