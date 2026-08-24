import * as React from "react";

export interface OpcionSelect { valor: string; etiqueta: string; }

/** Lista cerrada de opciones. Para 2 o 3 opciones cortas usa `Tabs` o `Tag`. */
export interface SelectProps {
  etiqueta?: string;
  valor?: string;
  onChange?: (valor: string) => void;
  opciones?: (OpcionSelect | string)[];
  ayuda?: string;
  deshabilitado?: boolean;
  id?: string;
  style?: React.CSSProperties;
}
export function Select(props: SelectProps): JSX.Element;
