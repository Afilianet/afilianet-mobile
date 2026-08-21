import React from "react";

export function Card({ padding = 24, borde = true, elevada = false, children, style, ...rest }) {
  return (
    <div style={{
      background: elevada ? "var(--superficie-elevada)" : "var(--superficie-1)",
      border: borde ? "1px solid var(--borde-suave)" : "none",
      borderRadius: "var(--radio-xl)", padding,
      boxShadow: elevada ? "var(--sombra-2), var(--anillo-interno)" : "none",
      ...style
    }} {...rest}>{children}</div>
  );
}
