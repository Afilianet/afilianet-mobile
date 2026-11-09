# Referido con una cuenta existente, y compartir desde Referidos

## Diagnóstico del bucle (hallazgo del 2026-10-21)

**Recorrido:**
1. QR de referido → `https://staging-admin.afilianet.mx/join/{organización}/{código}` (página de Admin).
2. Con sesión abierta, «Aceptar invitación».
3. BFF de Admin `/api/bff/invitations/{token}/accept`, que **reenvía el token de la sesión**.
4. API `POST /api/v1/invitations/{token}/accept`, que **reconoce al usuario autenticado** y no pide datos de registro.

**Causa:** si la cuenta ya tenía perfil de afiliado en esa organización, la API respondía **422** «Este usuario ya está inscrito como afiliado en esta organización.».
- Ocurría en cada invitación nueva del mismo QR, y con la misma tras una respuesta perdida.
- La página de Admin solo distinguía «listo» o «error» y volvía a ofrecer «Aceptar invitación»: un bucle para algo que **ya había ocurrido**.
- Es posible que una aceptación anterior sí se completara. Para una cuenta que aún no era afiliada, el flujo con sesión funcionaba.
- Se reprodujo con datos sintéticos en una base de pruebas aislada.

**Mobile tenía su propia variante:** con sesión, ocultaba «Unirme con mi cuenta» si la cuenta ya era **miembro** de la organización, aunque no tuviera perfil. Así, un owner sin perfil nunca podía afiliarse desde la app.

## Correcciones (PR draft, sin desplegar)

| Repo | PR | Qué cambia |
|---|---|---|
| afilianet-api | #78 | Una cuenta autenticada que ya es afiliada y miembro activo recibe **200 `already_affiliated: true`**: no crea nada, no cambia el patrocinador ni el rol y no consume la invitación. Lo demás se conserva: registro nuevo por código, cuenta existente sin perfil (conserva su rol de gestión), 409 para invitación usada, vencida o revocada, 404 para token desconocido y 422 para correo existente sin sesión |
| afilianet-admin | #52 | `/join`: «afiliación creada» (con «Conservas tu rol de gestión»), «**Ya formas parte de esta red**» o error. Muestra con qué cuenta se une. Con la API anterior, su 422 «ya está inscrito» se muestra como «Ya formas parte»; un 409 empieza una invitación nueva |
| afilianet-mobile | este PR | `join`: un miembro **sin** perfil (`has_affiliate_profile: false`) puede unirse conservando su rol; `already_affiliated` o el 422 antiguo → «Ya formas parte de esta red». **Referidos:** «Invitar por correo» y «Compartir por WhatsApp» (#66 integrado) |

**Referido frente a invitación de staff:** son flujos distintos (`/join` frente a `/staff-invitations/{token}`). Este cambio solo toca el de referido.

## Compartir desde Referidos (Mobile)

- **«Invitar por correo»:** abre el correo con asunto («Te invito a unirte a {organización} en Afilianet») y mensaje con el enlace. La persona elige el destinatario y envía.
- **«Compartir por WhatsApp»** (de #66): abre WhatsApp con el mensaje y el enlace. La persona elige el chat y confirma el envío.
- **Si la aplicación no se puede abrir:** aviso «No se pudo abrir {app}…» y el menú del sistema con el mismo enlace. También siguen «Compartir» y «Copiar liga».
- **Afilianet no envía nada ni confirma la entrega,** y la pantalla lo dice.
- **Solo con un enlace HTTPS público.** Si no lo hay, la pantalla explica por qué no hay correo ni WhatsApp.
- **El enlace es siempre el de la organización activa y su patrocinador.** Al cambiar de organización no se ofrece el anterior, y un perfil de otra organización nunca se convierte en enlace.
- **Sin perfil en la organización** (también un superadmin o un manager): «No disponible para esta cuenta…». No se inventa ningún código.

## Ronda física única

**Antes de empezar:**
- **Despliegues en staging (decisión aparte):** API #78 y Admin #52. Sin ellos, el paso 5 seguirá mostrando el error de antes.
- **Metro:** sirviendo este candidato de Mobile, con autorización.
- **Cuentas:**
  - **Patrocinador:** la cuenta de Andrés en una organización donde **tenga perfil de afiliado activo**; así lo muestra su pantalla Referidos.
  - **Invitada:** una **cuenta existente de prueba**, distinta de la de Andrés, que **no** sea afiliada en esa organización. Si no existe, la parte B queda **pendiente**: no se crea en esta ronda.

**Reglas:**
- No se acepta con la cuenta de Andrés en una organización donde no sea afiliado.
- No se envían mensajes a terceros: el correo y el WhatsApp se abren y se **cancelan**, o se envían solo a uno mismo.

| # | Paso | Resultado esperado |
|---|---|---|
| A1 | Mobile, organización del patrocinador → Inicio → «Compartir liga de referido» (Referidos) | Código, QR y la liga `https://staging-admin.afilianet.mx/join/{org}/{código}` de **esa** organización |
| A2 | «Invitar por correo» | Se abre el correo con asunto y mensaje que incluyen la liga. **No envíes**: vuelve atrás |
| A3 | «Compartir por WhatsApp» | Se abre WhatsApp con el mensaje y la liga, pidiendo elegir el chat. Envíalo solo a ti mismo, o cancela |
| A4 | Cambiar a otra organización (con perfil) → Referidos | La liga y el código son los de la **nueva**. Nunca aparece la liga anterior |
| A5 | Cambiar a una organización **sin** perfil (la QA) → Referidos | «No disponible para esta cuenta: no tiene perfil de afiliado en esta organización.», sin código ni liga |
| B1 | En otro navegador o dispositivo, iniciar sesión en Admin con la **cuenta de prueba**. Abrir la liga de A1 | «Ana te invitó…» y «Te unirás a esta red con tu cuenta {correo}; no se crea otra cuenta.», con «Aceptar invitación» |
| B2 | «Aceptar invitación» | «¡Listo! Tu afiliación fue creada.» (con «Conservas tu rol de gestión» si la cuenta administraba esa organización). Sin error en rojo |
| B3 | Volver a abrir la misma liga y «Aceptar invitación» otra vez | «**Ya formas parte de esta red.** … tu patrocinador sigue siendo el mismo.» Sin bucle y sin error |
| B4 | Admin (cuenta de Andrés) → la organización → Afiliados → la cuenta de prueba | Aparece como afiliada (pendiente), con **patrocinador = el de A1**. Una sola vez |
| B5 | En Mobile con la cuenta de prueba (si la tiene en un teléfono): abrir la liga | «Ya perteneces a esta organización.», o «Ya formas parte de esta red» si acepta. Nunca un segundo perfil |
| C1 | Con la cuenta de Andrés, abrir **su propia** liga en Admin y aceptar | «Ya formas parte de esta red.»: nada cambia, porque ya es afiliado ahí |

**Anotar por paso:** hora, captura y la organización. Si B2 o C1 muestran un error en rojo, anota el texto exacto: indicaría que el despliegue no incluye #78 o #52.
