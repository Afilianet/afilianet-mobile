import React from "react";

export function ProgressBar({ valor = 0, max = 100, etiqueta, meta, tono = "marca", style }) {
  const pct = Math.max(0, Math.min(100, (valor / max) * 100));
  const color = tono === "exito" ? "var(--aqua-500)" : "var(--violeta-500)";
  return (
    <div style={{ display: "grid", gap: "var(--esp-2)", ...style }}>
      {(etiqueta || meta) && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--texto-2xs)" }}>
          <span style={{ color: "var(--texto-2)" }}>{etiqueta}</span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--texto-3)" }}>{meta}</span>
        </div>
      )}
      <div style={{ height: 8, borderRadius: "var(--radio-pill)", background: "var(--superficie-2)", overflow: "hidden" }}>
        <div style={{
          width: pct + "%", height: "100%", borderRadius: "var(--radio-pill)", background: color,
          transition: "width var(--dur-media) var(--ease-salida)"
        }} />
      </div>
    </div>
  );
}
