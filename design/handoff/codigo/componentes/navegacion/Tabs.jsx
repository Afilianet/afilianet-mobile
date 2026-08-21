import React from "react";

export function Tabs({ opciones = [], valor, onChange, ancho = false, style }) {
  return (
    <div role="tablist" style={{
      display: "inline-flex", gap: 4, padding: 4, borderRadius: "var(--radio-md)",
      background: "var(--superficie-1)", border: "1px solid var(--borde-suave)",
      width: ancho ? "100%" : "auto", ...style
    }}>
      {opciones.map((o) => {
        const v = o.valor ?? o;
        const activo = v === valor;
        return (
          <button
            key={v} role="tab" aria-selected={activo} onClick={() => onChange && onChange(v)}
            style={{
              flex: ancho ? 1 : "0 0 auto", height: 36, padding: "0 16px",
              borderRadius: "var(--radio-sm)", border: "none",
              background: activo ? "var(--violeta-500)" : "transparent",
              color: activo ? "var(--texto-sobre-marca)" : "var(--texto-2)",
              fontFamily: "var(--font-sans)", fontSize: "var(--texto-xs)", fontWeight: 600,
              cursor: "pointer", transition: "background var(--dur-instante) var(--ease-estandar)"
            }}
          >{o.etiqueta ?? o}</button>
        );
      })}
    </div>
  );
}
