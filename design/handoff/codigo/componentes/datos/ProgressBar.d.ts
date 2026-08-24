import * as React from "react";

/** Avance hacia una meta de periodo. Nunca para tiempos de carga indeterminados. */
export interface ProgressBarProps {
  valor?: number;
  max?: number;
  etiqueta?: string;
  /** Texto de meta a la derecha, en mono ("8 / 20"). */
  meta?: string;
  tono?: "marca" | "exito";
  style?: React.CSSProperties;
}
export function ProgressBar(props: ProgressBarProps): JSX.Element;
