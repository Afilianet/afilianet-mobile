import * as React from "react";

/**
 * Contenedor base. Radio 20px, borde de 1px, sin sombra en tema oscuro.
 * @startingPoint section="Core" subtitle="Tarjeta base y variante elevada" viewport="700x200"
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: number;
  borde?: boolean;
  /** Superficie que flota: hojas, popovers. Añade sombra y anillo interno. */
  elevada?: boolean;
  children?: React.ReactNode;
}
export function Card(props: CardProps): JSX.Element;
