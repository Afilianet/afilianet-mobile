import React from "react";

export function StatCard({ etiqueta, valor, delta, tono = "neutro", nota, style }) {
  const colorDelta = tono === "positivo" ? "var(--aqua-500)" : tono === "negativo" ? "var(--error-500)" : "var(--texto-3)";
  return (
    <div style={{
      background: "var(--superficie-1)", border: "1px solid var(--borde-suave)",
      borderRadius: "var(--radio-xl)", padding: "var(--esp-5)",
      display: "grid", gap: "var(--esp-2)", ...style
    }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "var(--texto-3xs)",
        letterSpacing: "var(--track-etiqueta)", textTransform: "uppercase", color: "var(--texto-3)"
      }}>{etiqueta}</span>
      <span style={{ fontSize: "var(--texto-3xl)", fontWeight: 800, letterSpacing: "var(--track-display)", lineHeight: 1.05 }}>{valor}</span>
      {(delta || nota) && (
        <span style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: "var(--texto-2xs)" }}>
          {delta && <span style={{ color: colorDelta, fontWeight: 600 }}>{delta}</span>}
          {nota && <span style={{ color: "var(--texto-3)" }}>{nota}</span>}
        </span>
      )}
    </div>
  );
}
