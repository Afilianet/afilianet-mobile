import React from "react";

export function IconButton({ etiqueta, talla = 44, variante = "fantasma", deshabilitado = false, children, onClick, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const fondos = {
    fantasma: "transparent",
    secundario: "var(--superficie-2)",
    primario: "var(--accion-primaria)"
  };
  return (
    <button
      type="button" aria-label={etiqueta} disabled={deshabilitado} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: talla, height: talla, display: "inline-grid", placeItems: "center",
        borderRadius: "var(--radio-md)", border: "1px solid " + (variante === "secundario" ? "var(--borde-suave)" : "transparent"),
        background: hover && !deshabilitado ? (variante === "primario" ? "var(--accion-primaria-hover)" : "var(--superficie-2)") : fondos[variante],
        color: deshabilitado ? "var(--noche-500)" : variante === "primario" ? "var(--texto-sobre-marca)" : "var(--texto-1)",
        cursor: deshabilitado ? "not-allowed" : "pointer", padding: 0,
        transition: "background var(--dur-instante) var(--ease-estandar)",
        ...style
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
