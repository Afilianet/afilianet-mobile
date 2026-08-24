import React from "react";

export function Toast({ mensaje, tono = "neutro", accion, onAccion, style }) {
  const borde = tono === "exito" ? "rgba(45,212,191,0.4)" : tono === "error" ? "rgba(255,106,94,0.4)" : "var(--borde-suave)";
  const punto = tono === "exito" ? "var(--aqua-500)" : tono === "error" ? "var(--error-500)" : "var(--violeta-400)";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "var(--esp-3)",
      padding: "12px 16px", borderRadius: "var(--radio-md)",
      background: "rgba(28,23,48,0.92)", backdropFilter: "var(--vidrio)",
      border: `1px solid ${borde}`, boxShadow: "var(--sombra-3)",
      color: "var(--texto-1)", fontSize: "var(--texto-sm)", ...style
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: punto, flex: "0 0 auto" }} />
      <span style={{ flex: 1 }}>{mensaje}</span>
      {accion && (
        <button onClick={onAccion} style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          color: "var(--violeta-300)", fontFamily: "var(--font-sans)",
          fontSize: "var(--texto-xs)", fontWeight: 600
        }}>{accion}</button>
      )}
    </div>
  );
}
