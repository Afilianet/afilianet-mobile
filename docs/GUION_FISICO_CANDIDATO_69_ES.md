# Candidato único #69: ronda física de unos 15 minutos

El candidato #69 (`feat/phone-verification-whatsapp`) contiene, apilados:
- **#65:** barra inferior y selector de organización;
- **#66:** compartir por WhatsApp;
- **#67:** cuentas de gestión sin perfil;
- **#68:** referidos con una cuenta existente y compartir por correo;
- **#69:** verificación del celular por SMS o WhatsApp.

## Estado del servidor

| Pieza | Estado en staging |
|---|---|
| API #78 (aceptar con una cuenta ya afiliada → `already_affiliated`) | Fusionada y **desplegada** (`817cc89`) |
| Admin #52 (`/join` sin bucle, «Conservas tu rol de gestión») | Fusionada y **desplegada** (`8a4d217`): su texto está en la página servida |
| API #79 (canal WhatsApp) | **Sin fusionar ni desplegar.** Staging ignora el canal y **envía SMS reales** |

## Ya confirmado por Andrés (no se repite)

- **#64:** entrevista con audio, sin conexión y con sincronización.
- **#65:** navegación.
- **#67:** las cuatro partes de las cuentas de gestión sin perfil.
- **#60–#63:** aislamiento por origen.

## Requisitos de cuenta (no se crea ninguna cuenta ni se cambia ningún rol)

**Patrocinador:** la cuenta de Andrés, en una organización X donde tenga **perfil de afiliado activo**.

**Invitada:** una cuenta existente, distinta de la de Andrés, que cumpla:
- ser **miembro activo de X con rol de gestión** (admin o manager);
- **no tener perfil de afiliado en X**.

Se comprueba solo consultando, en Admin con la cuenta de Andrés: X → Miembros y X → Afiliados.

Si no existe una cuenta así:
- La parte B se hace con una cuenta **sin rol** en X. En ese caso «conserva su rol» queda sin probar.
- Si tampoco existe esa cuenta, la parte B queda pendiente.

**Nunca se acepta con la cuenta de Andrés:** le crearía un perfil o una invitación a su nombre.

## Parte A: solo consulta (unos 8 minutos, sin escrituras)

| # | Paso | Esperado |
|---|---|---|
| A0 | Abrir con el QR o enlace actual del cliente de desarrollo | La app carga sin «Error loading app». Conserva la sesión y la organización activa |
| A1 | Organización X → Referidos | Código, QR y `https://staging-admin.afilianet.mx/join/{X}/{código}` |
| A2 | «Invitar por correo» | Borrador con asunto y liga, **sin destinatario**. Cancela |
| A3 | «Compartir por WhatsApp» | WhatsApp pide elegir el chat. Cancela |
| A4 | Cambiar a otra organización con perfil y luego a una sin perfil | La liga cambia a la de la nueva. Sin perfil: «No disponible para esta cuenta…» |
| A5 | Perfil → «Verificar mi cuenta» (solo si el celular está pendiente) | Tarjeta Celular con «¿Cómo quieres recibir el código?» y SMS/WhatsApp. **No pulses «Enviar código»:** staging enviaría un SMS real. WhatsApp sigue pendiente de Meta |
| A6 | Navegador con sesión de Admin de la cuenta invitada → abrir la liga de A1 | «… te invitó» y «Te unirás… con tu cuenta {correo}». **No aceptes todavía** |

## Parte B: crea una afiliación (unos 6 minutos; solo con la cuenta invitada que cumple los requisitos)

**Qué escribe cada «Aceptar invitación»:**
- crea una invitación pendiente;
- y, la primera vez:
  - crea un perfil `pending` con patrocinador y padre de colocación = Andrés;
  - **no modifica la membresía ni el rol** (si estaba inactiva, solo la reactiva);
  - marca la invitación como aceptada;
  - registra la auditoría;
  - crea una notificación «invitación aceptada» para Andrés y, **si staging tiene `PUSH_ENABLED`, un push real a su teléfono**.

| # | Paso | Esperado |
|---|---|---|
| B1 | «Aceptar invitación», **una vez** | «¡Listo! Tu afiliación fue creada.» y «Conservas tu rol de gestión», sin error en rojo |
| B2 | Recargar la liga y aceptar otra vez | «Ya formas parte de esta red… tu patrocinador sigue siendo el mismo.» Sin bucle. Solo crea otra invitación pendiente |
| B3 | Admin (Andrés) → X → Afiliados y X → Miembros | La cuenta aparece **una vez**, pendiente, con patrocinador = Andrés. **Su rol sigue igual** |
| B4 | Mobile (Andrés) → campana | Una notificación «invitación aceptada» |

**Anotar por paso:** hora, captura y el texto exacto de cualquier error en rojo.

## Metro: «Error loading app / Android internal error» (2026-10-21)

**Causa:**
- El host del túnel era `l3e_vnc-ahinojosa-8082.exp.direct`, que contiene un `_`.
- Expo CLI arma el subdominio con `urlRandomness` (`.expo/settings.json`), un valor base64url que solo rechaza el `_` inicial.

**Evidencia:**
- Con ese host, el túnel solo registró solicitudes de `curl`; la tableta **no llegó a hacer ninguna**.
- El DNS público resolvía, y el manifiesto y el bundle se descargaban con `curl`.
- Con `urlRandomness` alfanumérico (`u5riqx8-…`), la tableta (TB300FU, Android 13, `okhttp/5.1.0`) pidió el manifiesto y el bundle (200) y abrió `/message` y `/hot`.

**No demostrado (sin ADB):** la excepción exacta en Android y qué componente rechaza el `_`.

**Cómo se evita repetirlo** (lanzador en `~/.local/state/migracion/lanzadores/retry-tunnel-69.sh`):
1. **Antes de arrancar,** si `urlRandomness` tiene algo distinto de letras y dígitos, lo reemplaza. El archivo es local e ignorado por git.
2. **Al leer el host,** acepta `_`, para no descartar túneles válidos como antes.
3. **Rechaza** cualquier host fuera de `[a-z0-9-]` en lugar de anunciarlo.
