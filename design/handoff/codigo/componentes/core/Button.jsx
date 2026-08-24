import React from "react";

const paletas = {
  primario: {
    fondo: "var(--accion-primaria)", texto: "var(--texto-sobre-marca)",
    borde: "transparent", hover: "var(--accion-primaria-hover)",
    activo: "var(--accion-primaria-activa)", sombra: "var(--resplandor-marca)"
  },
  secundario: {
    fondo: "var(--superficie-2)", texto: "var(--texto-1)",
    borde: "var(--borde-suave)", hover: "var(--noche-700)",
    activo: "var(--noche-800)", sombra: "none"
  },
  fantasma: {
    fondo: "transparent", texto: "var(--texto-1)",
    borde: "transparent", hover: "var(--superficie-2)",
    activo: "var(--superficie-1)", sombra: "none"
  },
  peligro: {
    fondo: "var(--error-500)", texto: "#2A0C0A",
    borde: "transparent", hover: "#FF837A",
    activo: "#E8574C", sombra: "none"
  }
};

const tallas = {
  sm: { alto: 36, px: 14, fuente: "var(--texto-sm)", radio: "var(--radio-sm)" },
  md: { alto: 44, px: 20, fuente: "var(--texto-sm)", radio: "var(--radio-md)" },
  lg: { alto: 52, px: 26, fuente: "var(--texto-md)", radio: "var(--radio-md)" }
};

export function Button({
  variante = "primario", talla = "md", ancho = false, deshabilitado = false,
  iconoIzq = null, iconoDer = null, children, onClick, type = "button", style, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [presion, setPresion] = React.useState(false);
  const p = paletas[variante] || paletas.primario;
  const t = tallas[talla] || tallas.md;

  const fondo = deshabilitado ? "var(--noche-800)" : presion ? p.activo : hover ? p.hover : p.fondo;

  return (
    <button
      type={type}
      disabled={deshabilitado}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPresion(false); }}
      onMouseDown={() => setPresion(true)}
      onMouseUp={() => setPresion(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: "var(--esp-2)", height: t.alto, minWidth: t.alto,
        padding: `0 ${t.px}px`, width: ancho ? "100%" : "auto",
        borderRadius: t.radio, border: `1px solid ${deshabilitado ? "transparent" : p.borde}`,
        background: fondo, color: deshabilitado ? "var(--noche-500)" : p.texto,
        fontFamily: "var(--font-sans)", fontSize: t.fuente, fontWeight: 600,
        letterSpacing: "-0.01em", lineHeight: 1, cursor: deshabilitado ? "not-allowed" : "pointer",
        boxShadow: deshabilitado || hover ? "none" : p.sombra,
        transform: presion && !deshabilitado ? "scale(var(--escala-presion))" : "none",
        transition: "background var(--dur-instante) var(--ease-estandar), transform var(--dur-instante) var(--ease-estandar)",
        ...style
      }}
      {...rest}
    >
      {iconoIzq}
      {children}
      {iconoDer}
    </button>
  );
}
