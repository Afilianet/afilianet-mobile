import * as React from "react";

/** Casilla de verificación con etiqueta y descripción opcional. */
export interface CheckboxProps {
  marcado?: boolean;
  onChange?: (marcado: boolean) => void;
  etiqueta?: string;
  descripcion?: string;
  deshabilitado?: boolean;
  style?: React.CSSProperties;
}
export function Checkbox(props: CheckboxProps): JSX.Element;
