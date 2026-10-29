# Arquitectura y decisiones

Este documento recoge las decisiones que no se leen en el código y el motivo de cada una.
Casi todas existen porque la alternativa obvia falla de una forma que no se nota hasta
producción.

## 1. El estado de un issue no se deriva de la columna

`Issue.stateId` apunta a un `WorkflowState` con una `category` (`TODO`, `IN_PROGRESS`,
`DONE`). La columna del tablero (`columnId`) es solo colocación visual, y puede ser `NULL`
cuando el issue está en el backlog.

La alternativa —preguntar "¿está en la columna de más a la derecha?"— se rompe el día que
alguien añade una columna "No se hará", y hace imposible calcular tiempo de ciclo o un
burndown. Arreglarlo después es una migración sobre todos los issues más una reescritura de
todas las consultas. Separarlo ahora costó una tabla y una clave foránea.

Mover una tarjeta de columna actualiza **también** el estado (`moveIssue` en
`src/server/modules/issues/service.ts`), de modo que el estado nunca se queda atrás.

## 2. El orden de las tarjetas es un string, no un float

`Issue.position` guarda un índice fraccional en base62 (paquete `fractional-indexing`).

Un `double precision` tiene 53 bits de mantisa. Arrastrar siempre al mismo borde parte el
hueco por la mitad cada vez, y hacia el gesto número cincuenta `(a + b) / 2 === a`: dos
tarjetas empatan y el orden deja de ser determinista. "Mover al principio de la columna" es
el gesto más común que existe en un tablero, así que no es un caso teórico. La prueba de
`tests/integration/issues.test.ts` hace 60 arrastres seguidos al mismo borde y comprueba que
no hay colisiones.

El reequilibrado que exigiría un float es un `UPDATE` O(n) sobre la columna, necesita bloqueo
y choca con los arrastres concurrentes. Con índices fraccionales no hay reequilibrado.

Toda lectura ordena por `(position, id)`. El desempate por `id` convierte una posición
duplicada en un detalle cosmético en vez de en un orden distinto en cada recarga. Por eso
**no** existe un índice único sobre `(columnId, position)`: con él, una carrera entre dos
arrastres fallaría con `P2002` y haría falta lógica de reintento para evitar algo que ya es
inofensivo.

## 3. El cliente envía intención, no posiciones

El endpoint de movimiento recibe `{ toColumnId, afterId, beforeId }`. El servidor carga esos
dos vecinos dentro de la transacción y genera la clave.

Si el cliente calculase la posición, lo haría sobre un estado que puede estar obsoleto —otra
persona movió una tarjeta hace medio segundo— y el servidor no tendría forma de detectarlo:
recibiría un string perfectamente válido que corrompe el orden.

## 4. Tiempo real: SSE con reproducción, un solo oyente por proceso

Tres decisiones que van juntas.

**Reproducción.** Cada mutación escribe una fila en `ProjectEvent` dentro de la misma
transacción. El stream emite `id: <seq>`, el navegador reenvía `Last-Event-ID` al reconectar
y el servidor reproduce lo perdido. Sin esto, cualquier hueco —un despliegue, un portátil
suspendido, treinta segundos de túnel móvil— deja el tablero permanentemente incorrecto sin
un solo error visible. Es la peor clase de fallo: en desarrollo "el tiempo real funciona".

Si el hueco supera 500 eventos, el servidor manda `event: resync` y el cliente recarga, que
es más barato y más fiable que aplicar miles de parches.

**Un oyente por proceso.** Un `LISTEN` por petición SSE serían 100 conexiones fijas con 100
usuarios conectados, más el pool de Prisma, por réplica, contra un `max_connections` de 100
por defecto. En su lugar hay un único cliente `pg` por proceso escuchando un solo canal, y el
reparto a los suscriptores es en memoria: cero conexiones por suscriptor.

**`NOTIFY` es solo un despertador.** Su carga es únicamente el `projectId`. Los suscriptores
leen los eventos nuevos de `ProjectEvent` por número de secuencia, así que el orden y la
integridad los garantiza la base de datos, no el canal.

### Requisito de despliegue

`LISTEN/NOTIFY` **no funciona** a través de un pooler en modo transacción: PgBouncer en
`transaction`, Supabase por el puerto 6543, el endpoint `-pooler` de Neon. La conexión se
entrega a otro cliente entre sentencias y las notificaciones se pierden sin error alguno.

Por eso hay dos variables de entorno:

- `DATABASE_URL` — con pooler, la usa Prisma. Con un pooler transaccional añade
  `?pgbouncer=true&connection_limit=5`.
- `DATABASE_URL_DIRECT` — conexión directa en modo sesión (puerto 5432). La usan el oyente de
  tiempo real y `prisma migrate`.

Si ambas apuntan al pooler, el tiempo real deja de funcionar en silencio.

## 5. Concurrencia optimista en los issues

`Issue.version` se incrementa en cada escritura, y `updateIssue` filtra por la versión que el
cliente vio. Si otra persona guardó mientras el formulario estaba abierto, la escritura afecta
a cero filas y el usuario recibe un conflicto.

Sin esto, con tiempo real activo, dos personas editando la misma descripción se pisan sin
aviso y sin más rastro que el registro de auditoría.

## 6. Numeración de issues

`Project.issueCounter` se incrementa de forma atómica dentro de la transacción
(`{ increment: 1 }`), nunca con un patrón leer-sumar-escribir: dos creaciones simultáneas
leerían 41 y las dos escribirían 42. La prueba lanza doce creaciones en paralelo y exige doce
números distintos.

Los huecos son aceptables: una transacción deshecha consume un número. No hay lógica de
reutilización, y no debe haberla.

## 7. Autorización: permisos con nombre, roles nunca comparados en línea

`src/server/authz/` tiene tres piezas, dos de ellas puras:

- `roles.ts` — el orden de los roles y `effectiveProjectRole`, la regla **total** que resuelve
  rol de organización + visibilidad del proyecto + rol de proyecto.
- `permissions.ts` — la tabla `MIN_ROLE` y `can(role, permission)`.
- `resolve.ts` — lo único que toca la base de datos.

Que las dos primeras sean puras permite probarlas con una matriz exhaustiva, sin base de
datos. Que los permisos tengan nombre evita que `role === "ADMIN" || role === "OWNER"` acabe
repartido por cuarenta sitios de los que uno se olvida.

La regla de resolución, explícita a propósito:

1. Sin pertenencia a la organización no hay acceso, punto.
2. `OWNER` y `ADMIN` de la organización colapsan a `ADMIN` de proyecto y **no son
   anulables**: un administrador de proyecto no puede dejar fuera al dueño de la
   organización.
3. En un proyecto `ORG`, la fila `ProjectMember` **sustituye** al rol de la organización
   (puede subir o bajar); si no existe, se hereda.
4. En un proyecto `PRIVATE` la fila es obligatoria.

Un rol efectivo `NONE` se comunica como `NOT_FOUND`, no como `FORBIDDEN`: distinguirlos
revelaría que el proyecto existe en otra organización.

## 8. El ámbito se deriva del objeto, nunca del cliente

`requireIssueAccess(db, userId, issueId, permission)` resuelve issue, proyecto y
organización, y después comprueba. Una firma como `moveIssue({ issueId, orgId })` donde el
`orgId` viene del cuerpo de la petición se autoriza a sí misma.

## 9. Sesiones opacas en base de datos, no JWT

Un token aleatorio de 256 bits en una cookie `httpOnly`; en la base de datos solo su hash
SHA-256. Revocar es borrar una fila.

Un JWT con el rol dentro deja a un usuario degradado como `ADMIN` hasta que caduque el token.
Aquí el rol se resuelve contra la base de datos en cada petición, memoizado por petición con
`cache()` de React.

## 10. Auditoría: misma transacción, nivel de intención

`AuditLog` se escribe dentro de la misma transacción que la mutación, así que no puede quedar
constancia de algo que luego se deshizo (hay una prueba que lo comprueba).

Se audita la **intención**, no fila por fila: un movimiento masivo que escribiese 200 filas
dentro de la transacción convertiría una escritura de 20 ms en un bloqueo largo.

Los campos de texto (`actorEmail`, `entityLabel`) son instantáneas, no uniones: la entidad
referenciada suele no existir cuando alguien lee el registro meses después. Por eso `actorId`
usa `onDelete: SetNull` y no `Cascade`: borrar un usuario no debe borrar su historial.

## 11. Arrastrar y soltar va por route handler, no por Server Action

Next serializa las llamadas a Server Actions y cada una provoca un refresco del router con su
carga RSC. Un gesto de arrastre encadenando acciones se encola, se siente lento y además
recarga el tablero que ya se actualizó de forma optimista. Un `POST` normal responde en un
viaje y el SSE avisa al resto.

El resto de mutaciones sí son Server Actions. Todas validan su entrada y resuelven permisos
por su cuenta: una Server Action es un endpoint `POST` público, y ocultar el botón no
autoriza nada.

## 12. `parseForm` en lugar de `Object.fromEntries(formData)`

React inyecta campos propios (`$ACTION_REF_1`, `$ACTION_KEY`, ...) en los formularios de
Server Actions. Con `Object.fromEntries` esos campos entran en el objeto y `.strict()` rechaza
la petición entera: **todos** los formularios fallan con un mensaje que no dice por qué.

`parseForm` extrae solo las claves que declara el esquema. `.strict()` sigue protegiendo
donde importa: una petición JSON fabricada a mano que intente colar `orgId` o `role` se
rechaza igual.

## 13. Qué queda fuera del MVP, y por qué

| Fuera | Motivo |
|-------|--------|
| Envío de correo | Sin envío no hace falta un patrón outbox. Las invitaciones generan un enlace que se copia a mano, suficiente para un equipo pequeño. Cuando haya correo hará falta una tabla `Outbox`: enviar dentro de una transacción produce correos fantasma si se deshace. |
| Sprints y backlog | El modelo ya los admite (`WorkflowState` separado de `BoardColumn`, `columnId` nullable). Falta `Sprint` e `Issue.sprintId`. |
| Adjuntos | Necesitan almacenamiento de objetos con subida firmada. Los bytes nunca deben ir a Postgres. |
| Notificaciones | Dependen del outbox. |
| Filtros guardados | El servicio de listado ya recibe un **filtro estructurado**, no parámetros sueltos, precisamente para que guardarlos sea serializar ese objeto y no reescribir la consulta. |
| RLS en Postgres | El aislamiento es de aplicación más la clave foránea compuesta `(projectId, orgId)`. Ver SECURITY.md para el coste real de añadir RLS con un pooler. |
| OAuth | `User.passwordHash` es nullable justamente para que añadirlo no sea una migración. |

## 14. Versiones fijadas a propósito

`prisma` y `@prisma/client` están fijados a `6.19.3`. El tag `latest` del registro apunta a
una versión candidata (`8.0.0-rc`), así que un `npm i prisma@latest` instalaría una RC sin
avisar.

## 15. Espacios de trabajo y la clave del proyecto

Una persona puede pertenecer a varias organizaciones: basta con que acepte una invitacion.
La interfaz usaba `memberships[0]` en tres sitios, asi que la segunda organizacion era
invisible y aceptar una invitacion no cambiaba nada en pantalla.

El espacio activo vive en una cookie (`tf_org`) que es **solo una preferencia**: en cada
peticion se comprueba que la persona siga perteneciendo a esa organizacion, y si no, se
ignora en silencio. La cookie se borra al cerrar sesion, para que quien entre despues en el
mismo navegador no herede el espacio del anterior.

Esto arregla un fallo que no era solo de comodidad. `Project.key` es unico **por
organizacion** (`@@unique([orgId, key])`), pero `getBoard` y `getIssueDetail` lo buscaban
sin acotar:

```ts
db.project.findFirst({ where: { key: projectKey, archivedAt: null } })  // sin orgId
```

Con dos organizaciones que tengan un proyecto "TF" —la clave mas probable que dos equipos
eligen a la vez— `/p/TF` resolvia a la fila que alcanzase antes el planificador, sin
`ORDER BY`. Para quien pertenece a las dos, eso significa aterrizar en el tablero
equivocado; para quien pertenece a una sola, un 404 permanente en su propio tablero. Ahora
la consulta lleva el `orgId` del espacio activo, y hay dos pruebas que crean "TF" en dos
organizaciones y comprueban que cada quien ve el suyo.

## 16. Invitar por correo, al estilo Trello

`inviteMember` devuelve una union, no un token:

```ts
type InviteOutcome =
  | { kind: "added"; userId: string; name: string; email: string }
  | { kind: "invited"; invitationId: string; token: string; expiresAt: Date };
```

Si esa direccion **ya tiene cuenta**, entra en el acto: no se crea invitacion, asi que no
hay nada que caducar ni revocar. Si **no la tiene**, se emite un enlace de un solo uso.

`Invitation` lleva `projectId` y `projectRole` opcionales, asi que se puede invitar
directamente a un tablero: al aceptar, la persona entra en la organizacion **y** en ese
tablero de una vez, en lugar de entrar y quedarse esperando a que alguien la anada.

Dos consecuencias que conviene decir en voz alta:

- Quien invita ve "se ha anadido" o "aqui tienes el enlace", asi que **la respuesta revela
  si una direccion tiene cuenta**. Trello se comporta igual. Solo pueden invitar ADMIN y
  OWNER de la organizacion, asi que no es enumeracion anonima.
- Una invitacion deja de valer si a quien la emitio le quitan el permiso de invitar. Sin
  esa comprobacion, un administrador expulsado volvia a entrar durante siete dias por un
  enlace que se habia dejado abierto a una direccion suya.

Anadir a alguien a un tablero **no** le cambia el rol que ya tuviera en la organizacion:
son dos niveles distintos y mezclarlos convierte "te anado al tablero" en una via de
escalada silenciosa.

## 17. Indices: lo que la revision de base de datos corrigio

Tres comentarios de este repositorio describian consultas que Prisma **no**
emite. Se corrigieron contra el SQL real, medido con `EXPLAIN`.

### La lectura del tablero no llevaba projectId

Prisma carga una relacion anidada con **una consulta por nivel**, acotada solo
por la clave del padre. El tablero no emite una consulta por columna con
`projectId`, sino una sola:

```sql
WHERE "columnId" IN (...) AND "archivedAt" IS NULL ORDER BY position, id
```

Ningun indice empezaba por `columnId`, asi que la pantalla principal de la
aplicacion no tenia ninguno utilizable. El que la cubre es parcial, y por eso
vive en SQL y no en el esquema:

```sql
CREATE INDEX "Issue_column_board_idx"
  ON "Issue" ("columnId", "position", "id")
  WHERE "archivedAt" IS NULL AND "columnId" IS NOT NULL;
```

Medido con 40 000 issues: `Index Scan using "Issue_column_board_idx"`,
8 filas devueltas. Antes era un recorrido secuencial.

### El listado por defecto no tenia indice

`listIssues` ordena por `updatedAt DESC` salvo que se pida otra cosa. El indice
`[projectId, stateId, updatedAt]` solo sirve si ademas se filtra por `stateId`,
que es justo lo que el caso por defecto no hace. Se anadio
`Issue_projectId_updatedAt_id_idx`, tambien parcial: 50 filas de 40 000 en
8 buffers.

### `_count` filtrado agregaba la tabla entera

Un `_count` con `where` dentro de un `select` **no** se compila a una
subconsulta correlacionada. Prisma emite una tabla derivada sin ningun
predicado que la ate al proyecto ni al inquilino:

```sql
LEFT JOIN (SELECT "issueId", "orgId", COUNT(*) FROM "Comment"
           WHERE "deletedAt" IS NULL GROUP BY "issueId", "orgId") ...
```

Es decir: la tabla `Comment` completa, de todas las organizaciones, en cada
carga del tablero; y la tabla `Issue` completa en cada carga de la lista de
proyectos. Ambos se sustituyeron por un `groupBy` acotado a las filas que se
van a pintar.

### Otros cambios de la misma revision

- Cinco claves foraneas no tenian indice en el lado que referencia
  (`Issue.reporterId`, `Issue.stateId`, `Comment.authorId`, `AuditLog.actorId`,
  `Invitation.invitedById`). Sin ellos, borrar un usuario obliga a un recorrido
  secuencial por cada tabla hija.
- Dos indices que ninguna consulta usaba (`Issue.orgId`,
  `AuditLog(entityType, entityId)`) se eliminaron: penalizaban las dos rutas de
  insercion mas calientes sin dar nada a cambio.
- `Issue.stateId` paso de `Restrict` a `NoAction`. Con `Restrict`, borrar un
  proyecto con issues **fallaba siempre**: el trigger de integridad se dispara
  antes del cascade que habria borrado esos issues. `NoAction` aplaza la
  comprobacion al final de la sentencia. Hay tres pruebas que lo cubren.
- Los 26 campos `DateTime` pasaron a `timestamptz`. Gratis con las tablas
  vacias; mas adelante habria sido una ventana de mantenimiento.
- La busqueda por texto exige 3 caracteres: un trigrama son 3 letras, asi que
  por debajo de eso el indice GIN no acota nada.
- `assertNotLastOwner` se movio dentro de la transaccion y toma `FOR UPDATE`
  sobre las filas de propietario. Comprobarlo fuera era una carrera: dos
  propietarios degradandose a la vez leian ambos "quedan 2" y la organizacion
  podia quedarse sin ninguno, estado del que no se sale desde la interfaz.

## 18. Anclas de ambito en la base de datos

La FK compuesta `(projectId, orgId)` estaba aplicada a **una** de las cinco
relaciones que la necesitan. Las otras cuatro dependian solo de que el
servicio recordase comprobarlas, aunque el principio declarado en la seccion 8
sea que el ambito se deriva del objeto.

La base de datos aceptaba sin rechistar: un issue con el estado o la columna
de otro proyecto, un issue cuyo padre vive en otro proyecto, una union
issue-etiqueta entre organizaciones distintas, y una columna cableada al
estado de otro proyecto.

Ahora las cinco son compuestas:

| Relacion | Ancla |
|----------|-------|
| `Issue.project` | `(projectId, orgId)` |
| `Issue.state` | `(stateId, projectId)` |
| `Issue.column` | `(columnId, projectId)` |
| `Issue.parent` | `(parentId, projectId)` |
| `IssueLabel` | `(issueId, orgId)` y `(labelId, orgId)` |
| `BoardColumn.state` | `(stateId, projectId)` |

Las tres de `projectId` salen casi gratis: `projectId` ya estaba en `Issue`,
solo hace falta un indice unico de destino. La de `IssueLabel` cuesta una
columna en la tabla de mayor fan-out, y es la que mas importa: `filterOrgLabels`
descarta los identificadores ajenos **en silencio**, asi que un fallo que lo
esquive falla ABIERTO. Hay cinco pruebas que escriben directamente contra la
base de datos, saltandose la capa de servicio, para comprobar que cada una
rechaza.

### Una consecuencia que conviene saber

`ON DELETE SET NULL` sobre una FK compuesta pone a NULL **todas** sus columnas
salvo que se nombre una sola (sintaxis de PostgreSQL 15+ que Prisma no genera).
Como `projectId` es NOT NULL, eso violaria la restriccion. Por eso `column` y
`parent` usan `NoAction`: borrar una columna que todavia tiene tarjetas falla,
en vez de mandarlas al backlog por su cuenta. Es lo correcto — quien anada esa
funcion tendra que mover las tarjetas explicitamente — pero es un cambio de
comportamiento respecto a lo que habria hecho `SetNull`.

## 19. Retencion

`ProjectEvent` crecia sin limite y casi todo lo que guarda es ilegible por
diseno: el stream solo reproduce 500 eventos hacia atras y un hueco mayor se
resuelve con un `resync`. `Session` tenia el mismo problema por el otro lado:
`readSession` solo borra la fila que acaba de mirar, asi que las sesiones de
quien no vuelve se quedan para siempre.

`npm run db:prune` barre las dos. Borra en lotes de 10 000, no de una: un
DELETE de millones de filas mantiene un bloqueo largo y dispara el WAL. Es un
script y no una ruta HTTP a proposito — un endpoint de mantenimiento es una
superficie publica mas que habria que autenticar.

Pendiente para produccion: engancharlo a un cron diario.
