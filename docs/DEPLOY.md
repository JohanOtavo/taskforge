# Despliegue

TaskForge no es una aplicación estática: necesita **un proceso Node vivo** (las
conexiones SSE del tiempo real duran minutos u horas) y **Postgres con una
conexión en modo sesión** (`LISTEN/NOTIFY` no sobrevive a un pooler
transaccional). Eso descarta la mayoría de los planes gratuitos *serverless*,
que cortan la petición a los pocos segundos.

Lo que sí funciona, comprobado contra los precios de octubre de 2026.

## Qué opción elegir

| Opción | Coste | Siempre encendido | Trabajo de montaje |
|--------|-------|-------------------|--------------------|
| **A. Render + Neon** | 0 € | No: duerme a los 15 min sin tráfico, despierta en ~1 min | 15 minutos, todo por web |
| **B. Northflank Sandbox** | 0 € | Sí | 20 minutos; puede pedir tarjeta |
| **C. VPS gratuito (Oracle Cloud Always Free)** | 0 € | Sí | 1–2 horas: SSH, dominio, TLS |

**Empieza por A.** Es la que menos puede salir mal y el único inconveniente
real es el arranque en frío de la primera visita del día. Si molesta, B y C
quitan ese arranque sin coste.

Lo que **no** sirve, para ahorrarte la búsqueda:

- **Postgres gratuito de Render**: caduca 30 días después de crearlo y luego
  queda inaccesible. Por eso la base va en Neon, no en Render.
- **Vercel / Netlify / Cloudflare en plan gratuito**: su modelo de función
  corta las respuestas largas, y el SSE de un tablero abierto no cabe.
- **Fly.io**: ya no tiene plan gratuito; la máquina más pequeña siempre
  encendida son unos 2,19 $/mes.
- **Koyeb**: su plan gratuito cerró a nuevas cuentas en febrero de 2026.
- **Railway, Heroku**: sin plan gratuito.

---

## Opción A — Render (aplicación) + Neon (base de datos)

### 1. Base de datos en Neon

1. Crea un proyecto en [neon.com](https://neon.com) (plan Free: 100
   CU-horas/mes, ~0,5 GB).
2. En *Connect*, copia **dos** URL del mismo proyecto:
   - con `-pooler` en el host → esta es `DATABASE_URL`
   - sin `-pooler` → esta es `DATABASE_URL_DIRECT`
3. Añade `?sslmode=require` a las dos si no lo traen.

> Si las dos apuntan al pooler, la aplicación arranca, el tablero se ve y el
> tiempo real **deja de funcionar en silencio**: los cambios de otra persona
> no aparecen hasta recargar. Es el fallo más fácil de cometer aquí.

### 2. Migraciones, desde tu máquina

Las migraciones **no** se aplican al arrancar el contenedor a propósito: dos
réplicas arrancando a la vez competirían por el mismo bloqueo. Se aplican una
vez, a mano, antes del primer despliegue:

```bash
DATABASE_URL="<url-pooler>" DATABASE_URL_DIRECT="<url-directa>" npx prisma migrate deploy
```

Repítelo cada vez que añadas una migración nueva.

**No ejecutes `npm run db:seed` contra la base de producción.** Crea cuatro
cuentas de demostración con una contraseña que está escrita en el README:
cualquiera entraría como propietario de la organización. En producción, la
primera persona que se registra crea su espacio de trabajo y es su
propietaria.

### 3. Aplicación en Render

El repositorio ya trae `render.yaml`, así que no hay que rellenar formularios:

1. En [dashboard.render.com](https://dashboard.render.com) → **New** →
   **Blueprint**, y elige este repositorio.
2. Render lee `render.yaml` y pide las tres variables marcadas `sync: false`:
   - `DATABASE_URL` y `DATABASE_URL_DIRECT` de Neon
   - `APP_URL`: déjalo en `https://taskforge.onrender.com` de momento
3. Despliega. El primer `docker build` tarda unos minutos.
4. Cuando Render te dé la URL definitiva, **corrige `APP_URL`** con ella y
   vuelve a desplegar.

`APP_URL` no es decorativo: alimenta la comprobación de origen de las Server
Actions. Si no coincide con el dominio real, todos los formularios responden
403 y el registro parece roto.

### 4. Comprobar

```bash
curl -i https://<tu-app>.onrender.com/api/health
```

`{"ok":true}` significa que el proceso vive **y** que alcanza la base de
datos. Luego, en el navegador: regístrate, crea un espacio de trabajo, crea un
tablero, arrastra una tarjeta.

Para el tiempo real, abre el mismo tablero en dos pestañas y mueve una tarjeta
en una: debe moverse en la otra sin recargar. Si no se mueve, el problema está
en `DATABASE_URL_DIRECT` (paso 1).

### Lo que notarán tus usuarios

- **Primera visita del día lenta.** La instancia gratuita duerme a los 15
  minutos sin tráfico y tarda ~1 minuto en despertar.
- **Al dormirse se corta el SSE.** El cliente reconecta solo y recupera los
  eventos perdidos por su cursor, así que no se pierde nada; solo se ve el
  indicador en "Conectando…" un momento.
- **Las invitaciones no llegan por correo.** El MVP no envía correo: quien
  invita copia el enlace y lo manda por su cuenta. Si la dirección ya tiene
  cuenta, entra en el acto y no hace falta enlace.

### Invitaciones por correo

Con `SMTP_URL` y `EMAIL_FROM` puestas, al invitar a alguien que todavía no
tiene cuenta **el enlace le llega por correo** y deja de mostrarse en pantalla
—es un token de acceso, y no conviene tenerlo a la vista si ya viajó por su
canal—. Sin esas dos variables no cambia nada respecto a antes: la interfaz
enseña el enlace para pasarlo a mano.

> **En Render no uses SMTP.** El plan gratuito bloquea el puerto saliente: la
> conexión a `smtp-relay.brevo.com:587` expira sin llegar a abrirse
> (`ETIMEDOUT` en `command: 'CONN'`). Es una medida antispam habitual en
> hosting compartido, y no se nota en desarrollo porque desde tu máquina sí
> funciona. Ahí hay que enviar por **HTTPS**: define `BREVO_API_KEY` con una
> clave API v3 de Brevo y la aplicación usa `api.brevo.com` por el puerto 443,
> que nunca se bloquea. `SMTP_URL` queda para servidores propios y para
> desarrollo; si están las dos, manda la API.

Vale cualquier SMTP. Dos caminos gratuitos:

| | Gmail | Brevo |
|---|---|---|
| Cuenta nueva | no, usas la tuya | sí |
| Límite | ~500 correos/día | 300/día |
| Remitente | tu propia dirección | cualquiera verificada |
| Riesgo | si filtras la clave, es tu buzón | aislado de tu correo personal |

Con **Gmail**: activa la verificación en dos pasos, crea una *contraseña de
aplicación* en [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
y usa:

```
SMTP_URL=smtps://tu-correo@gmail.com:LA_CLAVE_DE_APP@smtp.gmail.com:465
EMAIL_FROM=TaskForge <tu-correo@gmail.com>
```

Compruébalo **antes** de confiarle las invitaciones reales:

```bash
npm run email:test -- tu-correo@ejemplo.com
```

Ese comando verifica credenciales y conexión y luego manda un correo de
ejemplo. Sin `SMTP_URL` usa un buzón temporal de Ethereal y devuelve una URL
para ver cómo queda el mensaje, sin enviar nada a nadie.

Si el envío falla en producción, **la invitación no se pierde**: ya está en la
base de datos, el error queda en el log y la interfaz vuelve a mostrar el
enlace.

### Mantenerla despierta (descanso de 02:00 a 06:00)

El repositorio trae `.github/workflows/keep-awake.yml`: hace `GET /api/ping`
cada 14 minutos (Render duerme a los 15) y no se ejecuta entre las 02:00 y las
06:00. Esas cuatro horas de descanso no son solo por elegancia: 20 h × 30 días
= **600 horas de instancia**, con margen frente al tope de 750 del plan
gratuito. Despierta 24/7 serían 744, sin margen ninguno.

**El ping no toca la base de datos, y es a propósito.** Render solo necesita
una petición HTTP. Si el ping consultara Postgres, despertaría también el
cómputo de Neon cada 14 minutos: 0,25 CU × 20 h × 30 días ≈ **150 CU-horas**
contra las 100 del plan gratuito, y la base se suspendería a mitad de mes por
mantener viva una aplicación que nadie estaba usando. Por eso hay dos rutas:
`/api/ping` (sin base, para el cron) y `/api/health` (con base, para el
comprobador de Render y para diagnosticar).

Para activarlo:

1. **Settings → Secrets and variables → Actions → Variables**, nueva variable
   `APP_URL` con tu URL de Render. Es variable, no secreto: la URL es pública.
2. La hora del cron es **UTC siempre**. El archivo viene configurado para
   UTC-5 (Bogotá, Lima); si tu zona es otra, cambia la lista de horas por la
   de tu fila, están en el comentario de cabecera.
3. Pruébalo a mano: pestaña **Actions → keep-awake → Run workflow**.

Dos límites que conviene saber antes de confiar en esto:

- **En un repositorio privado no cabe.** Actions cobra por trabajo redondeando
  al minuto: 86 pings al día ≈ **2.580 minutos al mes** contra los 2.000
  gratuitos. Y no se arregla espaciando el ping, porque pasar de 15 minutos es
  justo lo que deja dormir a Render. Las salidas son dos: repositorio
  **público** (Actions sin límite de minutos), o un **pinger externo**
  (cron-job.org o UptimeRobot en plan gratuito: eligen zona horaria y rango de
  horas en su propia interfaz, y no gastan minutos de Actions). Si el
  repositorio va a seguir privado, usa el pinger externo y deja este workflow
  desactivado.
- **El cron de GitHub no es puntual:** en horas punta se retrasa y a veces se
  salta ejecuciones, así que esto reduce los arranques en frío, no los
  elimina. Además GitHub desactiva los workflows programados tras 60 días sin
  actividad en el repositorio.

> Si ves que las CU-horas de Neon se consumen sin que nadie use la aplicación,
> el culpable es el comprobador de salud de Render llamando a `/api/health`:
> cambia `healthCheckPath` a `/api/ping` en `render.yaml`. Pierdes la
> validación de la base de datos en cada despliegue, pero dejas de gastar la
> cuota.

---

## Opción B — Northflank Sandbox

Mismo contenedor, sin dormir, y el plan gratuito incluye una base de datos
gestionada, así que no hace falta Neon.

1. En [northflank.com](https://northflank.com/pricing), plan **Sandbox**
   (2 servicios + 1 base de datos; puede pedir tarjeta sin cobrar).
2. **Addon → PostgreSQL.** Copia su URI de conexión: va en `DATABASE_URL` y en
   `DATABASE_URL_DIRECT` (es Postgres directo, sin pooler en medio).
3. **Service → Build from Git repository**, tipo *Dockerfile*, puerto 3000,
   health check `/api/health`.
4. Variables: las mismas que `render.yaml` (`NODE_ENV`, `PORT`,
   `DATABASE_URL`, `DATABASE_URL_DIRECT`, `APP_URL`, `SCRYPT_N`,
   `PASSWORD_HASH_CONCURRENCY`, `UV_THREADPOOL_SIZE`).
5. Migraciones igual que en A.2.

---

## Opción C — VPS gratuito (Oracle Cloud Always Free)

Una máquina ARM gratuita indefinidamente, con bastante más memoria que
cualquier plan gratuito de PaaS. A cambio: tarjeta para verificar la cuenta,
SSH y TLS por tu cuenta.

```bash
git clone <tu-repo> && cd taskforge
printf 'POSTGRES_PASSWORD=%s\nAPP_URL=https://tu-dominio\n' "$(openssl rand -base64 24)" > .env.prod
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker-compose.prod.yml exec app npx prisma migrate deploy
```

`docker-compose.prod.yml` levanta la aplicación y su Postgres, y publica el
puerto **solo en localhost**. Falta poner delante un proxy con TLS (Caddy son
tres líneas y saca el certificado solo). Sin HTTPS la cookie de sesión lleva
`Secure` y el navegador no la guarda: no podrás iniciar sesión.

Con memoria de sobra, **borra `SCRYPT_N` y `PASSWORD_HASH_CONCURRENCY`** para
volver al coste de hash completo.

---

## Después del primer despliegue

- [ ] `APP_URL` es el dominio real y público.
- [ ] `DATABASE_URL_DIRECT` no pasa por el pooler (comprobado con dos
      pestañas, no leyendo la variable).
- [ ] La base **no** tiene datos de `db:seed`.
- [ ] Barrido de eventos y sesiones caducadas. En Render el plan gratuito no
      tiene cron, así que lánzalo desde GitHub Actions (`schedule`) o desde tu
      máquina:
      `DATABASE_URL=... DATABASE_URL_DIRECT=... npm run db:prune`
- [ ] HSTS y CSP en el proxy. `next.config.ts` ya pone `nosniff`,
      `X-Frame-Options` y `Referrer-Policy`, pero esas dos dependen del
      dominio.
- [ ] El límite por IP cuenta `x-forwarded-for`, que el cliente puede
      falsificar si el proxy no la reescribe. El límite por correo es el que
      sostiene la defensa hoy; ver [SECURITY.md](SECURITY.md).

## Memoria: por qué el coste del hash baja en el plan gratuito

Una instancia gratuita tiene 512 MiB. El hash de contraseña usa los parámetros
de OWASP (scrypt N=2^17, ~128 MiB por hash) y permite dos a la vez: 256 MiB de
pico solo en hashear, y el contenedor muere antes de responder al login.

`SCRYPT_N=65536` y `PASSWORD_HASH_CONCURRENCY=1` dejan el pico en ~64 MiB.
Sigue siendo un coste alto para quien robe la base, pero es menor que el
recomendado: es una concesión al tamaño de la máquina, no una mejora. Los
parámetros se guardan dentro de cada hash, así que al mudarte a una instancia
con más memoria basta borrar las dos variables: las contraseñas nuevas vuelven
al coste completo y las existentes siguen funcionando.
