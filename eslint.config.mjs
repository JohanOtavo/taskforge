import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),

  {
    // Frontera de arquitectura.
    //
    // Sin esta regla, un servicio acaba importando algo de `app/` para
    // "aprovechar" un tipo, y a partir de ahi la logica de negocio deja de
    // poder probarse sin Next. Cinco minutos de configuracion evitan toda
    // esa deriva.
    files: ["src/server/**/*.ts", "src/lib/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*", "@/components/*", "next/navigation", "next/cache"],
              message:
                "La logica de servidor no depende de la capa de rutas ni de la UI. Si necesitas algo de app/, pasalo como argumento.",
            },
          ],
        },
      ],
    },
  },

  {
    // react-three-fiber es imperativo por diseno: el bucle de render muta
    // la escena directamente (`camera.position.x += ...`), que es justo lo
    // que estas reglas existen para impedir en el modelo declarativo de
    // React. Fuera del canvas siguen activas.
    files: ["src/components/layout/auth-scene-3d.tsx"],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
    },
  },

  {
    // En los tests no molesta un `any` puntual ni una aserción no nula.
    files: ["tests/**/*.ts", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
]);

export default eslintConfig;
