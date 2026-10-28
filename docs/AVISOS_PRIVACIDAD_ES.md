# Avisos de privacidad (API #91/#93): comportamiento y ronda física

## Qué hace Mobile

**Contrato:** `docs/privacy/PRIVACY_NOTICE_CONTRACT.md` de afilianet-api (#91 + #93, `24c7a12`). API confirmó la lectura de Mobile punto por punto antes de implementar.

**Qué es y qué no es:**
- Un aviso es información, no un consentimiento. Lo que se registra es qué versión exacta se mostró, cuándo y en qué paso.
- Los consentimientos por finalidad son decisiones aparte, explícitas y sin nada preseleccionado.
- La app no deduce nada: lee `action_required` y las clases de cambio que manda el servidor.

### Pasos que crean una cuenta o incorporan a una organización

| Paso | Qué se muestra | Qué se envía |
| --- | --- | --- |
| Registro sin organización | Aviso general (`GET /privacy/notice`) | `privacy_notice` + `client_request_id` |
| Unión por referido sin sesión (enlace o código) | Aviso general + suplemento del bloque `privacy` de `GET /organizations/{org}/referrals/{code}` | ambos + `client_request_id` en `/invitations/{token}/accept`. La invitación (`POST …/invitations`) sigue siendo `{}` |
| Unión por referido con sesión | Suplemento siempre; aviso general solo si `GET /me/privacy` dice que falta (`action_required` ≠ `none`). Si no hay respuesta y el paso lo exige, también se muestra | lo mostrado + `client_request_id` |
| Invitación de personal con sesión | Igual que la fila anterior, con el bloque de `GET /staff-invitations/{token}` | lo mostrado + `client_request_id` |

**Reglas comunes:**
- **Avisos a disposición.** Cada aviso tiene «Ver aviso», que abre el texto completo en la app. Abrirlo es opcional y no condiciona el envío.
- **Una casilla explícita, sin preselección.** Es la condición para enviar: «Se pusieron a mi disposición el Aviso de privacidad de Afilianet (versión …) y el aviso de privacidad de … (versión …) antes de continuar.».
  - Lleva debajo la nota fija «Marcar esta casilla no es un consentimiento ni la aceptación de términos.».
  - Es el texto acordado con API, pendiente de revisión jurídica (J4).
  - Vale solo para las versiones listadas: si cambia un documento (409 `privacy_notice_outdated`) o se añade otro (422 `privacy_notice`), se desmarca.
- **Nada afirma lectura.** La app no registra «abierto» ni «leído» por marcar la casilla.
  - API propuso el campo opcional `notice_presentation` (`method`, `opened`), que describe la acción real.
  - Está pendiente de que API lo confirme e implemente. Hasta entonces la app no envía nada nuevo: el cuerpo es el mismo que antes (referencias y `client_request_id`).
- **Se envían las referencias de las versiones listadas y confirmadas** (`version` y `content_sha256` del documento servido), nunca otras.
- **Idempotencia:**
  - el mismo `client_request_id` para todos los reintentos de la misma entrada, y uno nuevo cuando la entrada cambia;
  - un doble toque no envía dos veces.
- **Aviso cambiado durante el formulario** (409 `privacy_notice_outdated`):
  - se vuelve a leer el paso y se muestra la versión nueva, que hay que abrir otra vez;
  - lo escrito se conserva y el intento es el mismo, porque el servidor no escribió nada.
- **El servidor pide el aviso general al unirse con sesión** (422 `privacy_notice`, ejemplo 17d): se muestra y se reenvía el mismo intento.
- **Documento no publicado:**
  - aviso general: 503 `privacy_notice_unavailable`;
  - suplemento: 503 `organization_notice_unavailable` o bloque con `organization_notice: null`.
  - En ambos casos hay texto específico, el formulario se conserva y no se envía nada.
- **Aviso que no carga** (sin conexión, error): se ofrece «Volver a cargar», pero no se bloquea por sí solo. Sin aviso mostrado no se envía su referencia, y el servidor decide si era obligatorio.

### Revisión dentro de la app (`/privacy-review`)

**Acceso:**
- desde Perfil, en «Mis avisos de privacidad»;
- desde el aviso en Inicio;
- y, mientras el servidor bloquea, desde cualquier pantalla.

**Por documento** (aviso general y suplemento de cada organización):
- **Estado:** «Al día», «Actualización informativa» o «Revisión requerida».
- **Detalle:** qué cambió (`summary_of_changes`) y la última versión que se le mostró.
- **Registro:** «Ver aviso» abre el texto completo; es opcional.
  - Una casilla sin preselección: «Se puso a mi disposición la versión … de este aviso.».
  - Habilita «Registrar» en una revisión o «Entendido» en un cambio informativo.
  - Sin abrir el documento se registra la versión vigente que lista `GET /me/privacy`.
  - Cada registro va por documento y, en un suplemento, con su `organization_id`.
- **Versión cambiada:** si el servidor tiene otra versión (409, o el documento abierto no coincide), no se registra la anterior y se vuelven a leer los estados. La tarjeta muestra la nueva versión con la casilla desmarcada.
- **Consentimientos por finalidad:** solo si el documento declara finalidades.
  - Cada finalidad tiene «Sí, acepto» y «No acepto», sin preselección.
  - Se describe la decisión vigente.
  - Si el texto de la finalidad cambió (`text_sha256` distinto), la decisión anterior ya no aplica y se pide una nueva.
  - Hoy ninguna finalidad está definida y la app no inventa ninguna.

**«Informar»:**
- nunca bloquea;
- el aviso de Inicio aparece una vez por versión en este teléfono;
- registrarlo («Entendido») es opcional.

**«Revisar» sin bloqueo del servidor** (`enforce_review: false`): el aviso de Inicio sigue hasta que se revisa.

### Bloqueo del servidor (409 `privacy_notice_review_required`)

**Cuándo se bloquea:**
- **Fuentes:** cualquier respuesta 409 con ese `reason` y `GET /me/privacy` con `enforce_review: true`.
- **Aviso general pendiente:** bloquea todo.
- **Suplemento pendiente:** solo bloquea mientras esa organización es la activa, como en el servidor.

**Qué hace la app:**
- La navegación lleva a la revisión antes de elegir organización.
- Las pantallas de error de ese 409 muestran «Revisar aviso de privacidad», nunca «Reintentar».

**Qué sigue accesible** (lo que el servidor exime):
- leer los avisos;
- cerrar sesión;
- salir de una organización;
- solicitar la eliminación de la cuenta;
- los pasos de unión, que muestran los avisos.

**Al terminar:** al registrar lo pendiente, aparece «Continuar» y lo bloqueado se vuelve a cargar.

**Cuenta y respuestas tardías:**
- El bloqueo es de la sesión: se borra al cerrar sesión o cambiar de cuenta.
- Una respuesta que llega después de un cambio de cuenta no bloquea ni desbloquea a la nueva.
- Tampoco escribe datos de la anterior.

**Consulta de #92 durante una revisión pendiente:**
- la comprobación antes de descartar un registro asistido queda en «No pudimos confirmar»;
- nunca reenvía la creación;
- lleva a la revisión.

### Compatibilidad

**Staging hoy** (API `main` 0a0d782, confirmado por API e Infra):
- `GET /privacy/notice` responde 503;
- no hay bloques `privacy`;
- `GET /me/privacy` responde 404.

**Efecto en la app:**
- no muestra nada nuevo;
- los cuerpos son idénticos a los de antes (sin `client_request_id` ni referencias);
- no bloquea.

**Lo que no cambia:**
- **Telemetría:** sigue desactivada; esta rama no toca Sentry ni PostHog.
- **Ajustes de la API:** la app no activa ningún flag. Activar `PRIVACY_NOTICE_REQUIRED` o `PRIVACY_NOTICE_ENFORCE_REVIEW` es decisión de Andrés y espera un APK compatible probado físicamente.

### Fuera de alcance

- **Activación de registro asistido** (`/assisted-enrollments/activate/{token}`): la app no tiene ese flujo, así que no muestra ni envía documentos en ese paso.
- **Recuperación telefónica:** si la activación ocurre por esa vía, la cuenta queda con revisión pendiente y la resuelve en `/privacy-review`.
- **Términos y condiciones:** no existen en el producto y no se muestra nada.
- **Lo que este cambio no hace:** borrar datos, consentimientos retroactivos ni registros a nombre de terceros.

## APK de la prueba física (`privacy-test-apk`)

Es un perfil preparado como draft. **El build todavía no está autorizado.**

**Identidad separada:**
- **App:** paquete `com.afilianet.mobile.privacytest`, nombre «Afilianet PRUEBA avisos» y esquema `afilianetprivacytest`.
- **Instalación:** se instala junto a la beta (vc13) sin reemplazarla.
- **Aislamiento:** cada paquete tiene su propio espacio en Android. El token de sesión, SecureStore, AsyncStorage, los archivos y la copia de seguridad no se comparten. Una sesión de staging nunca llega a la API de prueba.
- **Sin `sharedUserId`.**
- **Esquema `exp+afilianet-mobile`:** lo añade Expo y es el mismo en ambas apps. Solo lo usan las herramientas de desarrollo; nada en la prueba lo emite.

**Sin servicios de la beta:**
- **Variables de EAS:** el perfil usa el entorno `development`, que no tiene ninguna (verificado con `eas env:list`). Así no llegan el archivo de Firebase, el DSN ni el token de Sentry que trae `preview`.
- **Telemetría:** `EXPO_PUBLIC_SENTRY_ENABLED=0`, DSN `disabled`, sin subida de mapas y sin PostHog.
- **Comprobación previa al build:** rechaza Firebase, el token o DSN de Sentry, PostHog, las encuestas y cualquier origen distinto de `https://andres-desk.tail7be8f8.ts.net`.

**API:** `https://andres-desk.tail7be8f8.ts.net`, API desechable accesible solo dentro de Tailscale. **Nunca staging.**

**Selección de la variante:**
- La elige `APP_VARIANT=privacy-test` en el `env` del perfil, no `EAS_BUILD_PROFILE`.
- eas-cli resuelve la configuración localmente sin `EAS_BUILD_PROFILE`, y de ahí toma el paquete para las credenciales y el versionCode remoto.
- Con `EAS_BUILD_PROFILE`, `eas config` resolvía `com.afilianet.mobile`, así que el build `8a8f51c` no se lanzó.

**versionCode:**
- EAS lo guarda por paquete. `eas build:version:get` no devuelve versión para `com.afilianet.mobile.privacytest` y devuelve 13 para `com.afilianet.mobile`.
- El perfil no tiene `extends`. Desde la actualización in situ tiene `autoIncrement: true`, que sube solo el contador de `com.afilianet.mobile.privacytest` (1 → 2): Android solo instala una actualización con un versionCode mayor. El build `d31ee445` se hizo sin él (versionCode 1).
- Tras el build se vuelve a consultar que `store-beta-apk` siga en 13.

**Comprobaciones del artefacto tras el build:**
- paquete y versionCode;
- ausencia de `google-services`;
- ausencia de un DSN con clave y de `phc_`;
- origen de la API dentro del bundle.

## Ronda física breve (cuando se autorice un build)

Requiere un APK con esta rama. Ningún build está autorizado todavía.

**Condiciones:**
- **Teléfono:** de prueba. Nunca la tablet de desarrollo con el cliente de desarrollo.
- **API:** el entorno exclusivo de Mobile que indique API, con cuentas reservadas para Mobile.
- **Datos:** sin datos reales.
- **Sesiones:** cerrar solo las propias; nunca «cerrar sesión en todos lados» en cuentas compartidas.

1. **Requisitos apagados** (instancia sin `REQUIRED`):
   - registrarse sin organización;
   - la pantalla muestra el aviso general publicado;
   - la cuenta se crea igual.
2. **Requisitos encendidos, registro:**
   - la casilla aparece desmarcada; intentar enviar sin marcarla → «Marca la casilla para continuar.»;
   - marcarla (abrir el aviso es opcional) y enviar → la cuenta se crea.
3. **Unión por referido sin sesión:** se ven dos avisos (general y de la organización) y una sola casilla; al marcarla, la cuenta se crea dentro de la organización.
4. **Organización sin suplemento:**
   - mensaje «Esta organización todavía no publica su aviso de privacidad…»;
   - el botón queda inactivo y lo escrito se conserva.
5. **Unión con sesión con el aviso general al día:** solo aparece el aviso de la organización.
6. **Cambio informativo:**
   - Inicio muestra «Actualizamos el aviso de privacidad» una vez y nunca bloquea;
   - en «Mis avisos de privacidad» aparece «Actualización informativa» y qué cambió;
   - «Entendido» lo deja «Al día».
7. **Revisión requerida con bloqueo** (`ENFORCE`):
   - al abrir la app se va a «Avisos de privacidad» con el texto de bloqueo;
   - en otra pantalla, el error ofrece «Revisar aviso de privacidad», no «Reintentar»;
   - cerrar sesión funciona sin revisar;
   - volver a entrar, marcar la casilla y «Registrar» → «Continuar» → Inicio carga.
8. **Dos organizaciones con suplemento pendiente solo en B:**
   - con A activa todo funciona;
   - al cambiar a B se pide la revisión de B;
   - al registrarla, B funciona.
9. **Descarte de un registro asistido con revisión pendiente:**
   - el aviso dice «No pudimos confirmar si el registro… llegó a crearse»;
   - no se crea nada.

**Evidencia por paso:** captura, hora y versión del aviso mostrada.

## Resultado de P1 (2026-10-27) y barra inferior

**Registro con aviso:** correcto. Sin abrir el aviso aparecía «Abre y lee cada aviso…». Al abrirlo quedó «Leído». La cuenta `fisica-registro-a06-01@example.test` se creó.
- **HTTP** (proxy): `POST auth/register` 201.
- **Constancia** (consulta de solo lectura): general `prueba-general.1`, contexto `account_registration`.
- **Captura** (Andrés): sin barra inferior tras omitir la verificación.

**Barra inferior: estado previsto, no defecto.**
- La cuenta tiene 0 membresías: `GET me/organizations` respondió con una lista vacía, y la base lo confirma.
- La navegación la lleva a `no-organization`, que está fuera del grupo de pestañas a propósito (`docs/NAVEGACION_BARRA_INFERIOR_ES.md`, «Acceso»).
- Esa pantalla ofrece unirse con un código o con el selector, ver el perfil y las notificaciones, y cerrar sesión.
- **Mejora:** ahora explica que las secciones y su barra aparecen al unirse a una organización, para que no parezca incompleta.

**Cambio posterior a P1** (este PR, sin build): la casilla sustituye la apertura obligatoria. El APK `d31ee445` de la ronda sigue con el comportamiento anterior.
