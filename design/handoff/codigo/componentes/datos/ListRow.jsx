import React from "react";

export function ListRow({ medio, titulo, subtitulo, valor, valorSecundario, derecha, onClick, style }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: "var(--esp-3)",
        minHeight: 64, padding: "var(--esp-3) var(--esp-4)",
        background: hover && onClick ? "var(--superficie-2)" : "transparent",
        borderRadius: "var(--radio-md)", cursor: onClick ? "pointer" : "default",
        transition: "background var(--dur-instante) var(--ease-estandar)", ...style
      }}
    >
      {medio}
      <div style={{ display: "grid", gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: "var(--texto-sm)", fontWeight: 600, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</span>
        {subtitulo && <span style={{ fontSize: "var(--texto-2xs)", color: "var(--texto-3)" }}>{subtitulo}</span>}
      </div>
      {(valor || valorSecundario) && (
        <div style={{ display: "grid", gap: 2, textAlign: "right" }}>
          {valor && <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--texto-sm)", fontWeight: 500 }}>{valor}</span>}
          {valorSecundario && <span style={{ fontSize: "var(--texto-2xs)", color: "var(--texto-3)" }}>{valorSecundario}</span>}
        </div>
      )}
      {derecha}
    </div>
  );
}
