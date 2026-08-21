import * as React from "react";

/** Confirmación breve, 4 segundos. Nunca para errores que requieren decisión. */
export interface ToastProps {
  mensaje: string;
  tono?: "neutro" | "exito" | "error";
  accion?: string;
  onAccion?: () => void;
  style?: React.CSSProperties;
}
export function Toast(props: ToastProps): JSX.Element;
