import React from "react";

export function NivelNodo({ nivel = 1, personas = 0, comision, activo = false, onClick, style }) {
  const [hover, setHover] = React.useState(false);
  const intensidad = Math.max(0.2, 1 - (nivel - 1) * 0.22);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: "var(--esp-4)",
        padding: "var(--esp-4)", borderRadius: "var(--radio-lg)",
        background: activo || hover ? "var(--superficie-2)" : "var(--superficie-1)",
        border: `${activo ? 2 : 1}px solid ${activo ? "var(--violeta-400)" : "var(--borde-suave)"}`,
        cursor: onClick ? "pointer" : "default",
        transition: "background var(--dur-instante) var(--ease-estandar)", ...style
      }}
    >
      <span style={{
        width: 40, height: 40, flex: "0 0 auto", borderRadius: 12,
        background: "var(--violeta-500)", opacity: intensidad,
        display: "grid", placeItems: "center", fontFamily: "var(--font-mono)",
        fontSize: "var(--texto-sm)", fontWeight: 700, color: "#fff"
      }}>{nivel}</span>
      <div style={{ display: "grid", gap: 2, flex: 1 }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: "var(--texto-3xs)",
          letterSpacing: "var(--track-etiqueta)", textTransform: "uppercase", color: "var(--texto-3)"
        }}>Nivel {nivel}</span>
        <span style={{ fontSize: "var(--texto-sm)", fontWeight: 600 }}>{personas} personas</span>
      </div>
      {comision && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--texto-sm)", color: "var(--aqua-500)" }}>{comision}</span>
      )}
    </div>
  );
}
