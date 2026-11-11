import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { colors, spacing, typography } from "../ui/theme";
import { PRIVACY_CONTACT_EMAIL, PRIVACY_MAILTO, PUBLIC_DELETION_URL, PUBLIC_PRIVACY_URL } from "../../config/publicPrivacy";

type Props = {
  /** «Escribir a privacidad»: the visible, copyable address plus a button that opens the mail app. */
  mail?: boolean;
  /** The public privacy notice on afilianet.mx. */
  privacy?: boolean;
  privacyLabel?: string;
  /** «Cómo eliminar tu cuenta»: the published deletion procedure. */
  deletion?: boolean;
};

/**
 * Fixed public destinations (config/publicPrivacy.ts). Nothing here calls the API,
 * so the links stay available when it fails or there is no session. Opening the
 * mail app only starts a draft: nothing is ever said to have been sent.
 */
export function PublicPrivacyLinks({ mail = false, privacy = false, privacyLabel = "Aviso de privacidad", deletion = true }: Props) {
  const [problem, setProblem] = useState<"mail" | "web" | null>(null);
  const [copied, setCopied] = useState(false);

  async function open(url: string, kind: "mail" | "web") {
    setCopied(false);
    try {
      await Linking.openURL(url);
      setProblem(null);
    } catch {
      setProblem(kind);
    }
  }

  async function copy() {
    try {
      await Clipboard.setStringAsync(PRIVACY_CONTACT_EMAIL);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <View style={styles.box}>
      {mail ? (
        <>
          <Text selectable style={styles.body} testID="privacy-contact-email">
            Correo de privacidad: {PRIVACY_CONTACT_EMAIL}
          </Text>
          <Button
            label="Escribir a privacidad"
            variant="secondary"
            accessibilityHint="Abre tu aplicación de correo con el asunto Privacidad Afilianet. No envía nada por sí solo."
            onPress={() => void open(PRIVACY_MAILTO, "mail")}
          />
        </>
      ) : null}
      {deletion ? (
        <Button
          label="Cómo eliminar tu cuenta"
          variant="ghost"
          accessibilityHint="Abre la página pública de afilianet.mx en el navegador."
          onPress={() => void open(PUBLIC_DELETION_URL, "web")}
        />
      ) : null}
      {privacy ? (
        <Button
          label={privacyLabel}
          variant="ghost"
          accessibilityHint="Abre la página pública de afilianet.mx en el navegador."
          onPress={() => void open(PUBLIC_PRIVACY_URL, "web")}
        />
      ) : null}
      {problem ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" selectable style={styles.body} testID="public-privacy-open-failed">
          {problem === "mail"
            ? `No pudimos abrir una aplicación de correo. No se envió ninguna solicitud. Puedes copiar la dirección ${PRIVACY_CONTACT_EMAIL} y escribir con el asunto «Privacidad Afilianet», o consultar ${PUBLIC_DELETION_URL}.`
            : `No pudimos abrir el navegador. Puedes escribir la dirección en tu navegador: ${PUBLIC_DELETION_URL} (eliminación) o ${PUBLIC_PRIVACY_URL} (aviso de privacidad).`}
        </Text>
      ) : null}
      {problem === "mail" ? <Button label="Copiar correo" variant="ghost" onPress={() => void copy()} /> : null}
      {copied ? <Text accessibilityLiveRegion="polite" style={styles.body}>Correo copiado.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  body: { ...typography.body, color: colors.textSecondary },
});
