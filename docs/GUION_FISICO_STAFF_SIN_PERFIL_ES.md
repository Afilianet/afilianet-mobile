# Gestión sin perfil de afiliado (API #75): comportamiento y ronda física

## Qué hace Mobile

Contrato: `docs/organizations/STAFF_SIN_PERFIL_DE_AFILIADO.md` de afilianet-api (#75, `ec4d5bb`).

**Qué lee la app** (`src/state/membership.ts`), de cada organización de `GET /me/organizations`:
- `my_role` y `my_membership_status`: personal de gestión = owner, admin o manager con membresía activa;
- `has_affiliate_profile`, por organización. **Si el campo falta** (una API anterior a #75, o una lista guardada sin conexión antes de #75), se considera **desconocido**: la app hace lo de siempre. Solo un `false` explícito apaga lo personal.

**Sin perfil (`false`):**
- **Sin llamadas personales.** Los 17 hooks personales (perfil, KYC, red propia, invitaciones, registro asistido, monedero, comisiones, retiros) no piden nada. Tampoco lo hace «deslizar para actualizar», que de otro modo forzaría esas peticiones.
- **Inicio:** en lugar de las tarjetas de afiliado, verificación, red y comercio, un aviso «Cuenta de gestión: esta cuenta administra la organización; no tiene perfil de afiliado.». **Nunca** aparecen «No iniciado» ni «Comenzar verificación».
- **Mi red:** el mismo aviso y, para el personal de gestión, **«Afiliados de la organización»**:
  - listado con búsqueda por nombre o código (`GET /affiliates?search=`);
  - cada fila abre la ficha del afiliado y su red (`GET /affiliates/{uuid}`, `/sponsored`, `/placement-children`).
  - No hay registro asistido.
- **Perfil:** el aviso neutro, sin bloque de afiliado ni de verificación.
- **Verificación, Monedero, Comisiones, Retiros, Solicitar retiro, Referido:** «No disponible para esta cuenta: no tiene perfil de afiliado en esta organización.», sin ofrecer iniciar nada. La pantalla ni siquiera se monta.
- **Encuestas:** sin «Responder yo», porque la API lo rechazaría con 403 `no_affiliate_profile`. Las entrevistas siguen disponibles para el personal de gestión (#64).

**Personal de gestión con perfil:** conserva toda su experiencia de afiliado y además tiene «Ver afiliados de la organización» en Mi red.

**Afiliado:** su experiencia no cambia, y nunca se pide el listado de gestión.

**La API sigue decidiendo:** si el rol se revoca en el servidor, el listado muestra «sin permiso» (403), nunca datos ajenos.

**Cambio de organización:** todo va por organización, tanto las consultas como la búsqueda. Al cambiar, la búsqueda se vacía y cada petición lleva la organización activa.

**No se crea nada:** ningún perfil ni expediente KYC. La reutilización de identidad entre organizaciones queda fuera.

**Pruebas:** `src/tests/app/staff-without-profile.test.tsx`, con las pantallas, hooks y cliente HTTP reales y solo `fetch` simulado, una API por organización:
- personal de gestión sin perfil: Inicio, «deslizar para actualizar», Mi red con búsqueda y ficha, 403 por rol revocado, Perfil y Verificación;
- afiliado con perfil;
- personal de gestión con perfil;
- campo ausente;
- cambio de organización en los dos sentidos.

Mutaciones detectadas (6/6):
- `false` tratado como perfil;
- campo ausente tratado como `false`;
- nadie de gestión;
- sin barrera en Verificación;
- Mi red sin vista de gestión;
- deslizar para actualizar sin protección.

## Ronda física única (amplia)

**Candidato:** `feat/mobile-staff-without-profile`, en el worktree `.claude/worktrees/staff-profile`. Solo JavaScript: APK `versionCode` 11.

**Fuente de encuestas:** datos de ejemplo. API base: staging.

**Antes de empezar:**
- **Servirlo requiere autorización de Andrés:** hoy Metro sirve #65.
- **Confirmar que API #75 está desplegada en staging.** Si no lo está, la app no recibe el campo y se comporta como antes; en A1 se vería «Únete al programa de afiliados» o «No iniciado».

**Reglas:**
- No registrar personas, ni iniciar verificaciones, enviar respuestas, distribuir o invitar.
- No abrir notificaciones.
- No tocar «Descartar…» ni «Cerrar sesión».

**Organizaciones que harán falta:**
- **QA:** «QA E2E encuestas audio 20261020», donde Andrés es owner **sin** perfil.
- **Gestionada con afiliados:** una donde Andrés gestione (owner, admin o manager) y que **tenga afiliados**, si existe.
- **Afiliado:** una donde Andrés sea afiliado **con** perfil.

| # | Paso | Resultado esperado |
|---|---|---|
| A1 | Organización QA → **Inicio** | Recuadro «Organización activa» con la QA. Tarjeta «Cuenta de gestión»: «Esta cuenta administra la organización; no tiene perfil de afiliado.», con «Ver afiliados de la organización». **No** aparecen «No iniciado», «Comenzar verificación», «Únete al programa de afiliados» ni tarjetas de afiliado o red |
| A2 | Deslizar hacia abajo en Inicio | Se actualiza sin errores ni tarjetas nuevas |
| A3 | «Ver afiliados de la organización» (o **Red**) | «Cuenta de gestión» y «Afiliados de la organización». En la QA probablemente: «Esta organización aún no tiene afiliados». **No** aparece «Registrar a alguien» |
| A4 | **Perfil** | Tus datos y el aviso «Cuenta de gestión». **Sin** bloque de afiliado ni de verificación |
| A5 | **Encuestas** → la encuesta QA | «Iniciar entrevista» disponible (**no** la inicies). **Sin** «Responder yo» |
| A6 | Campana | Carga la lista sin error. No abras ninguna |
| B1 | «Cambiar» → la **organización gestionada con afiliados** → **Red** | «Afiliados de la organización» con su lista, nombres y códigos |
| B2 | Buscar por un nombre y después por un código | Solo coincidencias. «Limpiar búsqueda» vuelve a la lista completa. Con una sola letra: «Escribe al menos 2 letras para buscar.» |
| B3 | Abrir un afiliado | Su ficha, con sus patrocinados directos y sus hijos de colocación. «Cerrar» vuelve a la lista |
| C1 | «Cambiar» → la organización donde eres **afiliado** → **Inicio** | Tu tarjeta de afiliado (código, estado) y la de verificación, como siempre. **Sin** «Cuenta de gestión» |
| C2 | **Red** | Tu red personal y «Registrar a alguien» (no registres). Si en esta organización también gestionas, además «Ver afiliados de la organización» |
| C3 | **Perfil** | Tu bloque de afiliado y el de verificación, como siempre |
| D1 | Alternar entre la QA, la gestionada y la de afiliado, tres veces, mirando Inicio y Red | Cada vez se muestra lo de la organización activa. No quedan búsquedas de la anterior ni tarjetas personales en la QA |
| D2 | Modo avión 10 s en la QA, quitarlo y deslizar para actualizar | Sin tarjetas personales ni «No iniciado» |

**Anotar por paso:** hora, captura y la organización activa. Si en la QA aparece algo personal (A1–A5), anotar el texto exacto: indicaría que el campo no llega (API sin #75) o un defecto.
