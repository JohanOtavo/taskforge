# Seguridad

## Aislamiento entre inquilinos

Tres capas, de fuera hacia dentro.

**1. Autorización de aplicación.** Todo acceso pasa por `src/server/authz/resolve.ts`. El
ámbito se deriva siempre del objeto pedido (issue, proyecto, organización), nunca de un
identificador que venga del cliente.

**2. Identificadores hijos acotados.** Un servicio nunca acepta un identificador hijo suelto.
`updateIssue` no hace `where: { id }`, sino que resuelve el proyecto primero. Un `columnId`,
un `labelId` o un `assigneeId` del cuerpo de la petición se validan contra el ámbito
resuelto: la columna debe pertenecer al proyecto, la etiqueta y la persona asignada a la
organización. Esta es la clase de fallo (IDOR) que más fácil se cuela, porque la comprobación
de permisos sí pasó.

**3. Respaldo en la base de datos.** Las cinco relaciones que cruzan ámbito llevan clave
foránea compuesta: `Issue.project` por `(projectId, orgId)`; `Issue.state`, `Issue.column`,
`Issue.parent` y `BoardColumn.state` por `(…, projectId)`; e `IssueLabel` por `(issueId, orgId)`
y `(labelId, orgId)`. Ejemplo del ancla principal:

```sql
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_projectId_orgId_fkey"
  FOREIGN KEY ("projectId", "orgId") REFERENCES "Project"("id", "orgId");
```

Un issue cuyo `orgId` no coincida con el de su proyecto es **inexpresable**, aunque alguien
escriba directamente contra la base de datos saltándose la capa de servicio. Hay dos pruebas
que lo verifican a ese nivel.

### La prueba que lo sostiene

`tests/integration/tenant-isolation.test.ts` recorre los servicios y los invoca como
usuario de la organización B pasando identificadores de la organización A. Sin esa matriz,
el aislamiento dependería de recordar un `where` en cada consulta nueva, y basta un olvido.

Qué **no** cubre todavía, dicho explícitamente para que nadie la lea como una garantía
completa: `acceptInvite` —la única función cuyo propósito es conceder pertenencia
cruzada— y los casos de `createIssue` / `updateIssue` con un `stateId`, `parentId`,
`assigneeId` o `labelIds` de otra organización. El código valida los cinco, cada uno con
su comprobación en el servicio, pero la matriz no se daría cuenta si alguien los quitara.

Al añadir una función de servicio, añade su caso a esa matriz.

## Autenticación

- **Contraseñas:** `scrypt` con los parámetros de OWASP (N=2^17, r=8, p=1, ~128 MiB). Los
  parámetros se guardan dentro del hash, así que el coste se puede subir sin invalidar las
  contraseñas existentes. La comparación usa `timingSafeEqual` con comprobación previa de
  longitud. Un hash manipulado con una N enorme se rechaza antes de calcular nada: si no,
  sería una denegación de servicio gratuita.
- **Concurrencia de hashing limitada a 2.** 128 MiB por hash y diez inicios de sesión
  simultáneos son 1,3 GB. Además `crypto.scrypt` corre en el threadpool de libuv (4 hilos por
  defecto), así que sin límite los hashes bloquean `fs` y `dns` de todo el proceso. En
  producción, sube también `UV_THREADPOOL_SIZE`.
- **Sesiones:** token aleatorio de 256 bits, cookie `httpOnly` + `SameSite=Lax` + `Secure` en
  producción. La base de datos guarda solo el hash SHA-256: un volcado de la tabla no permite
  suplantar a nadie.
- **Mismo mensaje de error** para usuario inexistente y contraseña incorrecta. Distinguirlos
  convierte el formulario en un oráculo de cuentas existentes. Hay una prueba que compara
  ambos mensajes.
- **Coste constante ante un usuario inexistente.** `verifyPassword` calcula un hash
  desechable con los mismos parámetros cuando no hay usuario. Sin eso, el login responde en
  ~1 ms para una dirección que no existe y en ~300 ms para una que sí: un oráculo de
  enumeración que ningún mensaje idéntico tapa. Hay una prueba que compara los dos tiempos,
  no solo los dos mensajes.
- **Límite de intentos** por IP y por correo, tanto en login como en registro.

  Aviso sobre la mitad "por IP": la dirección sale de `x-forwarded-for`, una cabecera que
  el cliente puede falsificar, y Next la acepta tal cual cuando ningún proxy la reescribe.
  **Detrás de un proxy que no la sanee, el límite por IP no limita nada**: basta con variar
  la cabecera en cada petición. La mitad por correo sí es efectiva, y es la que sostiene la
  defensa hoy. Antes de producción, deriva la IP de una cabecera que ponga tu propio proxy,
  o cuenta saltos de confianza desde la derecha.

## Invitaciones

- Token de 256 bits; la base de datos guarda solo su hash.
- Caducan a los 7 días, son de un solo uso y emitir una nueva revoca la pendiente anterior:
  un único camino de entrada vivo por persona.
- **Solo las puede aceptar la dirección a la que se enviaron.** Permitir otra cuenta sería una
  vía de escalada: quien tuviera el enlace entraría con la identidad que quisiera.
- La aceptación se hace con un `POST`, no al cargar la página. Un `GET` que muta estado lo
  dispara cualquier precargador de enlaces o antivirus que visite el correo, y la invitación
  se consumiría sola.

## Validación de entrada

Zod en todos los límites, con `.strict()` en cada esquema. Descartar claves desconocidas es
lo que impide una asignación masiva de `orgId`, `role` o `version`. Los esquemas tienen su
propia batería de pruebas (`src/server/modules/issues/schema.test.ts`).

El servicio de registro **también** normaliza el correo, no solo el esquema: un script o un
seed que llame al servicio directamente no debe poder crear una segunda cuenta para el mismo
correo con otras mayúsculas. La base de datos lo respalda con un índice único sobre
`lower(email)`.

## El middleware NO autoriza

`src/middleware.ts` solo comprueba que **existe** la cookie, porque el runtime edge no puede
consultar la base de datos. Una cookie falsificada pasa ese filtro y falla después en
`requireCtx`. No añadas comprobaciones de permisos ahí dándolas por buenas.

## Puntos que se suelen olvidar

- **El stream SSE necesita el mismo permiso que la lectura.** Sin esa comprobación, cualquiera
  con el identificador del proyecto recibiría todas las mutaciones en tiempo real.
- **La lectura del registro de auditoría también se protege** (`org.audit.read`, mínimo
  `ADMIN`).
- **Una Server Action es un endpoint `POST` público.** Ocultar el botón no autoriza nada; cada
  acción revalida por su cuenta.
- **Colores de etiqueta de una paleta cerrada**, traducidos a variables CSS. Nunca se
  interpola una cadena del usuario dentro de un atributo `style`.

## Antes de producción

- [ ] `DATABASE_URL_DIRECT` apunta a una conexión en modo sesión, no al pooler. Si no, el
      tiempo real deja de funcionar en silencio.
- [ ] `APP_URL` con el dominio real: alimenta `serverActions.allowedOrigins` y los enlaces de
      invitación.
- [ ] `UV_THREADPOOL_SIZE` ≥ 8.
- [ ] Hacer el registro de auditoría realmente de solo-adición:
      `REVOKE UPDATE, DELETE ON "AuditLog" FROM <rol_app>;`
- [ ] Barrido periódico de `Session` caducadas y de `ProjectEvent` con más de 7 días.
- [ ] Rotar las credenciales de `.env.example`: son valores de desarrollo.
- [ ] Revisar las cabeceras de `next.config.ts` y añadir HSTS y CSP en el proxy.
- [ ] Añadir un límite de peticiones a nivel de proxy: el de la aplicación es por proceso y
      con varias réplicas el límite efectivo se multiplica.
