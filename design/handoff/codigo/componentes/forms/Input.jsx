import React from "react";

export function Input({
  etiqueta, valor, onChange, placeholder, tipo = "text", ayuda, error,
  prefijo = null, sufijo = null, mono = false, deshabilitado = false, id, style
}) {
  const [foco, setFoco] = React.useState(false);
  const idc = id || React.useId();
  const bordeColor = error ? "var(--error-500)" : foco ? "var(--violeta-400)" : "var(--borde-suave)";
  return (
    <div style={{ display: "grid", gap: "var(--esp-2)", ...style }}>
      {etiqueta && (
        <label htmlFor={idc} style={{ fontSize: "var(--texto-xs)", fontWeight: 600, color: "var(--texto-2)" }}>{etiqueta}</label>
      )}
      <div style={{
        display: "flex", alignItems: "center", gap: "var(--esp-2)", height: 48,
        padding: "0 14px", borderRadius: "var(--radio-md)",
        background: deshabilitado ? "var(--noche-800)" : "var(--superficie-1)",
        border: `${foco || error ? 2 : 1}px solid ${bordeColor}`,
        boxShadow: foco ? "var(--anillo-foco)" : "none",
        transition: "border-color var(--dur-instante) var(--ease-estandar)"
      }}>
        {prefijo && <span style={{ color: "var(--texto-3)", display: "grid", placeItems: "center" }}>{prefijo}</span>}
        <input
          id={idc} type={tipo} value={valor} placeholder={placeholder} disabled={deshabilitado}
          onChange={(e) => onChange && onChange(e.target.value)}
          onFocus={() => setFoco(true)} onBlur={() => setFoco(false)}
          style={{
            flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
            color: deshabilitado ? "var(--noche-500)" : "var(--texto-1)",
            fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
            fontSize: "var(--texto-md)", letterSpacing: mono ? "0.02em" : "0"
          }}
        />
        {sufijo && <span style={{ color: "var(--texto-3)" }}>{sufijo}</span>}
      </div>
      {(error || ayuda) && (
        <span style={{ fontSize: "var(--texto-2xs)", color: error ? "var(--error-500)" : "var(--texto-3)" }}>{error || ayuda}</span>
      )}
    </div>
  );
}
