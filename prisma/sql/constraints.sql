-- ===========================================================================
-- Restricciones que el esquema de Prisma no puede expresar.
-- ===========================================================================

-- Busqueda por titulo. Sin esto, `title contains` es un recorrido secuencial
-- sobre toda la tabla en cuanto hay 100k issues. Un indice trigram GIN si
-- sirve para LIKE/ILIKE, que es lo que genera Prisma con `mode: insensitive`.
--
-- Dos limites que conviene saber: con menos de 3 caracteres no hay trigramas
-- que buscar y el indice no acota nada (por eso el esquema de Zod exige 3), y
-- una busqueda numerica se resuelve por `number =`, no por este indice.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Issue_title_trgm_idx" ON "Issue" USING GIN ("title" gin_trgm_ops);

-- Unicidad insensible a mayusculas. La aplicacion normaliza en el limite
-- (ver src/lib/identifiers.ts), pero el indice unico de Prisma es byte a
-- byte: sin este respaldo, `Alice@x.com` y `alice@x.com` serian dos cuentas
-- y una invitacion enviada a una variante no encajaria con la otra.
CREATE UNIQUE INDEX "User_email_lower_key" ON "User" (lower("email"));
CREATE UNIQUE INDEX "Organization_slug_lower_key" ON "Organization" (lower("slug"));

-- Una sola invitacion viva por (organizacion, correo). Indice unico PARCIAL:
-- las ya aceptadas o revocadas quedan fuera, asi que el historial se
-- conserva. Prisma no sabe declarar un indice parcial.
CREATE UNIQUE INDEX "Invitation_pending_unique"
  ON "Invitation" ("orgId", lower("email"))
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

-- Un issue no puede ser su propio padre. El resto de la validacion de ciclos
-- y de profundidad esta en el servicio, pero este caso es barato aqui.
ALTER TABLE "Issue"
  ADD CONSTRAINT "Issue_parent_not_self" CHECK ("id" <> "parentId");

-- Formato de la clave de proyecto (TF, PROJ1). Evita que una importacion o
-- un script salten la validacion de Zod.
ALTER TABLE "Project"
  ADD CONSTRAINT "Project_key_format" CHECK ("key" ~ '^[A-Z][A-Z0-9]{1,9}$');

-- Un limite WIP de 0 bloquearia la columna entera; uno negativo no significa
-- nada.
ALTER TABLE "BoardColumn"
  ADD CONSTRAINT "BoardColumn_wip_positive"
  CHECK ("wipLimit" IS NULL OR "wipLimit" > 0);

-- Los puntos de historia negativos no existen.
ALTER TABLE "Issue"
  ADD CONSTRAINT "Issue_story_points_non_negative"
  CHECK ("storyPoints" IS NULL OR "storyPoints" >= 0);

-- NOTA deliberada: NO se crea un indice unico sobre (columnId, position).
-- Con el, una carrera entre dos arrastres falla con P2002 y hace falta
-- reintentar. Sin el, una posicion duplicada es un detalle cosmetico, porque
-- toda lectura ordena por (position, id) y el desempate es determinista.
