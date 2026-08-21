import * as React from "react";

/** Lista vacía: una oración de causa y una acción. Nunca un dibujo decorativo. */
export interface EmptyStateProps {
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
  style?: React.CSSProperties;
}
export function EmptyState(props: EmptyStateProps): JSX.Element;
