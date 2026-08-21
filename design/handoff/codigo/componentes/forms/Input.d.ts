import * as React from "react";

/**
 * Campo de texto de una línea.
 * @startingPoint section="Formularios" subtitle="Campos, ayuda y estado de error" viewport="700x260"
 */
export interface InputProps {
  etiqueta?: string;
  valor?: string;
  onChange?: (valor: string) => void;
  placeholder?: string;
  tipo?: "text" | "email" | "tel" | "password" | "number";
  ayuda?: string;
  /** Mensaje de error; sustituye a `ayuda` y engrosa el borde. */
  error?: string;
  prefijo?: React.ReactNode;
  sufijo?: React.ReactNode;
  /** Mono para códigos de invitación, RFC, CLABE. */
  mono?: boolean;
  deshabilitado?: boolean;
  id?: string;
  style?: React.CSSProperties;
}
export function Input(props: InputProps): JSX.Element;
