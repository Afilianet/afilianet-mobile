import * as React from "react";

/**
 * Fila de lista: persona de la red, pago, venta.
 * @startingPoint section="Datos" subtitle="Filas de red y de pagos" viewport="700x240"
 */
export interface ListRowProps {
  /** Avatar, ideograma de nivel o icono a la izquierda. */
  medio?: React.ReactNode;
  titulo?: React.ReactNode;
  subtitulo?: React.ReactNode;
  /** Cifra alineada a la derecha; se renderiza en mono. */
  valor?: string;
  valorSecundario?: string;
  derecha?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export function ListRow(props: ListRowProps): JSX.Element;
