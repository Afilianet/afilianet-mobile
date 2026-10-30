# Paquete de lanzamiento del MVP: parte de Mobile

**Estado:** borrador del 2026-10-29. Es la parte de Mobile del documento único que coordina API.

**Este documento no autoriza nada:** ni builds, ni merges, ni publicación, ni instalación, ni envíos reales, ni cambios en EAS.

**Convenciones:**
- **«Probado en físico»:** solo lo ejecutado en un teléfono con un APK concreto. Las pruebas automáticas se nombran aparte.
- **SHA:** se dan a 7 caracteres. Los SHA completos están en cada PR.

## S. Candidata de staging (2026-10-30)

**Va primero:** esta sección prevalece sobre §0–§5 en lo que respecta a staging. El resto del documento sigue describiendo el lanzamiento final.

### Qué es
- **PR #82, base `main`, head `7ad78b6`** (SHA completo `7ad78b6a09efb57ea2a1015a2e744598d167e881`). Borrador.
- **Contiene #81 completo** (`97e0347`: #79 + merge de #78 + perfil `production`) más un commit, A5. Lo comprueba `git merge-base --is-ancestor`.
- **Sin PR nuevo:** no se creó otro. Ninguna rama se modificó; solo cambió la base de #82, de `release/mvp-mobile` a `main`, para revisar el diff completo.
- **CI:** ✅ run 40990377563 sobre ese SHA.
- **Local sobre ese SHA:** `tsc` 0, `eslint` 0, Jest 1090/1090, configuración de build (node:test) en verde.
- **`check-build-env` simulado para `store-beta-apk`:** sin errores. `eas config` (solo lectura) resuelve la API de staging, la telemetría y las encuestas apagadas, y el entorno `preview`.

### Compatibilidad con la API desplegada
- **Staging:** API :62 y Horizon :45 corren `c653ae5`, el merge de API #104 fijado por digest en Infra #179.
- **Mismo código que la prueba de A5:** el árbol de `c653ae5` es idéntico al de `f7f9498`, contra el que se hizo la prueba conjunta local de A5 (4/4).
- **Rutas:** `route:list` de ese árbol (contenedor sin red ni base de datos) frente a todas las llamadas de la app. Cada llamada tiene ruta con el mismo método.
- **Privacidad apagada** (`PRIVACY_NOTICE_PUBLISHED` falso): `GET /privacy/notice` responde 503 y la app lo trata como «no publicado». No hay pasos de aviso ni bloqueo de revisión.
- **Términos KYC sin publicar:** el paso trae `terms_document: null`. La app muestra «todavía no están publicados», **sin botón y sin enviar nada**.
- **Contrato confirmado hoy por API** (en #105, `KYC_TERMS_DECISIONS.md` §5):
  - 409 `terms_not_published` y 409 `terms_document_changed` (releer);
  - 503 `kyc_unavailable`, porque el middleware de captura va antes del controlador;
  - 409 `assisted_access_claimed`.
  - `GET /compliance` no pasa por la captura.
- **Propuesta pendiente de Andrés, fuera de esta candidata:** que en el alta asistida solo acepte la persona desde su propia cuenta (`terms_require_own_session`). En Mobile es un cambio pequeño, de unos 5 archivos más pruebas, y exigiría **otro APK**.

### Alcance del próximo APK de staging respecto a vc13 (`e2e8de1`)
| Cambio | PR | Estado de la prueba física |
|---|---|---|
| Cola asistida: `assisted_access_claimed` y consulta `by-request` antes de descartar | #74 | **Sin prueba física.** Solo la prueba conjunta local 11/11 |
| Avisos de privacidad | #75 | P1–P3 en la app de prueba vc2, contra el entorno desechable. **En staging están apagados:** no se ven |
| Casilla, salida de «Sin organización», selector forzado, cierre único | #77 | Parcial en vc2. **Sin cobertura física:** el cambio de una cuenta sin organización a una con dos, y el registro directo con casilla |
| Texto de recuperación «solicitamos el envío» | #78 | **Solo automático** |
| Orden del cierre de sesión (sin peticiones después) | #79 | **Solo automático** |
| Perfil `production` y landing de referidos configurable | #81 | No afecta a staging: `store-beta-apk` no define la landing, así que el enlace sigue siendo el de staging, igual que en vc13 |
| A5: términos publicados y versionados | #82 | **Solo prueba local** con un documento ficticio. En staging solo se puede ver «no publicados» |
| Perfil `privacy-test-apk` | #76 | No forma parte de este APK (es otro paquete) |

Lo heredado de vc13 (acceso por correo o celular, bloqueo de KYC, telemetría apagada) ya tiene la prueba física del hito A y la prueba breve de vc13.

### Build propuesto (no ejecutado; requiere autorización)
- **Perfil `store-beta-apk`,** el mismo de vc13:
  - `com.afilianet.mobile`, APK de distribución interna;
  - entorno EAS `preview`, con Firebase, así que hay push;
  - API de staging;
  - Sentry y PostHog apagados, encuestas apagadas, WhatsApp apagado (solo SMS).
- **Comando,** desde una copia de trabajo limpia en el SHA exacto:
  ```bash
  git worktree add --detach .claude/worktrees/build-7ad78b6 7ad78b6a09efb57ea2a1015a2e744598d167e881
  cd .claude/worktrees/build-7ad78b6 && npm ci
  npx eas-cli build --platform android --profile store-beta-apk --non-interactive --no-wait --json
  ```
- **EAS:** sin cambios. Ni variables, ni perfiles, ni credenciales.
- **Firma:** sin cambios. Es el keystore remoto de `com.afilianet.mobile`, el de vc12 y vc13.
- **versionCode:** sin cambio previo, pero **el build consume el 14**. Lo asigna `autoIncrement` remoto; el contador es por paquete y lo comparten `store-beta`, `staging` y `production`.
  - Por tanto, el AAB final de producción sería el 15 o posterior.
  - Esto **contradice la idea de reservar el 14 para el MVP** (decisión 3 de §7): Andrés tiene que aceptarlo al autorizar.
  - No hay forma de evitarlo sin cambiar EAS.
- **Verificar en el APK antes de instalarlo:**
  - paquete;
  - versionCode 14;
  - certificado igual al de vc13;
  - permisos bloqueados (sin overlay, sin lectura de almacenamiento, sin audio);
  - ni DSN ni clave `phc_` en el bundle;
  - API de staging.
- **Instalar** sobre vc13 en el Galaxy A06, **nunca en la tablet de desarrollo**.

### Guion de prueba en staging
**Requisitos:**
- cuentas de prueba de staging que entregue API, sin datos reales;
- una organización de prueba con **captura KYC encendida** y `terms_acceptance` exigido, porque en la organización beta, con la captura apagada, la app muestra el bloqueo de KYC y no se llega al paso;
- registro de peticiones del lado de API (CloudWatch), leído por API o Infra.

**Evidencia:** HTTP del servidor, capturas y notas del teléfono, en categorías separadas.

**S0. Antes de actualizar, con vc13 instalado (solo se puede hacer ahora):**
- abrir el paso de términos en la organización con captura encendida;
- vc13 muestra el botón antiguo y envía `{accepted:true}`;
- **esperado:** 409 `terms_not_published`, con el texto del servidor legible y **sin aceptación registrada**; API lo confirma en el registro.

**S1. Actualización:** instalar encima de vc13, sin desinstalar. La sesión y los datos se conservan.

**S2. Acceso:**
1. Entrar con correo y con celular.
2. Registrar una cuenta nueva con correo: no aparece ningún paso de aviso de privacidad, porque está apagada. Un 422 aquí es un hallazgo.
3. Verificación por SMS:
   - con el sandbox actual (B9), comprobar el texto de `503 sms_unavailable` o el de «si no llega en unos minutos…»;
   - un **SMS real** solo con autorización de Andrés y a un número de la lista de #100.
4. Recuperación por correo (#78): el texto «solicitamos el envío…». No se espera que el correo llegue, porque en staging la lista permitida está vacía.
5. Cierre de sesión (#79): en el registro de API debe haber un `DELETE push/devices` y un `auth/logout`, y **ninguna petición después** con ese token.

**S3. Cambio de cuenta y de organización:**
1. Cuenta **sin organización**: se ve la pantalla «Sin organización» con salida (buscar invitación, cerrar sesión).
2. Cerrar sesión y entrar con una cuenta **con dos organizaciones**: el selector es obligatorio y lleva a Inicio **con la barra inferior**. Es el punto sin cobertura física en vc2.
3. Cambiar de organización: Inicio, Red y Cartera muestran la nueva, sin restos de la anterior.
4. Volver a la cuenta sin organización: no aparecen datos de la cuenta anterior.
5. En el registro de API, **ninguna petición con el token de la cuenta anterior**.

**S4. Referidos:**
1. Compartir desde un afiliado activo:
   - el enlace es `https://staging-admin.afilianet.mx/join/{org}/{código}`;
   - WhatsApp se abre con el mensaje prellenado.
2. Abrir el enlace en otro dispositivo: la landing de Admin (:36) permite registrarse con el referido.
   - Sin App Links, el enlace https abre el navegador y no la app. Es lo esperado.
3. Con una cuenta existente, unirse desde la app: se une la **cuenta actual**, sin crear otra. Si ya pertenece, aparece `already_affiliated`.
4. Desde «Sin organización», escribir el código (buscador de invitaciones) y unirse.

**S5. A5. Términos de la verificación.**

*Se puede probar ahora:*
- S0 con vc13: el 409 legible de un build antiguo.
- **Flujo propio:** el paso muestra «Los términos de esta verificación todavía no están publicados», **sin botón**. En el registro de API **no hay ningún `POST …/attempt`** de ese paso.
- Los pasos de identidad anteriores a los términos siguen funcionando.
- **Flujo asistido** (si la organización de prueba tiene activa el alta asistida): el patrocinador ve el mismo «no publicados», sin botón ni aviso de aceptación.
- **Organización con la captura apagada:** la app muestra el bloqueo de KYC. El 503 `kyc_unavailable` del paso de términos **no se puede observar con este APK**, porque no envía nada sin documento.

*Requiere publicar el documento aprobado (bloqueado hoy):*
- **Flujo propio:**
  - ver el documento completo;
  - aceptar;
  - el registro guarda exactamente la versión y el fingerprint, con `accepted_via = own_session`.
- **Flujo asistido:**
  - aparece el aviso;
  - la auditoría distingue al actor (el patrocinador) del sujeto (la persona verificada);
  - si Andrés aprueba la propuesta de #105, este flujo cambia y necesita otro APK.
- **409 por cambio de versión y por retiro,** con el paso abierto: sin aceptación y con recarga correcta.
- Completar un caso hasta la revisión, y volver a aceptar cuando haya una versión nueva.

**Con esta ronda, A5 queda probado en teléfono solo en el estado «no publicado».** No se considera probado en físico hasta cubrir la parte bloqueada.

## 0. Inventario de PR abiertos y cómo integrarlos

### La cadena
Los PR del MVP forman **una sola cadena lineal** sobre `main` (`c95faeb`):

```
main ← #47 ← #49 ← #50 ← #51 ← #52 ← … ← #70 ← #71 ← #72 ← #73 ← #74 ← #75 ← #76 ← #77
                                                                                    ├── #78 (texto de recuperación)
                                                                                    └── #79 (orden del cierre de sesión)
```

- **Comprobación:** cada PR desde #43 hasta #77 es ancestro de #79 (`git merge-base --is-ancestor`).
- **#78 y #79:** son hermanos sobre #77; cada uno aporta 1 commit.
- **Tamaño:** #79 lleva 84 commits sobre `main`.

### Heads actuales y CI
CI se ejecuta por `workflow_dispatch`, porque los PR apilados no disparan CI.

| PR | Rama | Head | CI | Contenido |
|---|---|---|---|---|
| #71 | `feat/api-availability-gates` | `71f4fd3` | ✅ | Respuestas #84/#86 de API. **APK vc12** |
| #72 | `fix/telemetry-beta-off` | `a073af6` | ✅ | Telemetría apagada en store-beta |
| #73 | `fix/assisted-queue-terminal` | `e2e8de1` | ✅ | Cola asistida sin reintentos. **APK vc13** |
| #74 | `fix/assisted-access-claimed` | `3e4d67f` | ✅ | `assisted_access_claimed`; consulta #92 antes de descartar |
| #75 | `feat/privacy-notices` | `52ccdc0` | ✅ | Avisos de privacidad (#91/#93) |
| #76 | `feat/privacy-test-apk` | `fc22fa2` | ✅ | Perfil de la app de prueba |
| #77 | `fix/privacy-notice-checkbox` | `92bae99` | ✅ | Casilla, salida de «Sin organización», «Volver», bloqueo nombrado, cierre único. **APK de prueba vc2** = `067402a` |
| #78 | `fix/recovery-requested-copy` | `32e0a59` | ✅ | Recuperación por correo: «solicitamos el envío» |
| #79 | `fix/logout-before-cache-clear` | `f87c16a` | ✅ | Publicar el cierre antes de limpiar la caché |

### Fuera de la cadena (revisado con `git cherry`)
- **Ya incluidos por equivalencia; se pueden cerrar:**
  - #45: sus dos commits están en la cadena.
  - #54: integrado como `7bb353c` («Integración #55 + #54»).
- **No incluidos y no necesarios para el MVP:**
  - #1: configuración de staging antigua, sustituida por `scripts/select-env.js`.
  - #46: propuestas visuales (demo).

### Integración propuesta (sin ejecutar)
**Actualización del 2026-10-30:** el PR único es ahora **#82**, con base `main`, porque contiene #81 completo más A5 (ver §S). Los pasos siguientes se mantienen, aplicados a #82.

**Principio:** conservar todos los commits y no duplicar ramas.

1. **Rama de lanzamiento:** crear `release/mvp-mobile` desde el head de #79.
2. **Unir #78:** `git merge --no-ff` de `fix/recovery-requested-copy`. Un commit de merge que conserva `32e0a59`.
   - Probado en local sin publicar: sin conflictos, lint 0, suite 1084/1084, configuración de build 17/17.
3. **Un único PR `release/mvp-mobile → main`:**
   - fusionar con **commit de merge**, nunca squash ni rebase, para que los SHA ya probados (`e2e8de1`, `067402a`…) sigan existiendo en `main`;
   - CI sobre su head antes de fusionar.
4. **Cerrar el resto como «incluido en el PR de lanzamiento»:**
   - #43, #47, #49–#79;
   - #45 y #54 como sustituidos.
   - GitHub no los marca como fusionados porque sus bases no son `main`.
5. **No hacer:** rebase de la cadena ni retarget de los PR intermedios a `main`. Duplicaría los commits con SHA nuevos y rompería la trazabilidad con los APK probados.

## 1. Qué entra en el candidato final y qué puede esperar

### Entra
Todo #79 y #78, porque la cadena es acumulativa:
- **Acceso:**
  - correo o celular;
  - verificación **por SMS**;
  - recuperación por correo («solicitamos el envío») y por SMS (texto de la API).
- **Disponibilidad:** `503 sms_unavailable`/`email_unavailable` con texto propio; `kyc_unavailable`.
- **Organización y referidos:**
  - referidos con cuenta existente (`already_affiliated`);
  - staff sin perfil (#75 de API).
- **Registro asistido:** celular o correo; cola sin conexión sin reintentos de rechazos; descarte con consulta #92.
- **Privacidad:**
  - pasos con casilla;
  - revisión, bloqueo nombrado y «Volver»;
  - consentimientos por finalidad **solo si la API los define**;
  - compatible con la API anterior.
- **Navegación:** salida de «Sin organización» y selector forzado.
- **Cierre de sesión:** uno solo, sin reenviar token revocado y sin peticiones tras el logout.
- **Telemetría** desactivada.

### Puede esperar (fuera del MVP o apagado)
- **WhatsApp como canal del código:** apagado salvo `EXPO_PUBLIC_PHONE_WHATSAPP=1`, que ningún perfil activa. Depende de API #79, sin fusionar.
- **`notice_presentation`:** propuesta; no se envía y API no hace la migración.
- **Tokens fuera de las URL (#97 de API):** diseño. La app sigue en las rutas actuales.
- **Encuestas:** vista previa apagada en `store-beta` y en producción.
- **Versión mínima (426):** la app no la maneja. Ver bloqueante B6.

### Prohibido inventar
- **Términos y condiciones:** no existen en el producto. La app no muestra ninguno en los avisos.
- **Finalidades de consentimiento:** solo las del documento servido. Hoy no hay ninguna real.
- **Excepción a resolver:** el paso KYC `terms_acceptance` (B1).

## 2. Compatibilidad exacta con la API
API `main` = `4cb952c` (situación del 2026-10-29). **Hoy:** API #104 está fusionado y desplegado en staging como `c653ae5`; ver §S.

| Contrato de API | Estado en API | Lo que hace el candidato Mobile |
|---|---|---|
| #84 `email_unavailable`, #86 `kyc_unavailable`, #78 `already_affiliated`, #75 `has_affiliate_profile`, #95 | Fusionado | Implementado |
| #100: límites y listas de prueba de SMS y correo | Fusionado | Compatible, **confirmado por API**: no añade `reason` visibles. `503 sms_unavailable` también cubre el freno horario global. Los rechazos por número (país, lista, tope diario) son invisibles a propósito: 200/202 `delivery: "queued"` sin código, y la app mantiene «si no llega en unos minutos…». Los 429 traen `retry_after` |
| #79: WhatsApp | Abierto, sin fusionar | Envía `{channel:"sms"}`. Una API sin #79 ignora el campo y manda SMS |
| #91 + #93: avisos, clase de cambio, bloqueo 409 | Abiertos; #93 en `33eeb4d` | Implementado y probado en físico con `a7ba4d6` (mismo código que `5167671`) |
| #93 `5d9e566`: `DELETE push/devices` exento del bloqueo | En #93, no en la imagen física | Ignora el 409 y sigue con el logout; con la exención recibe 204. **Sin prueba física** |
| #92: interruptor de alta asistida, `by-request`, `assisted_access_claimed` | Abierto | Implementado (#73/#74). Prueba conjunta local 11/11; `by-request` sin prueba física |
| #97: enlaces con fragmento | Diseño | No aplica todavía; la app usa las rutas actuales |
| #99: extracción de INE con IA apagada por defecto | Abierto | Sin cambio en Mobile: la app sube evidencia y la API decide el procesamiento |

**Contra API `main` sin #91/#92/#93**, como staging hoy:
- los avisos no aparecen (`GET /privacy/notice` 503, `/me/privacy` 404, sin bloques);
- la consulta `by-request` da 404 sin `reason`, que la app trata como «no pudimos confirmar»;
- los cuerpos son idénticos a los anteriores.

## 3. Afilianet staging vc13 frente a «Afilianet PRUEBA avisos» vc2

| | Afilianet (beta) vc13 | Afilianet PRUEBA avisos vc2 |
|---|---|---|
| Build / SHA | `ae0e4ba8` / `e2e8de1` (#73) | `14d92940` / `067402a` (#77 antes de `92bae99`) |
| Paquete / esquema | `com.afilianet.mobile` / `afilianetmobile` | `com.afilianet.mobile.privacytest` / `afilianetprivacytest` |
| Firma | Keystore EAS de la beta | Keystore EAS propio (cert v2 `3d448074…bd6961`) |
| Contador de versionCode (EAS) | 13 | 2, separado por paquete |
| API | `https://staging-api.afilianet.mx` | `https://andres-desk.tail7be8f8.ts.net`: desechable, solo tailnet |
| Entorno EAS / Firebase | `preview`: incluye `google-services.json`, **push posible** | `development`: sin Firebase, **push no operativo** |
| Telemetría | Apagada (DSN `disabled`) | Apagada |
| Avisos de privacidad | **No:** 422 con REQUIRED; atrapado con ENFORCE | Sí, con todas las correcciones de #77 |
| Cola asistida `assisted_access_claimed` (#74) | No | Sí |
| #78 (texto de recuperación) / #79 (orden del cierre) | No / No | No / No |
| Probado en físico | Hito A (vc12) y prueba breve de vc13 | Rondas P1–P3 (2026-10-27/28) |

## 4. Configuración del candidato publicable
Hoy **no hay un perfil listo** para publicar fuera de staging.

| Aspecto | Estado actual | Necesario / decisión |
|---|---|---|
| **API** | `store-beta`: `https://staging-api.afilianet.mx`. `production`: sin URL en `eas.json` y su entorno EAS está vacío, así que `check-build-env` lo rechazaría | Decidir si el MVP sale contra staging (beta cerrada) o contra producción (`https://api.afilianet.mx`, que aún no existe: D7) |
| **Paquete** | `com.afilianet.mobile`, versión 1.0.0 | Sin cambio. La app de prueba sigue separada y no se publica |
| **Firma** | Keystore EAS remoto de `com.afilianet.mobile`, el de vc12/vc13 | Para Play: crear la app en Play Console, decidir Play App Signing y la clave de subida, y verificar que el certificado coincide con vc13 antes de publicar |
| **Versiones** | Contador remoto 13; `store-beta`/`production` con `autoIncrement`, el próximo es **14** | **API no reserva el 14:** #97 es solo diseño y convivirá con las rutas actuales. Su recomendación es que el MVP ocupe el siguiente versionCode y #97 uno posterior. Lo decide Andrés |
| **Enlaces** | Referidos: en staging `https://staging-admin.afilianet.mx/join/…`; en otros entornos `afilianetmobile://join/…`, que no es HTTPS | Para producción hace falta la landing HTTPS de producción. Sin App Links: la app no abre enlaces `https` |
| **Permisos** | Perfiles de tienda: sin `SYSTEM_ALERT_WINDOW` ni `READ_EXTERNAL_STORAGE`; sin `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS` mientras las encuestas estén apagadas | Añadir `production` a la lista de perfiles de tienda en `app.config.js`; hoy solo bloquea en `store-beta`/`store-beta-apk` |
| **Push** | Token de Expo (`getExpoPushTokenAsync`). En Android exige Firebase; solo el entorno `preview` lo trae | Producción: `GOOGLE_SERVICES_JSON` en su entorno EAS, credenciales FCM en Expo, y `PUSH_ENABLED` y el token de Expo en la API |
| **Telemetría** | `store-beta` exige Sentry apagado y sin PostHog. `production` queda apagado solo porque faltan las variables | Extender a `production` la comprobación de `store-beta` |
| **Envío a tienda** | `submit.production` vacío, sin cuenta de servicio de Play | Pendiente; requiere autorización y credenciales de Andrés |
| **SMS** | Disponible: verificación y recuperación por SMS | Proveedor real y listas de #100 de API activos en el entorno de lanzamiento |

## 5. Guion mínimo de aceptación física del candidato final
Solo integración y lo no cubierto; no repite la evidencia aprobada de P1–P3 ni la del hito A.

**Requisitos:**
- un APK o AAB del candidato con el paquete definitivo, construido **solo con autorización**;
- el teléfono de prueba, nunca la tablet;
- cuentas exclusivas de la prueba.

1. **Actualización sobre vc13.**
   - **Verificar antes, explícitamente:** paquete `com.afilianet.mobile`, versionCode mayor, **mismo certificado que vc13**, API del perfil, sin claves de telemetría.
   - **Instalar** encima, sin desinstalar.
   - **Esperado:** la sesión y los datos se conservan.
2. **Cambio entre cuentas (sin cobertura física en vc2):**
   - cerrar la sesión de una cuenta sin organizaciones;
   - entrar con una que tiene dos;
   - el selector forzado lleva a Inicio **con la barra inferior**.
3. **Cierre de sesión (#79, solo automático hasta ahora):** el log tiene un `DELETE push/devices` y un `auth/logout`, y **ninguna petición después**.
4. **Recuperación (#78):**
   - por correo, el texto «solicitamos el envío…»;
   - por SMS, el texto de la API;
   - con un **SMS real** solo si Andrés lo autoriza, a un número de la lista de #100.
5. **Push con Firebase** (no se pudo probar con vc2):
   - registro del dispositivo (`POST push/devices`);
   - desregistro al cerrar la sesión;
   - con la exención de #93: 204, sin 409.
6. **Privacidad con el paquete definitivo:**
   - solo si el entorno de lanzamiento activa REQUIRED/ENFORCE;
   - un registro con casilla (el registro directo con casilla no se probó en vc2; solo la unión);
   - un bloqueo con registro y desbloqueo.
7. **Solicitud de eliminación de cuenta** (`GET`/`POST /account/deletion-request` con contraseña y «ELIMINAR»):
   - solo comprobar el recibo con una cuenta de prueba;
   - según `PRIVACY_DELETION_REQUESTS_ENABLED`;
   - sin ejecutar borrado real.
8. **INE:**
   - con #99 apagado por defecto: captura y envío, sin extracción;
   - si Andrés activa la extracción con IA: una sola captura de prueba, con la decisión documentada.
9. **Términos de la verificación (A5, Mobile #82).**
   - **Prueba local cerrada:** #82 `7ad78b6` frente a API #104 `f7f9498`, 4/4.
   - **En físico:** con el **documento definitivo aprobado** que publique API, no el de prueba ni la propuesta pendiente (#105).
   - **Flujo propio:**
     - el documento se ve completo, con título, versión y secciones;
     - la aceptación registra exactamente esa versión y su fingerprint, con `accepted_via = own_session`.
   - **Flujo asistido:**
     - en el teléfono del patrocinador aparece el aviso de que acepta la persona que se verifica;
     - el registro distingue a esa persona (sujeto) del patrocinador autenticado (actor de la auditoría), con `accepted_via = assisted_enrollment`.
     - Límite que se mantiene: el sistema no demuestra que la persona leyó ni aceptó.
   - **Errores, coordinados con API**, cambiando el documento servido con el paso abierto:
     - **cambio de versión:** 409 `terms_document_changed`, sin aceptación registrada; al recargar se ve la versión nueva;
     - **retiro:** 409 `terms_not_published`, sin aceptación; al recargar no hay botón.
   - **Sin documento publicado:** el paso no ofrece aceptar ni envía nada.

**Evidencia por paso:** HTTP del entorno, registros del servidor y capturas, en categorías separadas.

## 6. Bloqueantes y límites de cobertura (para el documento coordinado por API)

### Bloqueantes
- **B1. Paso KYC `terms_acceptance`:** registra la aceptación de «términos» que la propia pantalla dice que no están publicados (`{accepted:true}`, sin texto ni versión). Esto contradice «no inventar términos».
  - **Confirmado por API en `4cb952c`:** las organizaciones nuevas lo exigen por defecto (`OrganizationController@store`, `Organization::DEFAULT_REQUIRED_COMPLIANCE_STEPS`), y la API solo pide `accepted`.
  - **Responsables:** API, con la decisión de Andrés.
  - **Criterio de cierre:** quitar el paso de las políticas KYC del MVP (API/Admin) o definir un documento real y versionado. En la app, no mostrarlo mientras no exista.
- **B2. Entorno de lanzamiento sin decidir:** ¿staging como beta cerrada o producción (D7)? El perfil `production` no tiene API.
  - **Criterio:** decisión de Andrés, más un perfil con URL, Firebase y telemetría verificados por `check-build-env`.
- **B3. Push en producción:** sin `google-services.json` ni credenciales FCM en el entorno `production`.
  - **Criterio:** variables en EAS y en la API, y prueba física del paso 5.
- **B4. Enlaces de referido fuera de staging:** no son HTTPS.
  - **Criterio:** landing HTTPS de producción y su URL en `buildReferralUrl`.
- **B5. Publicación en Play:** sin app en Play Console, sin decisión de firma y sin `submit`.
  - **Criterio:** configuración y autorización de Andrés.
- **B6. Activar privacidad (REQUIRED/ENFORCE) con clientes antiguos:**
  - vc≤13 recibe 422 al registrarse o unirse y queda atrapado con ENFORCE;
  - **la versión mínima compatible es el candidato que incluya #77** (o la app de prueba vc2, que no se distribuye);
  - no hay mecanismo 426.
  - **Criterio:** que todos los testers tengan el candidato instalado antes de activar, o un mecanismo de versión mínima.
- **B7. SMS y correo reales:** proveedor y listas de #100 en el entorno de lanzamiento.
  - **Criterio:** prueba física autorizada del paso 4.

### Límites de cobertura (se conservan)
- **A5 (términos de la verificación):** solo prueba local conjunta (4/4) con un documento ficticio. Hay que repetirla en físico con el documento definitivo aprobado (paso 9).
- **#79:** probado solo de forma automática. La prueba falla con el orden anterior y pasa con el nuevo. **No está en ningún APK físico.**
- **#78:** solo pruebas automáticas.
- **Cambio entre cuentas** (sin organización → dos organizaciones, selector forzado): **sin cobertura física en vc2**; solo pruebas automáticas (adenda §8 del cierre P2/P3).
- **Registro directo con casilla:** sin prueba física en vc2. P1 se hizo con `d31ee445`, que todavía obligaba a abrir el aviso.
- **Exención `DELETE push/devices` (`5d9e566`):** sin prueba física.
- **Push:** sin prueba física con privacidad, porque la app de prueba no tiene Firebase.
- **`by-request` (#92) durante una revisión:** cubierto en la prueba conjunta local; no en el teléfono.
- **GET tras el logout en vc2:** en el teléfono no se puede saber si llevaba `Authorization`. En la reproducción automática salió **sin** token.
- **Evidencia de P2 (primera ronda):** el log HTTP se perdió por dos archivados simultáneos; solo hay extractos.
- **Capturas del teléfono:** `evidence/capturas` está vacía.

## 7. Decisiones para Andrés
1. **Entorno del lanzamiento** (B2), y con él la API, Firebase y los enlaces.
2. **KYC `terms_acceptance`** (B1): retirarlo del MVP o publicar un documento real.
3. **Versión y canal:** ¿el MVP ocupa vc14? API no lo reserva y recomienda que sí. **Atención:** el APK de staging de §S consumiría el 14.
4. **Play Console y firma** (B5).
5. **Cuándo activar REQUIRED/ENFORCE** y cómo asegurar que no quedan clientes vc≤13 (B6).
6. **Pruebas reales autorizadas:** SMS real, push real, solicitud de eliminación en entorno real.
7. **Extracción de INE con IA (#99):** encender o no en el MVP, y su texto de privacidad (lo sirve la API, no la app).
8. **Integración:** aprobar el PR único `release/mvp-mobile` con merge commit y el cierre de los PR intermedios.
