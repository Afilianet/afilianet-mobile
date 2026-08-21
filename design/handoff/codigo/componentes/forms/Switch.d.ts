import * as React from "react";

/** Interruptor de ajuste; aplica de inmediato, sin botón de guardar. */
export interface SwitchProps {
  activo?: boolean;
  onChange?: (activo: boolean) => void;
  etiqueta?: string;
  descripcion?: string;
  deshabilitado?: boolean;
  style?: React.CSSProperties;
}
export function Switch(props: SwitchProps): JSX.Element;
