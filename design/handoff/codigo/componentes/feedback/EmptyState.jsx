import React from "react";

export function EmptyState({ titulo, descripcion, accion, style }) {
  return (
    <div style={{
      display: "grid", gap: "var(--esp-4)", justifyItems: "center", textAlign: "center",
      padding: "var(--esp-10) var(--esp-6)",
      background: "var(--superficie-1)", border: "1px solid var(--borde-suave)",
      borderRadius: "var(--radio-xl)", ...style
    }}>
      <img src="../../assets/logo/ideograma-violeta.svg" width="40" height="40" alt="" style={{ opacity: 0.5 }} />
      <div style={{ display: "grid", gap: "var(--esp-2)", maxWidth: "40ch" }}>
        <span style={{ fontSize: "var(--texto-lg)", fontWeight: 700, letterSpacing: "var(--track-titulo)" }}>{titulo}</span>
        {descripcion && <span style={{ fontSize: "var(--texto-sm)", color: "var(--texto-2)" }}>{descripcion}</span>}
      </div>
      {accion}
    </div>
  );
}
