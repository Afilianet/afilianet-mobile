import React from "react";

export function Tag({ activo = false, onClick, onQuitar, children, style }) {
  const clicable = Boolean(onClick);
  return (
    <span
      onClick={onClick}
      role={clicable ? "button" : undefined}
      tabIndex={clicable ? 0 : undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px",
        borderRadius: "var(--radio-pill)",
        background: activo ? "var(--violeta-500)" : "var(--superficie-2)",
        color: activo ? "var(--texto-sobre-marca)" : "var(--texto-2)",
        border: `${activo ? 2 : 1}px solid ${activo ? "var(--violeta-400)" : "var(--borde-suave)"}`,
        fontSize: "var(--texto-xs)", fontWeight: 500,
        cursor: clicable ? "pointer" : "default",
        transition: "background var(--dur-instante) var(--ease-estandar)", ...style
      }}
    >
      {children}
      {onQuitar && (
        <span onClick={(e) => { e.stopPropagation(); onQuitar(); }}
          style={{ cursor: "pointer", opacity: 0.7, fontSize: 14, lineHeight: 1 }}>×</span>
      )}
    </span>
  );
}
