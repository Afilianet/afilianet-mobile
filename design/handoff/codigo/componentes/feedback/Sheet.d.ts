import * as React from "react";

/** Hoja inferior del app móvil. En web, úsala solo para acciones cortas. */
export interface SheetProps {
  abierta?: boolean;
  titulo?: string;
  onCerrar?: () => void;
  children?: React.ReactNode;
  /** Botones de cierre; el primario va a ancho completo. */
  pie?: React.ReactNode;
  style?: React.CSSProperties;
}
export function Sheet(props: SheetProps): JSX.Element | null;
