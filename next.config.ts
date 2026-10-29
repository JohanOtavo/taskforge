import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necesario para la imagen Docker `runner`.
  output: "standalone",
  // Next bloquea las peticiones de desarrollo que vengan de un origen no
  // declarado: el HMR falla y la pagina no llega a hidratarse. El panel de
  // vista previa puede abrir la app como localhost o como 127.0.0.1, asi que
  // valen las dos.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  // Tailwind v4 se procesa como loader de Turbopack. Sin esta regla el CSS
  // sale sin compilar y @theme queda como una at-rule desconocida: la pagina
  // carga pero sin ningun estilo.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // `cacheComponents` se deja desactivado a proposito: cada pagina depende de
  // la sesion y de datos por peticion, asi que no hay nada que precachear.
  // El cliente de Prisma no debe empaquetarse: carga binarios nativos.
  serverExternalPackages: ["@prisma/client", "pg"],
  experimental: {
    // Detras de un proxy/dominio propio la comprobacion de Origin de las
    // Server Actions rechaza peticiones legitimas si no se declara el origen.
    serverActions: {
      allowedOrigins: [new URL(process.env.APP_URL ?? "http://localhost:3000").host],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
