# Búsqueda en «Mi red»: contrato de API que falta

**Estado:** la búsqueda no se implementó en Mobile porque la API no la soporta para la red del afiliado. Este documento recoge la evidencia, por qué no se resolvió en el cliente y el contrato mínimo que necesita Mobile.

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

## 3. Por qué no se resolvió en Mobile

- **`GET /affiliates?search=`** daría 403 a un afiliado normal. A un manager le mostraría a **toda la organización** desde «Mi red», más allá de lo que esa pantalla representa.
- **Filtrar las páginas ya cargadas** solo encuentra lo descargado (20 por página). Presentarlo como «búsqueda en tu red» sería falso con redes grandes.
- **Descargar todas las páginas para filtrar** implica muchas peticiones por cada búsqueda y no escala.

## 4. Contrato propuesto (mínimo, sin ampliar la visibilidad)

Un parámetro opcional `search` en los dos endpoints que Mobile ya usa:

```
GET /api/v1/affiliates/me/sponsored?search=<texto>&page=<n>&per_page=<n>
GET /api/v1/affiliates/me/placement-children?search=<texto>&page=<n>&per_page=<n>
```

- **Alcance y permiso:** exactamente los mismos que sin `search`. Mismo afiliado actual (`CurrentAffiliateResolver`), misma relación directa y misma organización (`tenant`). La búsqueda solo **reduce** la lista; nunca añade a nadie que no saldría sin ella.
- **Criterio:** solo el nombre de la persona (`users.first_name`, `users.last_name`), con la misma semántica que el PR #55: cada palabra debe aparecer en algún campo, sin distinguir mayúsculas ni acentos, y con `%`, `_` y `\` escapados. **Nunca** CURP, documentos, correo, teléfono, `metadata` ni datos de identidad. Buscar también por `affiliate_code` es una decisión de producto aparte (§6).
- **Validación:** `search` tras recortar espacios. Vacío equivale a sin filtro; de 2 a 100 caracteres; fuera de eso, 422 con `errors.search`.
- **Paginación:** el mismo `LengthAwarePaginator`. `meta.total` y `last_page` son los del resultado filtrado, y los `links` conservan `search` (`withQueryString()`). El orden es estable (el actual), para que las páginas no se dupliquen ni salten personas.
- **Confirmación del filtro:** la respuesta incluye `meta.search` con el texto aplicado (normalizado), o `null` sin filtro. Mobile **solo** muestra resultados de búsqueda si `meta.search` coincide con lo que envió. Así, una API que ignore `search` (la versión actual) nunca hará pasar una lista sin filtrar por resultados de búsqueda. El orden de despliegue de API y Mobile deja de importar.
- **Errores:** 401, 403 y 404 de `CurrentAffiliateResolver` como hoy; 422 por `search` inválido.
- **Pruebas en la API:** que un afiliado no encuentre a nadie fuera de su red directa; aislamiento por organización; que nunca coincida por CURP, correo o teléfono; acentos y frases de varias palabras; comodines escapados; paginación filtrada con `total` correcto; y `meta.search`.

## 5. Plan en Mobile (listo para implementarse cuando exista el contrato)

- Campo «Buscar por nombre» sobre cada sección (o uno para ambas, enviado a los dos endpoints), con botón para limpiar la búsqueda.
- Espera breve (300 ms) y mínimo de 2 caracteres. El texto forma parte de la clave de React Query (`["affiliate", "sponsored", "me", orgId, search]`), así que una respuesta antigua nunca sustituye a la de la búsqueda vigente, y una petición abandonada se cancela con `AbortSignal`.
- Estados: cargando, sin resultados («Nadie en tu red coincide con “…”»), error con reintento, y búsqueda no disponible (respuesta sin `meta.search`).
- «Cargar más» pide las páginas de la misma búsqueda. Al cambiar el texto, la paginación vuelve a la página 1.
- Las filas abren el mismo detalle por `affiliate.id`, que la API sigue autorizando con `view`.
- Al cambiar de cuenta u organización se limpia el campo y se descartan los resultados: el `orgId` forma parte de la clave, y los dominios `affiliate` ya se invalidan en `OrganizationProvider`.
- Pruebas con HTTP simulado: búsqueda que llega al servidor con `search`, respuesta fuera de orden descartada, paginación filtrada, sin resultados, error, API sin `meta.search`, cambio de organización y apertura del detalle correcto.

## 6. Decisiones pendientes

1. **Alcance:** solo la red directa, como muestra la pantalla hoy (propuesta mínima), o toda la descendencia visible. Lo segundo pediría un endpoint aparte, por ejemplo `GET /affiliates/me/descendants?type&max_depth&search`, sujeto a los límites de profundidad que ya documenta `descendants`.
2. **Criterio:** solo nombre (lo pedido), o también `affiliate_code`, que la persona comparte como código de referido.
3. **Entrega:** si Mobile debe esperar a que el contrato esté desplegado, o implementarse ya contra este contrato, desactivado hasta que la API responda con `meta.search`.
