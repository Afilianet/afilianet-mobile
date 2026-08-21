import * as React from "react";

/**
 * Acción principal del sistema. Verbo + objeto, 1 a 3 palabras.
 * @startingPoint section="Core" subtitle="Botones en sus cuatro variantes y tres tallas" viewport="700x220"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primario para la acción de la pantalla; solo uno por vista. */
  variante?: "primario" | "secundario" | "fantasma" | "peligro";
  talla?: "sm" | "md" | "lg";
  /** Ocupa el ancho del contenedor. Obligatorio en hojas móviles. */
  ancho?: boolean;
  deshabilitado?: boolean;
  iconoIzq?: React.ReactNode;
  iconoDer?: React.ReactNode;
  children?: React.ReactNode;
}
export function Button(props: ButtonProps): JSX.Element;
