import * as React from "react";

/** Filtro o valor removible. Con `onClick` se comporta como filtro alternable. */
export interface TagProps {
  activo?: boolean;
  onClick?: () => void;
  onQuitar?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export function Tag(props: TagProps): JSX.Element;
