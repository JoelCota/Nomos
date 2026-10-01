# Servidor de Nomos

Una API pequeña en **Cloudflare Workers** con una base de datos **D1**. Guarda tus hábitos, su registro diario, tus tareas y el historial del Pomodoro, para que Nomos los sincronice entre tu PC y otros dispositivos.

- Es **tuyo**: vive en tu cuenta de Cloudflare, protegido con un token que solo tú conoces.
- Es **gratis** para uso personal. El plan gratuito permite 100 000 peticiones al día; cada dispositivo con Nomos abierto usa unas 3 000.
- Es **opcional**: sin servidor, Nomos sigue funcionando igual, solo en tu PC.

## Publicarlo (unos 10 minutos)

Necesitas [Node.js](https://nodejs.org) (el mismo que usas para Nomos) y una cuenta gratuita de [Cloudflare](https://dash.cloudflare.com/sign-up). Todos los comandos van en PowerShell, dentro de la carpeta `server` del proyecto:

```powershell
cd server
npm install
```

**1. Inicia sesión en Cloudflare.** Se abre el navegador para que autorices a Wrangler, la herramienta de Cloudflare:

```powershell
npx wrangler login
```

**2. Crea la base de datos:**

```powershell
npx wrangler d1 create nomos
```

Copia el `database_id` que aparece y pégalo en `wrangler.toml`, en lugar de `00000000-0000-0000-0000-000000000000`. Si Wrangler te pregunta si quiere añadir la base de datos a tu configuración, responde **No**: ya está en el archivo.

**3. Crea las tablas:**

```powershell
npx wrangler d1 migrations apply nomos --remote
```

**4. Genera tu token** (una contraseña larga y aleatoria) y guárdalo en tu gestor de contraseñas:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**5. Guárdalo en Cloudflare.** Pega el token cuando te lo pida:

```powershell
npx wrangler secret put NOMOS_TOKEN
```

**6. Publica:**

```powershell
npx wrangler deploy
```

La primera vez, Cloudflare te pide elegir un subdominio de `workers.dev`. Al terminar verás la dirección de tu servidor, algo como `https://nomos-api.tu-cuenta.workers.dev`.

**7. Comprueba que responde.** Abre `https://nomos-api.tu-cuenta.workers.dev/api/health` en el navegador. Debe mostrar `{"ok":true,"app":"nomos","version":1}`.

**8. Conecta Nomos.** En el Panel de control, ve a **Sincronización**, pega la dirección y el token, y pulsa **Conectar**. Lo que ya tenías en la PC se sube al servidor.

### Si pierdes o filtras el token

Genera otro (paso 4), guárdalo con `npx wrangler secret put NOMOS_TOKEN` y vuelve a conectar cada dispositivo con el nuevo. El token anterior deja de funcionar al instante.

### Actualizar el servidor

Cuando una versión nueva de Nomos cambie el servidor, ejecuta desde esta carpeta:

```powershell
npm install
npx wrangler d1 migrations apply nomos --remote
npx wrangler deploy
```

## Cómo funciona

Cada dato es un **documento** con una colección y un id: `habits/<id>`, `habitLog/<día>|<hábito>`, `tasks/<id>`, `focusSessions/<id>`. Cada cambio lleva la hora del dispositivo que lo hizo, y **gana el más reciente** de cada documento. Al borrar, queda una marca de borrado para que los demás dispositivos también lo borren.

Cada cambio aceptado recibe un número de secuencia (`seq`) global. Cada dispositivo recuerda el último que vio y pide solo lo nuevo. La primera vez que un dispositivo se conecta, gana lo que ya hay en el servidor, y lo que solo existía en ese dispositivo se sube.

### API

Todas las rutas, salvo `/api/health`, piden la cabecera `Authorization: Bearer <token>`.

| Ruta | Qué hace |
|---|---|
| `GET /api/health` | Comprueba que el servidor responde (sin token) |
| `GET /api/me` | Comprueba el token; devuelve la secuencia actual |
| `GET /api/sync?since=<seq>` | Cambios posteriores a `seq` (máx. 500; `more: true` si hay más) |
| `POST /api/sync` | Sube cambios: `{ device, changes: [{ collection, id, data, deleted?, updatedAt }] }` (máx. 200) |

`POST /api/sync` responde con `applied` o `stale` para cada cambio. `stale` significa que el servidor ya tenía una versión más nueva, y la devuelve.

## Desarrollo

```bash
npm test                          # API + motor de sincronización con varios dispositivos simulados
node test/local-server.js 8787 dev-token   # servidor local con una base de datos temporal
```

Para probar Nomos contra el servidor local, conéctalo en el Panel con `http://127.0.0.1:8787` y el token `dev-token`.
