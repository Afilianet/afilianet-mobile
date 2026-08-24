import * as React from "react";

/**
 * Resumen de un nivel de la red. La opacidad del nodo baja con la profundidad,
 * igual que en el ideograma de marca.
 * @startingPoint section="Datos" subtitle="Niveles de red con comisión acumulada" viewport="700x260"
 */
export interface NivelNodoProps {
  nivel?: number;
  personas?: number;
  /** Comisión acumulada del nivel, ya formateada ("$3,120"). */
  comision?: string;
  activo?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export function NivelNodo(props: NivelNodoProps): JSX.Element;
