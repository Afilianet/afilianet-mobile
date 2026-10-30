# Paquete de lanzamiento del MVP: parte de Mobile

**Estado:** borrador del 2026-10-29. Es la parte de Mobile del documento único que coordina API.

**Este documento no autoriza nada:** ni builds, ni merges, ni publicación, ni instalación, ni envíos reales, ni cambios en EAS.

**Convenciones:**
- **«Probado en físico»:** solo lo ejecutado en un teléfono con un APK concreto. Las pruebas automáticas se nombran aparte.
- **SHA:** se dan a 7 caracteres. Los SHA completos están en cada PR.

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
API `main` = `4cb952c`.

| Contrato de API | Estado en API | Lo que hace el candidato Mobile |
|---|---|---|
| #84 `email_unavailable`, #86 `kyc_unavailable`, #78 `already_affiliated`, #75 `has_affiliate_profile`, #95 | Fusionado | Implementado |
| #100: límites y listas de prueba de SMS y correo | Fusionado | 429 con `retry_after` y 503 por canal: manejados. **Confirmar con API** si #100 añade otros `reason` que la app deba mostrar |
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
| **Versiones** | Contador remoto 13; `store-beta`/`production` con `autoIncrement`, el próximo es **14** | **14 queda reservado** como inicio de las rutas nuevas de #97 de API; confirmar con API si el candidato del MVP ocupa el 14 |
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

**Evidencia por paso:** HTTP del entorno, registros del servidor y capturas, en categorías separadas.

## 6. Bloqueantes y límites de cobertura (para el documento coordinado por API)

### Bloqueantes
- **B1. Paso KYC `terms_acceptance`:** registra la aceptación de «términos» que la propia pantalla dice que no están publicados (`{accepted:true}`, sin texto ni versión). Esto contradice «no inventar términos».
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
3. **Versión y canal:** ¿el MVP ocupa vc14? Se coordina con #97 de API.
4. **Play Console y firma** (B5).
5. **Cuándo activar REQUIRED/ENFORCE** y cómo asegurar que no quedan clientes vc≤13 (B6).
6. **Pruebas reales autorizadas:** SMS real, push real, solicitud de eliminación en entorno real.
7. **Extracción de INE con IA (#99):** encender o no en el MVP, y su texto de privacidad (lo sirve la API, no la app).
8. **Integración:** aprobar el PR único `release/mvp-mobile` con merge commit y el cierre de los PR intermedios.
