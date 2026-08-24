Botón de acción; úsalo para cualquier acción tocable que no sea un enlace de navegación.

```jsx
<Button variante="primario" talla="lg" ancho onClick={invitar}>Invitar a mi red</Button>
```

Variantes: `primario` (una sola por pantalla, lleva resplandor violeta en reposo), `secundario` (superficie neutra con borde), `fantasma` (acciones de fila y barras), `peligro` (salir, eliminar). Tallas 36 / 44 / 52 px; en móvil nunca uses `sm` como acción principal porque rompe el mínimo táctil de 44 px.
