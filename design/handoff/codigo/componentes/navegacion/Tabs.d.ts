import * as React from "react";

export interface OpcionTab { valor: string; etiqueta: string; }

/**
 * Segmentado de 2 a 4 vistas del mismo conjunto de datos.
 * @startingPoint section="Navegación" subtitle="Segmentado de vistas" viewport="700x150"
 */
export interface TabsProps {
  opciones?: (OpcionTab | string)[];
  valor?: string;
  onChange?: (valor: string) => void;
  ancho?: boolean;
  style?: React.CSSProperties;
}
export function Tabs(props: TabsProps): JSX.Element;
