import * as React from "react";

/**
 * Cifra destacada del panel: comisiones del periodo, personas en la red, conversión.
 * @startingPoint section="Datos" subtitle="Cifras del panel con delta y nota" viewport="700x200"
 */
export interface StatCardProps {
  etiqueta: string;
  valor: string;
  /** Cambio respecto al periodo anterior, ya formateado ("+4", "−2.1%"). */
  delta?: string;
  tono?: "neutro" | "positivo" | "negativo";
  nota?: string;
  style?: React.CSSProperties;
}
export function StatCard(props: StatCardProps): JSX.Element;
