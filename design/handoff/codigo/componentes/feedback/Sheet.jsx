import React from "react";

export function Sheet({ abierta = false, titulo, onCerrar, children, pie, style }) {
  if (!abierta) return null;
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", alignItems: "flex-end",
      background: "rgba(12,10,20,0.62)", backdropFilter: "blur(2px)", zIndex: 40
    }} onClick={onCerrar}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", background: "var(--superficie-elevada)",
          borderRadius: "var(--radio-2xl) var(--radio-2xl) 0 0",
          borderTop: "1px solid var(--borde-suave)",
          boxShadow: "var(--sombra-4), var(--anillo-interno)",
          padding: "var(--esp-4) var(--esp-5) var(--esp-6)",
          display: "grid", gap: "var(--esp-4)",
          animation: "afn-subir var(--dur-media) var(--ease-salida)", ...style
        }}
      >
        <span style={{ width: 40, height: 4, borderRadius: 999, background: "var(--borde-fuerte)", margin: "0 auto" }} />
        {titulo && <h3 style={{ fontSize: "var(--texto-xl)", fontWeight: 800, letterSpacing: "var(--track-titulo)" }}>{titulo}</h3>}
        <div style={{ display: "grid", gap: "var(--esp-3)" }}>{children}</div>
        {pie}
      </div>
      <style>{"@keyframes afn-subir{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}"}</style>
    </div>
  );
}
