import React from "react";

const tonos = {
  neutro: { bg: "var(--superficie-2)", fg: "var(--texto-2)", bd: "var(--borde-suave)" },
  marca: { bg: "var(--violeta-500)", fg: "var(--texto-sobre-marca)", bd: "transparent" },
  exito: { bg: "rgba(45,212,191,0.14)", fg: "var(--aqua-500)", bd: "rgba(45,212,191,0.3)" },
  alerta: { bg: "rgba(242,185,75,0.14)", fg: "var(--alerta-500)", bd: "rgba(242,185,75,0.32)" },
  error: { bg: "rgba(255,106,94,0.14)", fg: "var(--error-500)", bd: "rgba(255,106,94,0.32)" }
};

export function Badge({ tono = "neutro", mono = false, children, style }) {
  const t = tonos[tono] || tonos.neutro;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", height: 24, padding: "0 10px",
      borderRadius: "var(--radio-pill)", background: t.bg, color: t.fg,
      border: `1px solid ${t.bd}`,
      fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
      fontSize: "var(--texto-2xs)", fontWeight: mono ? 500 : 600,
      letterSpacing: mono ? "var(--track-etiqueta)" : "0",
      textTransform: mono ? "uppercase" : "none", whiteSpace: "nowrap", ...style
    }}>{children}</span>
  );
}
