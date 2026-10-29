# TaskForge

Gestión de proyectos de software al estilo Trello/Jira: te registras, creas tu espacio de
trabajo, abres tableros kanban con arrastrar y soltar e invitas al equipo por correo.
Multi-inquilino, con issues por estado, etiquetas y comentarios, control de acceso por
roles, registro de auditoría y actualización en tiempo real.

## Stack

| Capa | Elección |
|------|----------|
| Framework | Next.js 16 (App Router, React 19, TypeScript estricto) |
| Base de datos | PostgreSQL 16 + Prisma 6 |
| Estilos | Tailwind CSS v4 (tokens semánticos, tema claro y oscuro) |
| Arrastrar y soltar | dnd-kit |
| Tiempo real | Server-Sent Events + `LISTEN/NOTIFY` de Postgres |
| Validación | Zod en todos los límites de confianza |
| Pruebas | Vitest (unitarias + integración contra Postgres real) |

## Puesta en marcha

Requisitos: Node 24+ y Docker.

```bash
npm install
cp .env.example .env
npm run db:up          # levanta Postgres en el puerto 55432
npm run db:deploy      # aplica las migraciones
npm run db:seed        # datos de demostración
npm run dev
```

La aplicación queda en <http://localhost:3000>.

## Cómo se usa

1. **Crea tu cuenta** en `/register`. El espacio de trabajo es opcional: si te han
   invitado a uno, deja ese campo vacío y abre el enlace de la invitación.
2. **Crea un espacio de trabajo** (lo pide la portada si no tienes ninguno). Quien lo crea
   es su propietario.
3. **Crea un tablero** con el botón *Nuevo proyecto*. Nace con cuatro columnas y su flujo
   de estados.
4. **Invita por correo**, desde *Equipo* (a toda la organización) o desde *Miembros* en un
   tablero (solo a ese tablero):
   - Si esa dirección **ya tiene cuenta**, entra en el acto, igual que en Trello.
   - Si **no la tiene**, se genera un enlace de un solo uso que caduca en 7 días y que solo
     puede aceptar esa dirección. El MVP no envía correo: se copia a mano.
5. **Cambia de espacio** con el selector de la cabecera cuando pertenezcas a más de uno.

### Cuentas de demostración

Todas comparten la contraseña `taskforge-demo-2026` y pertenecen a la organización **Acme**,
que ya trae el proyecto `TF` con ocho issues:

| Correo | Rol |
|--------|-----|
| `ana@taskforge.local` | Propietario |
| `luis@taskforge.local` | Administrador |
| `sara@taskforge.local` | Miembro |
| `diego@taskforge.local` | Observador |

Entra con cada uno para ver cómo cambia la interfaz según el rol: un observador no puede
crear ni mover tarjetas, y los botones correspondientes ni siquiera se dibujan.

## Comandos

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción (`output: standalone`) |
| `npm run verify` | Tipos + lint + pruebas unitarias |
| `npm test` | Pruebas unitarias (sin base de datos) |
| `npm run test:integration` | Pruebas de integración (requiere `db-test`) |
| `npm run test:coverage` | Suite completa con cobertura |
| `npm run db:migrate` | Crea una migración nueva en desarrollo |
| `npm run db:studio` | Explorador de datos de Prisma |
| `npm run db:prune` | Barre eventos y sesiones caducados (para un cron diario) |

Las pruebas de integración usan un contenedor aparte (`db-test`, puerto 55433, con `tmpfs`),
así que no tocan los datos de desarrollo:

```bash
docker compose up -d db-test
npm run test:integration
```

## Estructura

```
src/
  app/                    rutas: páginas, Server Actions y route handlers
  server/
    authz/                roles, tabla de permisos y resolución de acceso
    modules/<dominio>/    schema.ts (Zod) + service.ts (lógica de negocio)
    realtime/             publicación de eventos y oyente único de Postgres
    db.ts errors.ts       cliente de Prisma y errores de aplicación
    password.ts session.ts  hash de contraseñas y sesiones opacas
  lib/                    utilidades puras (orden fraccional, identificadores)
  components/             UI
prisma/
  schema.prisma           modelo de datos
  sql/constraints.sql     restricciones que Prisma no sabe expresar
tests/
  integration/            pruebas contra Postgres real
```

Los servicios reciben `(db, actor, input)` y nunca leen la sesión por su cuenta. Por eso se
pueden probar pasándoles un cliente de transacción y un actor falso, sin Next y sin navegador.
Una regla de ESLint impide que `src/server/**` importe de `app/` o de `components/`.

## Documentación

- [Arquitectura y decisiones](docs/ARCHITECTURE.md) — por qué el estado no se deriva de la
  columna, por qué el orden es un string, cómo funciona el tiempo real y qué queda fuera del MVP.
- [Seguridad](docs/SECURITY.md) — modelo de aislamiento entre inquilinos, autenticación,
  autorización y lista de comprobación antes de producción.
- [Despliegue](docs/DEPLOY.md) — tres formas de ponerlo en internet sin pagar, qué planes
  gratuitos no sirven y por qué, y qué revisar tras el primer despliegue.

## Estado

211 pruebas en verde con cobertura por encima del 80 % en la lógica de negocio. Lo que queda fuera del MVP está en
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), sección 13.
