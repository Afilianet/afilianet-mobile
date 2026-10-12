# Acceso MVP: correo o celular, registro directo y afiliación posterior

Este documento describe cómo funciona en Mobile el acceso con correo o celular y qué partes dependen todavía de afilianet-api.

## Qué hace Mobile

- **Registro directo** (`/(auth)/register`): nombre, correo, celular o ambos (al menos uno) y contraseña. No pide referido ni organización.
  - El celular se elige con un selector de país y se envía siempre en E.164 (`utils/phone.ts`). México es `+52` seguido de 10 dígitos; Mobile quita los prefijos `044`, `045` y `1`.
- **Registro con invitación** (`/(auth)/invitation` y `/join/{organización}/{código}`): el mismo formulario acepta correo, celular o ambos.
- **Verificación** (`/verify-account`):
  - Correo: enlace por correo, con espera de reenvío y el botón "Ya confirmé mi correo", que vuelve a leer el usuario.
  - Celular: código por SMS con reenvío y cuenta regresiva. Los errores de código vencido, código inválido y demasiados intentos se muestran en español.
  - "Verificado" solo aparece cuando `email_verified_at` o `phone_verified_at` del servidor lo indican. El cliente nunca marca un canal como verificado.
- **Login** con correo o celular, más contraseña.
- **Recuperación**:
  - por correo, con un enlace;
  - por celular, con un código SMS y la contraseña nueva en la misma pantalla. Funciona también para cuentas que solo tienen celular.
- **Usuario independiente** (sin organización, `/no-organization`):
  - acceso a su perfil, a la configuración y a las notificaciones de Afilianet;
  - aviso para verificar sus datos si el servidor reporta alguno pendiente;
  - buscador de invitaciones para incorporarse después con la misma cuenta.
  - No se llama a ningún endpoint que requiera una organización.
- **Afiliación posterior**: un usuario con sesión que abre `/join/...` confirma con "Unirme con mi cuenta". Mobile usa el `accept` autenticado del API, que no crea otra cuenta.
- **Referido conservado** (`auth/pendingReferral.ts`):
  - Al abrir un enlace sin sesión, el referido queda guardado. Sobrevive al registro, la verificación, el login y un reinicio de la app.
  - Después se ofrece confirmarlo con la cuenta que se usó.
  - Se borra al aceptarlo, al descartarlo, a los 7 días o al cerrar sesión, para que nunca pase a otra cuenta.

## Contrato con afilianet-api

**Base desplegada hoy:** `main` / API #45, rama `feat/platform-users-notifications` @ `53b1086`. Ya ofrece:
- `POST /api/v1/auth/login` con `email`.
- `POST /api/v1/auth/forgot-password` con `{email}`.
- `POST /api/v1/auth/email-verification`.
- `POST /api/v1/invitations/{token}/accept`:
  - sin sesión: registro con `email` y/o `phone`;
  - con sesión: afiliación con la cuenta actual (`token: null`).

**API #50** (`feat/unified-account-access` @ `03c6b8b`): sin merge, construido sobre API #45. El contrato está en `docs/auth/ACCOUNT_ACCESS_CONTRACT.md`. La sesión de API confirmó, punto por punto, que estas formas son finales para esta ronda en `03c6b8b`.
- **Login:** `{identifier, password}` es el contrato canónico; `email` y `phone` son alias compatibles.
  - Mobile envía siempre `identifier`, ya normalizado (correo en minúsculas o celular en E.164).
  - Para un correo agrega también el alias `email`. Así el login por correo funciona con la API desplegada hoy y con API #50, sin importar cuál se despliegue primero.
- **Registro:** `POST /api/v1/auth/register` con `{first_name, last_name, email?, phone?, password, password_confirmation}` → `201 {token, user}`. Si viene celular, envía el código SMS automáticamente.
- **Envío del código:** `POST /api/v1/auth/phone-verification` → `202 {retry_after, expires_in}`. En 422 devuelve `reason` `phone_missing` o `phone_already_verified`. En 429 devuelve `retry_after` y el header `Retry-After`.
- **Verificación del código:** `POST /api/v1/auth/verify-phone {code}` → `200 {user}`.
  - En 422 devuelve `errors.code` y `reason` `otp_invalid`, `otp_expired` u `otp_attempts_exceeded`.
  - El código tiene 6 dígitos, vence en 10 minutos y admite 5 intentos.
- **Recuperación:**
  - `POST /api/v1/auth/forgot-password {phone}` → `200 {message, retry_after}`, respuesta genérica.
  - `POST /api/v1/auth/reset-password {phone, code, password, password_confirmation}` → `200 {message}`; revoca todas las sesiones.
  - Errores: los mismos `reason`, con `errors.code`.
  - Ambos endpoints también aceptan `identifier`. Mobile usa `email` o `phone`, que también son finales.
- **Invitaciones:** `accept` con sesión devuelve `reason: "invitation_recipient_mismatch"` solo si la invitación va dirigida a otro correo o celular. Las invitaciones de referido sin destinatario se siguen aceptando igual.
- **Usuario:** `UserResource` incluye `email` (puede ser `null`), `pending_email` y `pending_phone`.

**Pendiente en API:**
- Nunca se ha enviado un SMS real: `SMS_PROVIDER_ENABLED=false` y no hay credenciales de AWS SNS. Aun con API #50 desplegada, cualquier paso que requiera recibir un SMS termina en el error del servidor, no en un código.
- El cambio de correo o celular (`PATCH /me/email` y `PATCH /me/phone`) existe en API #50, pero no en Mobile.

## Pruebas: qué se puede probar y dónde

### A. Funciona hoy, en dispositivo, con la API desplegada (Metro sobre el APK actual)
- **Login con correo:** Mobile envía `identifier` y el alias `email`.
- **Recuperación por correo:** "¿Olvidaste tu contraseña?" → Correo → enlace.
- **Verificación de correo de una cuenta existente:** "Enviar enlace" → abrir el enlace → "Ya confirmé mi correo". El estado sale de `/me`.
- **Registro desde una invitación** con correo, celular o ambos: `/join` → "Crear cuenta" → Verificación. El registro por invitación ya acepta `phone`.
- **Afiliación posterior con la cuenta actual:** Inicio sin organización → "Código o enlace de invitación" → "Unirme con mi cuenta". "Ahora no" descarta la invitación, y una organización a la que ya pertenece muestra "Ya perteneces…".
- **Referido conservado:**
  - Abrir `adb shell am start -W -a android.intent.action.VIEW -d "afilianetmobile://join/<organizationId>/<code>" com.afilianet.mobile` sin sesión → "Ya tengo cuenta" → iniciar sesión con correo. Debe volver sola a "Confirma tu invitación".
  - Repetirlo forzando el cierre de la app antes de iniciar sesión.
  - Cerrar sesión con la invitación pendiente y entrar con otra cuenta: no debe ofrecerse.
- **Perfil:** privacidad al final; "Salir de la organización" y "Eliminar mi cuenta" solo tras "Mostrar opciones de cuenta".
- **Mensajes de "todavía no disponible":** el login con celular muestra "Esta opción todavía no está disponible", porque la API desplegada no lo admite.

### B. Cubierto solo con pruebas simuladas (Jest con `fetch` simulado, sin dispositivo)
Usan las formas confirmadas de API #50 (`03c6b8b`); no se ejecutan contra un servidor real:
- **Registro directo:** con correo, con celular, con ambos y sin ninguno.
- **Login con celular por `identifier`.**
- **Código SMS:** enviar y reenviar con espera; código vencido, inválido y demasiados intentos; límite de solicitudes con `Retry-After`; el celular solo cuenta como verificado cuando lo dice `/me`.
- **Recuperación solo por celular,** de punta a punta.
- **`invitation_recipient_mismatch`.**
- **Carreras de sesión:** cierre o cambio de sesión mientras `refreshUser` o la escritura del perfil offline están pendientes.
- **Vencimiento del referido** con la app abierta más de 7 días: al leerlo, al volver a primer plano y por temporizador.

### C. Bloqueado por API (no se puede probar en dispositivo todavía)
- **Requiere API #50 desplegada en staging:**
  - **Registro directo, también solo con correo,** porque depende de `/auth/register`.
  - Login con celular.
  - Envío y verificación del código.
  - Recuperación por celular.
- **Requiere además el proveedor de SMS activo** (`SMS_PROVIDER_ENABLED` y credenciales de AWS SNS): recibir cualquier código SMS, ya sea de verificación del celular o de recuperación por celular. Sin eso, la app muestra el error del servidor.
- **Cuando ambos estén listos:**
  - registro solo con correo: verificar el correo y llegar al Inicio sin organización;
  - registro solo con celular: enviar el código, ver la cuenta regresiva y verificar;
  - probar también un código vencido (dejar pasar 10 minutos) y 5 intentos fallidos;
  - registro con ambos;
  - login con celular;
  - recuperación solo por celular de punta a punta.

El enlace HTTPS de staging (`https://staging-admin.afilianet.mx/join/...`) abre la web: la app no tiene App Links configurados.
