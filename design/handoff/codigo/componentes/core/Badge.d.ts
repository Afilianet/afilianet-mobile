import * as React from "react";

/** Etiqueta de estado, no interactiva. */
export interface BadgeProps {
  tono?: "neutro" | "marca" | "exito" | "alerta" | "error";
  /** Versalitas en mono: para niveles y metadatos ("NIVEL 2"). */
  mono?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export function Badge(props: BadgeProps): JSX.Element;
