import React from "react";

export function Avatar({ nombre = "", src = null, talla = 40, tono = "marca", style }) {
  const iniciales = nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0] || "").join("").toUpperCase();
  const fondos = { marca: "var(--violeta-700)", neutro: "var(--noche-700)" };
  return (
    <span style={{
      width: talla, height: talla, borderRadius: "var(--radio-pill)", overflow: "hidden",
      display: "inline-grid", placeItems: "center", flex: "0 0 auto",
      background: fondos[tono] || fondos.marca, color: "var(--texto-1)",
      fontSize: Math.round(talla * 0.36), fontWeight: 700, letterSpacing: "-0.02em", ...style
    }}>
      {src ? <img src={src} alt="" width={talla} height={talla} style={{ objectFit: "cover" }} /> : iniciales}
    </span>
  );
}
