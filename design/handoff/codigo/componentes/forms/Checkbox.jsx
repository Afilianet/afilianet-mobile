import React from "react";

export function Checkbox({ marcado = false, onChange, etiqueta, descripcion, deshabilitado = false, style }) {
  return (
    <label style={{
      display: "flex", gap: "var(--esp-3)", alignItems: "flex-start",
      cursor: deshabilitado ? "not-allowed" : "pointer", minHeight: "var(--toque-min)", ...style
    }}>
      <span
        onClick={() => !deshabilitado && onChange && onChange(!marcado)}
        role="checkbox" aria-checked={marcado} tabIndex={0}
        style={{
          width: 22, height: 22, marginTop: 2, flex: "0 0 auto", borderRadius: 6,
          display: "grid", placeItems: "center",
          background: marcado ? "var(--violeta-500)" : "transparent",
          border: `${marcado ? 2 : 1}px solid ${marcado ? "var(--violeta-400)" : "var(--borde-fuerte)"}`,
          transition: "background var(--dur-instante) var(--ease-estandar)"
        }}
      >
        {marcado && (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 6.5L4.6 9L10 3.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span style={{ display: "grid", gap: 2 }}>
        <span style={{ fontSize: "var(--texto-sm)", color: deshabilitado ? "var(--noche-500)" : "var(--texto-1)" }}>{etiqueta}</span>
        {descripcion && <span style={{ fontSize: "var(--texto-2xs)", color: "var(--texto-3)" }}>{descripcion}</span>}
      </span>
    </label>
  );
}
