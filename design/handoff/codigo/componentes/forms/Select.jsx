import React from "react";

export function Select({ etiqueta, valor, onChange, opciones = [], ayuda, deshabilitado = false, id, style }) {
  const idc = id || React.useId();
  return (
    <div style={{ display: "grid", gap: "var(--esp-2)", ...style }}>
      {etiqueta && <label htmlFor={idc} style={{ fontSize: "var(--texto-xs)", fontWeight: 600, color: "var(--texto-2)" }}>{etiqueta}</label>}
      <select
        id={idc} value={valor} disabled={deshabilitado}
        onChange={(e) => onChange && onChange(e.target.value)}
        style={{
          height: 48, padding: "0 14px", borderRadius: "var(--radio-md)",
          background: deshabilitado ? "var(--noche-800)" : "var(--superficie-1)",
          border: "1px solid var(--borde-suave)",
          color: deshabilitado ? "var(--noche-500)" : "var(--texto-1)",
          fontFamily: "var(--font-sans)", fontSize: "var(--texto-md)",
          appearance: "none", cursor: deshabilitado ? "not-allowed" : "pointer"
        }}
      >
        {opciones.map((o) => (
          <option key={o.valor ?? o} value={o.valor ?? o}>{o.etiqueta ?? o}</option>
        ))}
      </select>
      {ayuda && <span style={{ fontSize: "var(--texto-2xs)", color: "var(--texto-3)" }}>{ayuda}</span>}
    </div>
  );
}
