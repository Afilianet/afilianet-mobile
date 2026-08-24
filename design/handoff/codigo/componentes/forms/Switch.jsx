import React from "react";

export function Switch({ activo = false, onChange, etiqueta, descripcion, deshabilitado = false, style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--esp-4)", minHeight: "var(--toque-min)", ...style }}>
      <span style={{ display: "grid", gap: 2, flex: 1 }}>
        {etiqueta && <span style={{ fontSize: "var(--texto-sm)", fontWeight: 500, color: "var(--texto-1)" }}>{etiqueta}</span>}
        {descripcion && <span style={{ fontSize: "var(--texto-2xs)", color: "var(--texto-3)" }}>{descripcion}</span>}
      </span>
      <button
        type="button" role="switch" aria-checked={activo} aria-label={etiqueta} disabled={deshabilitado}
        onClick={() => onChange && onChange(!activo)}
        style={{
          width: 48, height: 28, flex: "0 0 auto", borderRadius: "var(--radio-pill)",
          border: "1px solid " + (activo ? "var(--violeta-400)" : "var(--borde-fuerte)"),
          background: deshabilitado ? "var(--noche-800)" : activo ? "var(--violeta-500)" : "var(--superficie-2)",
          padding: 2, cursor: deshabilitado ? "not-allowed" : "pointer",
          transition: "background var(--dur-rapida) var(--ease-estandar)"
        }}
      >
        <span style={{
          display: "block", width: 22, height: 22, borderRadius: "var(--radio-pill)",
          background: activo ? "#fff" : "var(--noche-300)",
          transform: `translateX(${activo ? 20 : 0}px)`,
          transition: "transform var(--dur-rapida) var(--ease-salida)"
        }} />
      </button>
    </div>
  );
}
