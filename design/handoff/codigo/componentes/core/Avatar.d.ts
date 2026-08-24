import * as React from "react";

/** Retrato o iniciales de una persona de la red. */
export interface AvatarProps {
  nombre?: string;
  src?: string | null;
  talla?: number;
  tono?: "marca" | "neutro";
  style?: React.CSSProperties;
}
export function Avatar(props: AvatarProps): JSX.Element;
