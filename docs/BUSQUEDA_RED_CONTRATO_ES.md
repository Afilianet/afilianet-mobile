# Búsqueda en «Mi red»: contrato de API que falta

**Estado (2026-10-16):** Mobile ya implementa la búsqueda contra el contrato acordado (§4), probada con HTTP simulado. La API todavía no la soporta (§2). Mientras tanto, la lista normal funciona igual que antes, y al buscar se muestra que la búsqueda no está disponible con esa versión del servidor: nunca se presenta una lista sin filtrar como resultados.

**Revisado el 2026-10-16** contra `afilianet-api` `main`, las ramas `integration/api-mvp` (#58, `93811e3`) y `fix/kyc-facematch-liveness-gap` (#61, `548e6a9`), y el PR abierto #55 (`e1ce99a`). No se consultó staging.

## 1. Qué muestra Mobile hoy

La pestaña «Mi red» (`src/app/(app)/network.tsx`) lista, paginadas de 20 en 20:

| Sección | Endpoint | Cliente |
|---|---|---|
| Patrocinados directos | `GET /api/v1/affiliates/me/sponsored?per_page&page` | `fetchMySponsored`, `useMySponsored` |
| Hijos de colocación | `GET /api/v1/affiliates/me/placement-children?per_page&page` | `fetchMyPlacementChildren`, `useMyPlacementChildren` |

Tocar una fila abre `network-affiliate/[affiliateUuid]` (`GET /affiliates/{id}`). La API lo autoriza con `AffiliateProfilePolicy::view`: el propio afiliado y sus descendientes en cualquiera de los dos árboles, o el staff de la organización.

## 2. Qué soporta la API

| Endpoint | Búsqueda | Alcance y permiso |
|---|---|---|
| `GET /affiliates/me/sponsored`, `/me/placement-children` | **No.** Solo `per_page` (1–100). `NetworkService::directSponsored`/`directPlacementChildren` paginan sin filtros (orden `id` y `placement_position, id`) | La red directa del afiliado actual |
| `GET /affiliates/{id}/sponsored`, `/placement-children`, `/descendants`, `/ancestors` | **No.** Solo `per_page`, `page`, `max_depth` y `type` | `view` sobre `{id}` |
| `GET /affiliates?search=` | **Sí**, por `affiliate_code`, `first_name` y `last_name`. El PR #55 lo mejora: palabra por palabra, sin acentos y escapando `ILIKE` | **Toda la organización.** `viewAny` exige owner/admin/manager (y superadmin con #55). La política lo dice así: «a plain affiliate never gets a roster of the whole organization» |

Ninguna rama abierta añade búsqueda a los endpoints de red. Las ramas de red antiguas ya están integradas en `main` y tampoco la tienen.

## 3. Alternativas descartadas

- **`GET /affiliates?search=`** daría 403 a un afiliado normal. A un manager le mostraría a **toda la organización** desde «Mi red», más allá de lo que esa pantalla representa.
- **Filtrar las páginas ya cargadas** solo encuentra lo descargado (20 por página). Presentarlo como «búsqueda en tu red» sería falso con redes grandes.
- **Descargar todas las páginas para filtrar** implica muchas peticiones por cada búsqueda y no escala.

## 4. Contrato acordado (mínimo, sin ampliar la visibilidad)

Un parámetro opcional `search` en los dos endpoints que Mobile ya usa:

```
GET /api/v1/affiliates/me/sponsored?search=<texto>&page=<n>&per_page=<n>
GET /api/v1/affiliates/me/placement-children?search=<texto>&page=<n>&per_page=<n>
```

- **Alcance y permiso:** exactamente los mismos que sin `search`. Mismo afiliado actual (`CurrentAffiliateResolver`), misma relación directa y misma organización (`tenant`). La búsqueda solo **reduce** la lista; nunca añade a nadie que no saldría sin ella.
- **Criterio:** solo el nombre de la persona (`users.first_name`, `users.last_name`), con la misma semántica que el PR #55: cada palabra debe aparecer en algún campo, sin distinguir mayúsculas ni acentos, y con `%`, `_` y `\` escapados. **Nunca** `affiliate_code`, CURP, documentos, correo, teléfono, `metadata` ni datos de identidad.
- **Ámbitos separados:** cada endpoint busca solo en su propia lista. Patrocinados directos y colocación no se combinan.
- **Validación:** `search` tras recortar espacios. Vacío equivale a sin filtro; de 2 a 100 caracteres; fuera de eso, 422 con `errors.search`.
- **Paginación:** el mismo `LengthAwarePaginator`. `meta.total` y `last_page` son los del resultado filtrado, y los `links` conservan `search` (`withQueryString()`). El orden es estable (el actual), para que las páginas no se dupliquen ni salten personas.
- **Confirmación del filtro:** con una búsqueda no vacía, `meta.search` devuelve **exactamente el texto solicitado tras recortar los espacios**, en cada página. Sin búsqueda, el campo puede faltar: la lista normal no lo exige, de modo que la API actual sigue sirviendo. Mobile **solo** muestra resultados de búsqueda cuando `meta.search` coincide con el texto vigente. Así, una API que ignore `search` nunca hará pasar una lista sin filtrar por resultados, y el orden de despliegue de API y Mobile deja de importar.
- **Errores:** 401, 403 y 404 de `CurrentAffiliateResolver` como hoy; 422 por `search` inválido.
- **Pruebas en la API:** que un afiliado no encuentre a nadie fuera de su red directa; aislamiento por organización; que nunca coincida por CURP, correo o teléfono; acentos y frases de varias palabras; comodines escapados; paginación filtrada con `total` correcto; y `meta.search`.

## 5. Implementación en Mobile

| Pieza | Dónde |
|---|---|
| `search` opcional (codificado en la URL; se omite si no hay búsqueda) | `fetchMySponsored`/`fetchMyPlacementChildren` en `src/api/endpoints.ts` |
| `meta.search` en el tipo de la paginación | `PaginatedResponse` en `src/types/api.ts` |
| Consulta por ámbito y texto, con validación de `meta.search` en cada página | `src/hooks/useNetworkSearch.ts` |
| Espera breve | `src/hooks/useDebouncedValue.ts` (350 ms) |
| Campo, limpiar y estados | `src/components/network/NetworkSearchSection.tsx`, dentro de cada tarjeta (`PaginatedSectionCard` acepta `header` y `override`) |
| Una sección por ámbito, con `key` por cuenta y organización | `src/app/(app)/network.tsx` |

- **Campo «Buscar por nombre»** en cada lista, con su etiqueta accesible por sección y el botón «Limpiar búsqueda». Se envía el texto recortado, con un mínimo de 2 caracteres (por debajo aparece una indicación y se mantiene la lista normal) y un máximo de 100.
- **Estados:** carga mientras corre la espera breve o la petición; sin resultados («Nadie en esta lista coincide con «…».»); error con «Intenta de nuevo» (con los mismos reintentos que el resto de la app); y búsqueda no disponible («La búsqueda no está disponible con la versión actual del servidor…»), con «Limpiar búsqueda».
- **Respuestas tardías:** la clave es `["affiliate", ámbito, "me", orgId, userId, "search", texto]`. Una respuesta de un texto, ámbito, cuenta u organización anterior solo llena su propia entrada de caché, nunca lo que está en pantalla. Además, cada página debe confirmar el texto en `meta.search`: si falta o no coincide, la búsqueda entera se muestra como no disponible, sin mezclar filas (también si deja de confirmarse en una página posterior).
- **Paginación:** «Cargar más» pide la página siguiente con el mismo `search`, y cambiar el texto vuelve a la página 1.
- **Detalle:** cada fila abre `network-affiliate/{id}` del afiliado de esa fila; la API lo sigue autorizando con `view`.
- **Cuenta y organización:** las secciones se montan con `key` por cuenta y organización, así que al cambiar se limpia el texto. La clave de consulta incluye ambas, y el dominio `affiliate` ya se invalida en `OrganizationProvider`.
- **Lo que no se hace:** no se usa el endpoint administrativo `GET /affiliates` ni se filtran solo las páginas descargadas.

**Pruebas** (`src/tests/app/network-search.test.tsx`, con el cliente real y `fetch` simulado). Cubren:
- API antigua: la lista funciona y la búsqueda sale como no disponible; al limpiar vuelve la lista.
- Filtro confirmado: texto recortado y codificado, y apertura del detalle correcto.
- `meta.search` distinto del pedido.
- Una respuesta fuera de orden de un texto anterior.
- Paginación filtrada, y una página posterior sin confirmación.
- Texto demasiado corto (sin petición), sin resultados y error con reintento.
- Cambio de organización con una búsqueda en curso, y cambio de cuenta.
- Ámbitos separados (la búsqueda en una lista no consulta la otra).
- Ninguna llamada al endpoint administrativo.

Con mutaciones se comprobó que quitar la validación de `meta.search`, o el texto de la clave, hace fallar 3 pruebas en cada caso.

## 6. Decisiones (2026-10-16)

1. **Alcance:** solo la red directa. Patrocinados y colocación conservan ámbitos separados.
2. **Criterio:** solo el nombre.
3. **Entrega:** Mobile se implementa ya contra el contrato con HTTP simulado, sin esperar el despliegue. Hasta que la API confirme `meta.search`, la búsqueda aparece como no disponible.
