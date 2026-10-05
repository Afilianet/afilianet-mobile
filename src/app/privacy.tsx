import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ScrollView, Text } from "react-native";
import { apiRequest } from "../api/client";
import { Button } from "../components/ui/Button";
import { colors, spacing, typography } from "../components/ui/theme";

type Notice = { version: string; controller_name: string; controller_address: string; contact_email: string; deletion_response_days: number; deletion_response_days_kind: string; sections: { title: string; text: string }[] };

export default function PrivacyScreen() {
  const router = useRouter();
  const query = useQuery({ queryKey: ["privacy-notice"], retry: false, queryFn: () => apiRequest<{ data: Notice }>("/api/v1/privacy/notice", { skipAuth: true, skipOrganization: true }) });
  const notice = query.data?.data;
  return <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background }}>
    <Text style={typography.title}>Aviso de privacidad</Text>
    {query.isPending ? <Text>Cargando aviso…</Text> : null}
    {query.isError ? <><Text accessibilityRole="alert">El aviso no está disponible por el momento.</Text><Button label="Reintentar" onPress={() => void query.refetch()} /></> : null}
    {notice ? <>
      <Text>Versión: {notice.version}</Text>
      <Text>Responsable: {notice.controller_name}</Text>
      <Text>{notice.controller_address}</Text>
      <Text selectable>Contacto de privacidad: {notice.contact_email}</Text>
      {notice.sections.map((section) => <Text key={section.title} style={typography.body}>{section.title}{"\n"}{section.text}</Text>)}
      <Text>Plazo de respuesta a solicitudes de eliminación: {notice.deletion_response_days} días {notice.deletion_response_days_kind}.</Text>
    </> : null}
    <Button label="Volver" variant="secondary" onPress={() => router.canGoBack() ? router.back() : router.replace("/(auth)/login" as never)} />
  </ScrollView>;
}
