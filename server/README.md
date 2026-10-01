# Servidor de Nomos

Una API pequeña en **Cloudflare Workers** con una base de datos **D1**. Hace tres cosas:

- **Sincroniza** tus hábitos, su registro diario, tus tareas y el historial del Pomodoro entre tu PC y tus otros dispositivos.
- **Sirve la app del celular**: la abres en Safari y la agregas a tu pantalla de inicio.
- **Manda los recordatorios** de tus hábitos al celular, aunque la PC esté apagada.

Características:
- Es **tuyo**: vive en tu cuenta de Cloudflare. La PC usa tu token maestro y cada celular tiene su propia llave, que puedes revocar.
- Es **gratis** para uso personal. El plan gratuito permite 100 000 peticiones al día; cada dispositivo abierto usa unas 3 000.
- Es **opcional**: sin servidor, Nomos sigue funcionando igual, solo en tu PC.

## Publicarlo por primera vez (unos 10 minutos)

Necesitas [Node.js](https://nodejs.org) (el mismo que usas para Nomos) y una cuenta gratuita de [Cloudflare](https://dash.cloudflare.com/sign-up). Todos los comandos van en PowerShell. Empieza en la carpeta del proyecto:

```powershell
npm install
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

Copia el `database_id` que aparece y pégalo en `wrangler.toml`, en lugar de `00000000-0000-0000-0000-000000000000`. Si Wrangler pregunta si quiere añadir la base de datos a tu configuración, responde **No**: ya está en el archivo.

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

**6. Publica** (compila la app del celular y sube todo):

```powershell
npm run deploy
```

La primera vez, Cloudflare te pide elegir un subdominio de `workers.dev`. Al terminar verás la dirección de tu servidor, algo como `https://nomos-api.tu-cuenta.workers.dev`.

**7. Comprueba que responde.** Abre `https://nomos-api.tu-cuenta.workers.dev/api/health` en el navegador. Debe mostrar `{"ok":true,"app":"nomos",...}`.

**8. Conecta Nomos.** En el Panel de control, ve a **Sincronización**, pega la dirección y el token, y pulsa **Conectar**. Lo que ya tenías en la PC se sube al servidor.

## Actualizar el servidor

Cada vez que una versión nueva de Nomos cambie el servidor o la app del celular, ejecuta desde la carpeta del proyecto:

```powershell
npm install
cd server
npm install
npx wrangler d1 migrations apply nomos --remote
npm run deploy
```

Las migraciones que ya se aplicaron se saltan solas.

## La app del celular

1. En Nomos en tu PC: **Panel → Sincronización → Vincular un celular**. Aparecen un código y un QR que valen 10 minutos.
2. En el iPhone, escanea el QR con la cámara (o abre la dirección de tu servidor en Safari).
3. En Safari: **Compartir → «Agregar a pantalla de inicio»**.
4. Abre **Nomos** desde tu pantalla de inicio, escribe el código y pulsa **Vincular**.
5. En **Ajustes → Notificaciones**, pulsa **Activar** y acepta el permiso. Puedes elegir si te avisa **siempre**, **solo con la PC apagada** (cuando Nomos en tu PC lleva 3 minutos sin conectarse) o **nunca**.

En iPhone, las notificaciones web necesitan iOS 16.4 o posterior y que la app esté en la pantalla de inicio: desde una pestaña de Safari no funcionan. iOS no muestra botones dentro de estas notificaciones; al tocar una, se abre la app.

Los recordatorios usan las horas que configuras en Nomos en tu PC (cada hábito, el resumen de la noche y la hora de inicio del día) y la zona horaria de la PC.

### Si pierdes un celular

En **Panel → Sincronización**, pulsa **Desvincular** junto a ese celular. Su llave deja de funcionar al instante.

### Si pierdes o filtras el token maestro

Genera otro (paso 4), guárdalo con `npx wrangler secret put NOMOS_TOKEN` y vuelve a conectar Nomos en tu PC. Los celulares vinculados siguen funcionando, porque tienen su propia llave.

## Cómo funciona

Cada dato es un **documento** con una colección y un id: `habits/<id>`, `habitLog/<día>|<hábito>`, `tasks/<id>`, `focusSessions/<id>` y `habitSettings/main` (los ajustes de hábitos que sube la PC). Cada cambio lleva la hora del dispositivo que lo hizo, y **gana el más reciente** de cada documento. Al borrar, queda una marca de borrado para que los demás dispositivos también lo borren.

Cada cambio aceptado recibe un número de secuencia (`seq`) global. Cada dispositivo recuerda el último que vio y pide solo lo nuevo. La primera vez que la PC se conecta, gana lo que ya hay en el servidor, y lo que solo existía en la PC se sube.

Cada minuto, un *Cron Trigger* revisa qué recordatorios tocan y los manda con **Web Push**: el contenido va cifrado (`aes128gcm`) y el servidor se identifica con VAPID. Las llaves VAPID se crean solas la primera vez y se guardan en tu base de datos.

### API

Las rutas piden la cabecera `Authorization: Bearer <token>`, salvo `/api/health` y `/api/pair/claim`. «PC» significa que solo vale el token maestro; «celular», que solo vale la llave de un celular vinculado.

| Ruta | Quién | Qué hace |
|---|---|---|
| `GET /api/health` | todos | Comprueba que el servidor responde |
| `GET /api/me` | PC o celular | Comprueba el token; devuelve el rol y la secuencia actual |
| `GET /api/sync?since=<seq>` | PC o celular | Cambios posteriores a `seq` (máx. 500; `more: true` si hay más) |
| `POST /api/sync` | PC o celular | Sube cambios: `{ device, changes: [{ collection, id, data, deleted?, updatedAt }] }` (máx. 200); responde `applied` o `stale` por cambio |
| `POST /api/pair/start` | PC | Crea un código de vinculación (10 min, un solo uso) |
| `POST /api/pair/claim` | todos | `{ code, name }` → llave del celular |
| `GET /api/devices` · `DELETE /api/devices/<id>` | PC | Lista y desvincula celulares |
| `GET` · `PATCH` · `DELETE /api/device` | celular | Este celular: avisos (`notify`: `always`, `away` o `never`), nombre, desvincular |
| `GET /api/push/key` | PC o celular | Llave pública VAPID |
| `POST` · `DELETE /api/push/subscribe` | celular | Activa o quita las notificaciones de este celular |
| `POST /api/push/test` | celular | Manda una notificación de prueba |

## Desarrollo

```bash
npm test                                   # API, celulares, Web Push, recordatorios y el motor de sincronización
node test/local-server.js 8787 dev-token   # servidor local con una base de datos temporal (sirve la app compilada)
npm run dev:web                            # (en la raíz) la app del celular con recarga en caliente, usando ese servidor
```

Para probar Nomos contra el servidor local, conéctalo en el Panel con `http://127.0.0.1:8787` y el token `dev-token`.
