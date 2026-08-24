import * as React from "react";

/** Botón de un solo icono. `etiqueta` es obligatoria: el icono nunca comunica solo. */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  etiqueta: string;
  talla?: number;
  variante?: "fantasma" | "secundario" | "primario";
  deshabilitado?: boolean;
  children?: React.ReactNode;
}
export function IconButton(props: IconButtonProps): JSX.Element;
