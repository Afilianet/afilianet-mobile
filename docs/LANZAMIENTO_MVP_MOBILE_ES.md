# Paquete de lanzamiento del MVP: parte de Mobile

**Estado:** borrador del 2026-10-29. Es la parte de Mobile del documento único que coordina API.

**Este documento no autoriza nada:** ni builds, ni merges, ni publicación, ni instalación, ni envíos reales, ni cambios en EAS.

**Convenciones:**
- **«Probado en físico»:** solo lo ejecutado en un teléfono con un APK concreto. Las pruebas automáticas se nombran aparte.
- **SHA:** se dan a 7 caracteres. Los SHA completos están en cada PR.

## S. Candidata de staging (actualizada 2026-10-30)

**Va primero:** esta sección prevalece sobre §0–§5 en lo que respecta a staging. El resto del documento sigue describiendo el lanzamiento final.

### Qué es
- **Candidata elegida:** PR **#83**, head `d957a46` (SHA completo `d957a463aa8f0061fd6544e29dd03b4010a9803f`). Borrador.
- **Base:** está apilado sobre #82 (`7ad78b6`), que tiene base `main`.
- **Contenido** (comprobado con `git merge-base --is-ancestor`):
  - #82 completo, que a su vez contiene #81 completo (`97e0347`);
  - más un commit: la regla de «sesión propia».
- **Integración:** al fusionar, #83 se une a #82 y #82 a `main`, siempre con commit de merge. Ninguna rama original se modificó.
- **CI:** ✅ run 41140861452 sobre `d957a46`.
- **Local:** `tsc` 0, `eslint` 0, Jest 1099/1099, configuración de build 21/21.
- **`check-build-env` simulado para `store-beta-apk`:** sin errores. `eas config` (solo lectura): API de staging, telemetría y encuestas apagadas, entorno `preview`.

### Compatibilidad con la API
| | Desplegada hoy: `c653ae5` (#104) | Necesaria para la ronda: API #106 `cddcf33` (borrador; mismo código que `09cd508`, CI ✅; solo cambia el guion) |
|---|---|---|
| Rutas | Cada llamada de la app tiene ruta con el mismo método (`route:list` del árbol, sin red ni base de datos) | #106 no toca rutas: solo controlador, recurso, pruebas y documentación |
| `requires_own_session` / `accepted_via` | No los envía. La app con #83 **no ofrece el botón al patrocinador** igualmente (falla cerrado) | Los envía. Los tipos de #83 coinciden con `ComplianceStepResource` |
| Intento de términos del patrocinador | El servidor **lo aceptaría** si hubiera documento. Con `null` responde 409 `terms_not_published` | 409 `terms_require_own_session`, con o sin documento |
| `case_expired` | No existe | 409. Solo prueba automática (Pest y Jest) |
| Orden de rechazos | — | `kyc_unavailable` → `assisted_access_claimed` → `terms_require_own_session` → `case_expired` → `terms_not_published` → `terms_document_changed`. La app mapea por `reason` |

- **Privacidad apagada** (`PRIVACY_NOTICE_PUBLISHED` falso): `GET /privacy/notice` responde 503 y la app lo trata como «no publicado»; no hay pasos de aviso ni bloqueo de revisión.
- **Términos sin publicar:** `terms_document: null` en las dos versiones.

### Estado al 2026-10-31 y ronda con Andrés (preparación; nada autorizado)
- **APK vc14 construido** (F4, autorizado):
  - build EAS `7a6258ca-ff1d-470b-88c8-eed3a0682564`, `store-beta-apk` @ `d957a46`;
  - sha256 `fb34afc3a67030bb65a2a15b0c131ca31e1f45ccd9f2ac4cadc8e8478d338e38`;
  - mismo certificado y mismos permisos que vc13, apunta a staging, sin claves de telemetría.
  - **Sin instalar.** Evidencia en el comentario de #83.
- **S0 con vc13:** omitido por decisión de Andrés.
- **F2, leído por Andrés en Admin, sin modificar nada.** Organización «Afilianet Beta Android»:
  - `assisted_enrollment.enabled = true`;
  - **`compliance.capture_enabled = false`**;
  - pasos requeridos, en orden: documento, liveness, facematch, términos.
- **Parte A (S5): BLOQUEADA POR CONFIGURACIÓN.** Con la captura apagada, la app muestra el bloqueo de KYC, la captura asistida responde 503 `kyc_unavailable` y no se llega a los términos.
  - **Siguen autorizados:** el despliegue de #106 y el build de #83 (ya hecho).
  - **No autorizados:** encender la captura y el envío de correo.
- **Persona verificada:** Andrés, con su INE y su liveness reales. El guion de API está en #107 («Ronda con Andrés»).

#### ¿Ya existe la identidad de Andrés en la organización? ¿Impide una verificación nueva?
**Según el código de API #106 (`981f191`), no lo impide.**
- **Lo único que bloquea** crear el alta es una cuenta existente, **en todo staging** (no solo en la organización), con el mismo correo (comparado en minúsculas y sin espacios) o con el mismo celular: 422 «Ya existe una cuenta con este correo electrónico».
  - Además: la unicidad de perfil afiliado por usuario y organización, y el 503 si el alta asistida está apagada.
- **No hay deduplicación por identidad:**
  - no se busca el CURP, la clave de elector ni el número de documento en otras cuentas;
  - no hay búsqueda facial entre usuarios;
  - el nombre extraído de la INE no se compara con el de la cuenta.
- **Por tanto:** una cuenta nueva de Andrés (otro usuario, con su propio caso) **no choca** con sus cuentas ni con sus constancias anteriores, y **nada se borra ni se modifica**.

**Comprobación previa, de solo lectura, antes de A1:**
1. En Admin, si Andrés tiene acceso de plataforma: buscar `simmple.pruebas+kyc-terminos-01@gmail.com` entre los usuarios de plataforma. **Debe no existir.**
   - Sin acceso de plataforma, buscarlo entre los afiliados de la organización: esto solo cubre esa organización.
   - Si ya existe, usar `…+kyc-terminos-02@…`, con su propio hash.
2. Buscar a Andrés por nombre entre los afiliados de la organización, **solo para anotarlo** como evidencia: qué cuentas y qué casos tiene. No se tocan.

**Nombre en el alta:** el de la INE de Andrés, tal como aparece. Así el caso es coherente para quien lo revise en Admin. La API no lo compara.

#### Alias de correo
**Se puede mantener `simmple.pruebas+kyc-terminos-01@gmail.com`:**
- `email:rfc` acepta el `+`;
- la API lo guarda en minúsculas y sin espacios, sin quitar el `+`, así que es distinto de `simmple.pruebas@gmail.com`;
- llega al buzón de pruebas que ya controla el equipo.

**Condiciones:**
- que no exista ya (comprobación previa);
- que **su propio hash** esté en la lista: `sha256("afilianet-allowlist|simmple.pruebas+kyc-terminos-01@gmail.com")`;
- que **no** sea `andres@lunilabs.mx`.

Una vez usado queda ocupado. Si la ronda hay que repetirla, se necesita otro alias y otro hash.

#### Dos sesiones: patrocinador y persona verificada
| | Patrocinador | Persona verificada (Andrés) |
|---|---|---|
| Cuenta | `simmple.pruebas@gmail.com`, afiliado de «Afilianet Beta Android» | **Cuenta nueva** `simmple.pruebas+kyc-terminos-01@gmail.com`, creada por el alta asistida |
| Dispositivo | Galaxy A06 con vc14 | El mismo A06, con un cierre de sesión real entre medias, **o** otro teléfono con vc14 si Andrés autoriza instalarlo |
| Encabezado | `X-Assisted-Enrollment-ID` en `/compliance` | Ninguno; sesión propia |
| Ve en términos (con la captura **encendida**) | «Falta que Andrés acepte los términos desde su propia cuenta…», sin botón; `requires_own_session: true` | «no publicados», sin botón; `requires_own_session: false` |

- **En el mismo dispositivo:** antes de cada paso, comprobar en pantalla qué cuenta está activa (Perfil).
- **El cambio de cuenta cubre también S3:**
  - el cierre de sesión de #79: `DELETE push/devices`, después `auth/logout`, y nada más con ese token;
  - ningún dato del patrocinador en la sesión de la persona.

**Comportamiento de vc14 con la captura apagada** (según el código de `d957a46`; respondido a API):
- **La app lee `identity_verification_available` solo al iniciar sesión** (`/me/organizations`); deslizar para recargar no lo actualiza.
  - Tras encender la captura, el patrocinador **cierra la sesión y vuelve a entrar** antes de A1.
  - Andrés, al entrar en A3, recibe el valor vigente en ese momento.
- **Con la captura apagada,** `GET /compliance` y `/compliance/steps` se piden igualmente, pero la pantalla muestra:
  - la tarjeta «Verificación de identidad no disponible»;
  - cada paso no aprobado solo con su nombre y su estado. **El texto de términos no aparece:** ni «Falta que…» ni «no publicados».
- **Ventana de la captura, acordada con API (#107):** se enciende en el paso 7 y se apaga en el paso 11, justo después de A4. Así A1 y A3 muestran sus textos en pantalla. A4 no depende de la captura.

**Secuencia:**
1. **Patrocinador, A1:** crea el alta con el nombre de la INE, el alias y **sin celular**. Esto dispara el **único** correo. Con Andrés presente, captura documento, liveness y facematch.
   - La captura sigue encendida hasta después de A4 (paso 11 de #107).
   - El patrocinador ve el pendiente.
   - **Evidencia:** el GET `/compliance` con el encabezado asistido, la cuenta del patrocinador y el id del paso de términos.
2. **Patrocinador, cierre de sesión.**
3. **Andrés, A2:** abre el correo y entra en `https://staging-admin.afilianet.mx/activate/<token>` (página de Admin) para fijar su contraseña. Después entra en la app con el alias.
4. **Andrés, A3:** abre su verificación.
   - Es el mismo caso y el **mismo id de paso**, con «no publicados» y sin botón.
   - **Evidencia:** el GET sin encabezado asistido, con la cuenta de Andrés.
5. **Andrés, cierre de sesión.** Vuelve a entrar el patrocinador.
6. **Patrocinador, A4:** reabre el alta. La app pide primero `GET /affiliates/me/assisted-enrollments/{id}`; con `access_status: "ready"` muestra «Esta persona ya activó su cuenta. Puede continuar su verificación desde su propia sesión.» y no ofrece captura.
   - **No llama a `/compliance` ni muestra un 409.** El 409 `assisted_access_claimed` solo aparece en la app con capturas en la cola sin conexión o con una pantalla abierta antes de la activación.
7. **A5:** lectura final.
   - El paso de términos está pendiente, con `attempt_count` 0, y no hay ninguna aceptación.
   - La captura está **apagada** y la configuración es igual a la inicial.

#### Orden único de la ronda: API #107 `5decb69`
**Fuente:** el orden y los responsables de cada paso están en `docs/identity/KYC_TERMS_PHYSICAL_TEST.md`, sección «Procedimiento final de la ronda». Prevalece sobre la «Secuencia» de arriba, que solo detalla las sesiones.

- **Datos:**
  - organización `02959601-fb55-4ff5-8d1a-beb5a18ff1d8`;
  - staging vivo con **#106 desplegado** (API `:64`, Horizon `:46`, identidad `:46`);
  - correo mediante Infra #182.

| Paso #107 | Qué (parte de Mobile y sesiones) |
|---|---|
| 6 | [M]/[A] Instalar vc14 (`7a6258ca…`, sha256 `fb34afc3…`) sobre vc13 en el A06 y entrar como patrocinador. **Requiere autorizar la instalación** |
| 7 | **Encender la captura** con la llamada a la API del bloque siguiente. Admin no tiene ese control en ninguna versión |
| 8 | Patrocinador: **cerrar sesión y volver a entrar** (la app lee la captura solo al iniciar sesión). Después, A1: alta, documento, liveness y facematch; en términos, «Falta que Andrés…», sin botón |
| 9 | A2 y A3: Andrés activa la cuenta desde el correo, entra con el alias y ve su caso con «no publicados», sin botón (la captura sigue encendida) |
| 10 | A4: patrocinador. `GET …/assisted-enrollments/{id}` 200 con `access_status: "ready"` y el texto «Esta persona ya activó su cuenta…». **No es un 409**: el 409 solo se cubre con pruebas automáticas |
| 11 | **Apagar la captura** justo después del paso 10. A partir del paso 7, apagarla también ante cualquier interrupción |

#### Encender la captura temporalmente y restaurarla (procedimiento exacto; no ejecutar sin autorización)
- **Vía:** Admin **no tiene** el control (solo edita los pasos requeridos), así que se hace con la API:
  - `GET/PATCH /api/v1/organizations/settings`, con `X-Organization-ID`;
  - solo un **owner o admin** con membresía activa (`OrganizationPolicy::updateSettings`);
  - cada cambio queda auditado como `organization.settings_updated`, con el valor anterior y el nuevo.
- **Quién:** Andrés, desde su terminal y con **su** cuenta owner o admin. La contraseña se escribe en el terminal (`read -s`), nunca en el chat. El token solo vive en la variable de esa terminal y se revoca al final; solo se cierra esa sesión, nunca todas.

```bash
API=https://staging-api.afilianet.mx/api/v1
read -r -p "Correo owner/admin: " EMAIL; read -r -s -p "Contraseña: " PASS; echo
TOKEN=$(curl -sS -X POST "$API/auth/login" -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -d "$(jq -n --arg e "$EMAIL" --arg p "$PASS" '{identifier:$e,email:$e,password:$p}')" | jq -r .token); unset PASS
H=(-H 'Accept: application/json' -H "Authorization: Bearer $TOKEN")
ORG=$(curl -sS "$API/me/organizations" "${H[@]}" | jq -r '.data[] | select(.name=="Afilianet Beta Android") | .id'); echo "ORG=$ORG"
# 0. Lectura previa (se guarda): debe mostrar capture_enabled=false, los 4 pasos y assisted.enabled=true
curl -sS "$API/organizations/settings" "${H[@]}" -H "X-Organization-ID: $ORG" | tee settings-antes.json | jq '{c:.data.compliance, a:.data.assisted_enrollment}'
# 1. ENCENDER (justo antes de A1): solo este campo
curl -sS -X PATCH "$API/organizations/settings" "${H[@]}" -H "X-Organization-ID: $ORG" -H 'Content-Type: application/json' \
  -d '{"compliance":{"capture_enabled":true}}' | jq '.data.compliance'
# 2. APAGAR (en cuanto el caso llega a términos, o si la ronda se interrumpe)
curl -sS -X PATCH "$API/organizations/settings" "${H[@]}" -H "X-Organization-ID: $ORG" -H 'Content-Type: application/json' \
  -d '{"compliance":{"capture_enabled":false}}' | jq '.data.compliance'
# 3. Verificar que todo coincide con la lectura previa
curl -sS "$API/organizations/settings" "${H[@]}" -H "X-Organization-ID: $ORG" > settings-despues.json && diff <(jq -S .data settings-antes.json) <(jq -S .data settings-despues.json) && echo "RESTAURADO"
# 4. Revocar solo este token
curl -sS -X POST "$API/auth/logout" "${H[@]}" -o /dev/null -w '%{http_code}\n'; unset TOKEN
```

- **Ventana:** se enciende en el paso 7 de #107 y se apaga en el paso 11, después de A4.
  - Mientras está encendida, **cualquier afiliado** de «Afilianet Beta Android» podría capturar su KYC. Conviene una ventana corta y avisar a los testers.
- **Restaurar siempre:** el paso 2 se ejecuta igualmente si algo falla, si hay un 5xx o si la ronda se interrumpe. El criterio de cierre es el `diff` del paso 3 sin diferencias.
- **Datos reales:**
  - la INE y el rostro de Andrés se procesan en staging con los motores reales: identity-engine (documento), face match y liveness de AWS;
  - quedan como evidencia del caso;
  - no se borran, conforme a la instrucción.

**Pendientes de autorización:**
- encender la captura (y en qué ventana);
- el envío de correo (F3);
- instalar vc14 (en el A06 y, si hace falta, en otro teléfono);
- el despliegue de #106 (ya autorizado, a cargo de API e Infra).

### Orden coordinado con API e Infra (nada autorizado todavía)
**Documento conjunto:** `docs/identity/KYC_TERMS_RELEASE_106_83.md` en API #106 (`981f191`). Recoge el procedimiento de despliegue, las verificaciones y el correo. Esta sección solo resume y detalla la parte de Mobile.

Cada fase se autoriza por separado y se detiene ante cualquier fallo.

| Fase | Quién | Qué |
|---|---|---|
| F0 | Infra, lectura | Imágenes vivas, cola, inventario de privacidad, `messaging:status`. Hoy el correo de la API está apagado y la lista vacía |
| F1 | API + Infra | Merge de #106 (sin migraciones) y despliegue de API, Horizon e identidad con la misma imagen. Restauración a lo vivo antes (API `:62`, Horizon `:45`) |
| F1b | Infra | PR de fijación por digest, **sin aplicar** hasta F6. Ningún apply de Terraform durante la ronda |
| F2 | Andrés (Admin), recomendado | Lectura de la organización de prueba: `capture_enabled`, `assisted_enrollment.enabled`, `required_steps` y su orden. **No hay vía sin sesión.** Lo único registrado es la organización beta con la captura **apagada** (2026-10-26) |
| F3 | Infra + Andrés | Correo solo para la prueba: PR de Infra con las fases `stage-email` y `enable-api-email`, el secreto del hash y dos despachos. Verificado con `messaging:status` en API y Horizon. **Después de F1 y antes de A1** |
| F4 | Mobile | Volver a comprobar el contador (13) → build `store-beta-apk` @ `d957a46` (vc14) → verificar el APK. **Instalar después de S0**, si se hace S0 |
| F5 | Andrés + todos | S0 opcional con vc13 → instalar → S1–S5 (S5 = parte A de API; A1 = el único envío) |
| F6 | Infra + Andrés | `disable-api` y `clear` (quitan el hash de API y Horizon), borrado del secreto; después, el apply del pin |

**Por qué F3 va antes de A1:** la API decide el correo de activación **al crear el alta**.
- Si el correo no está disponible, lo omite para siempre (`email.assisted_activation.skipped`).
- Si el hash falta, Horizon lo descarta (`not_allowlisted`).
- Sin celular, la única salida es otra alta con otra dirección y otro hash.

### Datos para autorizar la prueba de activación (un único envío)
**Propuesta, no decidida.** Andrés confirma los datos, e Infra confirma la lista y el canal.

| Rol | Cuenta | Estado |
|---|---|---|
| Patrocinador | `simmple.pruebas@gmail.com` (cuenta `850ebd31-…`), la cuenta de prueba ya usada en la beta | **Hay que confirmar** que es afiliado activo de una organización de prueba que cumpla la lectura de F2. Si la organización beta sigue con la captura apagada, se necesita otra organización de prueba o un cambio de configuración, que decide Andrés |
| Persona verificada (cuenta nueva; la persona es Andrés) | Nombre según la INE de Andrés; correo **`simmple.pruebas+kyc-terminos-01@gmail.com`** | El correo llega al mismo buzón de pruebas que ya controla el equipo. Necesita **su propio hash** en la lista. Sin teléfono, para que no haya ningún SMS |

- **Si la organización exige pasos de identidad antes de los términos** (fotos, INE, prueba de vida), el patrocinador tiene que capturarlos de una **persona real del equipo que dé su consentimiento**. Unos datos ficticios no sirven para la captura. Lo decide Andrés al ver la lectura de F2.
- **El envío** es el que dispara el paso A1 al crear el alta. No se crea ninguna otra alta con correo durante la ronda.

### Alcance del APK respecto a vc13 (`e2e8de1`)
| Cambio | PR | Estado de la prueba física |
|---|---|---|
| Cola asistida: `assisted_access_claimed` y consulta `by-request` antes de descartar | #74 | **Sin prueba física.** Solo la prueba conjunta local 11/11 |
| Avisos de privacidad | #75 | P1–P3 en la app de prueba vc2, contra el entorno desechable. **En staging están apagados:** no se ven |
| Casilla, salida de «Sin organización», selector forzado, cierre único | #77 | Parcial en vc2. **Sin cobertura física:** el cambio de una cuenta sin organización a una con dos, y el registro directo con casilla |
| Texto de recuperación «solicitamos el envío» | #78 | **Solo automático** |
| Orden del cierre de sesión | #79 | **Solo automático** |
| Perfil `production` y landing configurable | #81 | No afecta a staging: el enlace sigue siendo el de staging, como en vc13 |
| A5: términos publicados y versionados | #82 | Solo prueba local con un documento ficticio |
| Sesión propia: el patrocinador no acepta, `accepted_via`, `case_expired` | #83 | **Solo automático** |
| Perfil `privacy-test-apk` | #76 | No forma parte de este APK (es otro paquete) |

Lo heredado de vc13 (acceso por correo o celular, bloqueo de KYC, telemetría apagada) ya tiene la prueba física del hito A y la prueba breve de vc13.

### Build propuesto (no ejecutado; requiere autorización)
- **Perfil `store-beta-apk`,** el mismo de vc13:
  - `com.afilianet.mobile`, distribución interna;
  - entorno EAS `preview`, con Firebase;
  - API de staging;
  - Sentry y PostHog apagados, encuestas apagadas, WhatsApp apagado.
- **Comando,** desde una copia de trabajo limpia en el SHA exacto:
  ```bash
  git worktree add --detach .claude/worktrees/build-d957a46 d957a463aa8f0061fd6544e29dd03b4010a9803f
  cd .claude/worktrees/build-d957a46 && npm ci
  npx eas-cli build --platform android --profile store-beta-apk --non-interactive --no-wait --json
  ```
- **versionCode 14: disponible.** Comprobado el 2026-10-30, solo con lecturas:
  - `eas build:version:get -p android -e store-beta-apk` → contador remoto de `com.afilianet.mobile` = **13** (vuelto a leer a las 23:56 UTC);
  - `eas build:list`: ningún build de ese paquete después de vc13 (`ae0e4ba8`, 2026-10-27), y ninguno en cola.
  - El build lo asigna solo, con `autoIncrement`. No hace falta reservarlo ni cambiar EAS.
  - **Consecuencia:** el AAB de producción sería el 15 o posterior.
  - **Volver a comprobarlo justo antes de lanzar:** otro build de `store-beta`, `staging` o `production` lo consumiría.
- **EAS:** sin cambios. Ni variables, ni perfiles, ni credenciales.
- **Firma:** sin cambios. Es el keystore remoto de `com.afilianet.mobile`, el de vc12 y vc13.
- **Verificar en el APK antes de instalarlo:**
  - paquete;
  - versionCode 14;
  - certificado igual al de vc13;
  - permisos bloqueados (sin overlay, sin lectura de almacenamiento, sin audio);
  - ni DSN ni clave `phc_` en el bundle;
  - API de staging.
- **Instalar** sobre vc13 en el Galaxy A06, **nunca en la tablet de desarrollo**.

### Guion de prueba en staging (con #106 desplegado)
**Durante toda la ronda, anotar la imagen de API activa.** Si la ronda se hiciera todavía con `c653ae5`, las diferencias están en la tabla de compatibilidad. En ese caso, A1 no puede mostrar `requires_own_session` en el GET, y el intento del patrocinador no se probaría.

**Requisitos:**
- F0 a F3 hechos (F4 antes de S1);
- el registro de peticiones de API (CloudWatch), leído por API o Infra.

**Evidencia:** HTTP del servidor, capturas y notas del teléfono, en categorías separadas.

**S0. Antes de actualizar, con vc13 (opcional):**
- vc13 como **patrocinador** en el paso de términos: 409 `terms_require_own_session`, con el texto del servidor legible y sin aceptación;
- vc13 en la **sesión propia** de una cuenta de prueba: 409 `terms_not_published`.

**S1. Actualización:** instalar encima de vc13, sin desinstalar. La sesión y los datos se conservan.

**S2. Acceso:**
1. Entrar con correo y con celular.
2. Registrar una cuenta nueva con correo (sin enviar correos fuera de la lista): no aparece ningún paso de aviso de privacidad. Un 422 aquí es un hallazgo.
3. Verificación por SMS:
   - con el sandbox (B9), comprobar el texto de `503 sms_unavailable` o el de «si no llega…»;
   - un SMS real solo con autorización.
4. Recuperación por correo (#78): el texto «solicitamos el envío…». No llega correo a direcciones que no estén en la lista.
5. Cierre de sesión (#79): en el registro de API, `DELETE push/devices` y `auth/logout`, y **ninguna petición después** con ese token.

**S3. Cambio de cuenta y de organización:**
1. Cuenta sin organización: «Sin organización» con salida.
2. Cerrar sesión y entrar con una cuenta con dos organizaciones: el selector es obligatorio y lleva a Inicio **con la barra inferior**. Es el punto sin cobertura física en vc2.
3. Cambiar de organización: Inicio, Red y Cartera muestran la nueva, sin restos.
4. Volver a la cuenta sin organización: no quedan datos de la anterior.
5. En el registro de API, ninguna petición con el token anterior.

**S4. Referidos:**
1. Compartir desde un afiliado activo: el enlace es `https://staging-admin.afilianet.mx/join/{org}/{código}` y WhatsApp se abre con el mensaje prellenado.
2. Abrir el enlace en otro dispositivo: la landing de Admin permite registrarse. Sin App Links, se abre el navegador; es lo esperado.
3. Con una cuenta existente, unirse desde la app con la **cuenta actual**. Si ya pertenece, aparece `already_affiliated`.
4. Desde «Sin organización», escribir el código y unirse.

**S5. Términos KYC con sesión propia** (sección A de `docs/identity/KYC_TERMS_PHYSICAL_TEST.md`, API #106):
- **A1. El patrocinador crea el alta asistida** con los datos aprobados. **Esto dispara el único correo.** Avanza hasta el paso de términos.
  - Ve «Falta que Prueba acepte los términos desde su propia cuenta, cuando la active. Desde el registro asistido no se pueden aceptar.», **sin botón** (`testID terms-requires-own-session`).
  - El GET asistido trae `requires_own_session: true`, `terms_document: null` y `accepted_via: null`.
  - En el registro de API, ningún `POST …/attempt` de términos.
- **A2. La persona recibe el correo** (hora y remitente), activa su cuenta y entra en la app.
- **A3. Su verificación:** el mismo caso, en el paso de términos, con «no publicados» y sin botón. El GET propio trae `requires_own_session: false`.
- **A4. El patrocinador intenta reabrir el alta:** «la persona ya activó su cuenta» (409 `assisted_access_claimed`), sin opción de captura.
- **A5. Lectura final de solo lectura:**
  - el paso de términos sigue pendiente, con `attempt_count` 0;
  - el caso sigue en curso;
  - no hay ninguna aceptación.
- **Detenerse** ante un 5xx, ante una aceptación registrada por el patrocinador, o ante una respuesta que no esté en el guion.

*Solo automático:* `terms_require_own_session` con documento, `case_expired`, documento retirado entre la lectura y la aceptación, y registros anteriores con `assisted_enrollment`.

*Bloqueado hasta publicar los términos aprobados:*
- la persona lee y acepta desde su sesión (`accepted_via = own_session`, versión y hash);
- 409 `terms_document_changed` con recarga;
- el patrocinador ve «La persona aceptó los términos desde su propia cuenta»;
- completar un caso hasta la revisión.

*No hay recordatorios automáticos:* el caso vence en `expires_at`.

**Con esta ronda, A5 queda probado en teléfono solo sin documento publicado** (pendiente del patrocinador, activación y «no publicados» de la persona). No se considera probado en físico hasta cubrir la parte bloqueada.

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
**Actualización del 2026-10-30:** la candidata es **#83** (sobre #82, que tiene base `main`); contiene #81 y A5 (ver §S). Se fusiona #83 en #82 y #82 en `main`, con commits de merge.

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
3. **Versión y canal:** propuesto que el APK de staging de §S (#83) ocupe vc14 (disponible, contador remoto en 13); el AAB de producción sería el 15 o posterior.
4. **Play Console y firma** (B5).
5. **Cuándo activar REQUIRED/ENFORCE** y cómo asegurar que no quedan clientes vc≤13 (B6).
6. **Pruebas reales autorizadas:** SMS real, push real, solicitud de eliminación en entorno real.
7. **Extracción de INE con IA (#99):** encender o no en el MVP, y su texto de privacidad (lo sirve la API, no la app).
8. **Integración:** aprobar el PR único `release/mvp-mobile` con merge commit y el cierre de los PR intermedios.
