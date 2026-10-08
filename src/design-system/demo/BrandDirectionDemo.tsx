/**
 * Isolated visual-direction demo. NOT a production screen -- see
 * src/design-system/demo/README.md for scope, how to view it, and how to
 * remove it. Synthetic data only; reuses the real Icon/Avatar components
 * and the real spacing/radius/typography/motion tokens, with color supplied
 * by the selected brandVariants palette instead of the global theme (see
 * DemoPrimitives.tsx for why).
 */
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons/Icon";
import { Avatar } from "../../components/ui/Avatar";
import { radius, spacing, typography } from "../../components/ui/theme";
import { brandVariantLabels, brandVariants, type BrandPalette, type BrandVariantKey } from "./brandDemoPalettes";
import { DemoBadge, DemoButton, DemoCard, DemoIconChip, DemoSkeleton } from "./DemoPrimitives";

type UiState = "data" | "loading" | "empty" | "error";
type Screen = "home" | "profile";

const STATE_LABELS: Record<UiState, string> = { data: "Con datos", loading: "Cargando", empty: "Vacío", error: "Error" };
const SCREEN_LABELS: Record<Screen, string> = { home: "Home", profile: "Perfil" };

export function BrandDirectionDemo() {
  const [variant, setVariant] = useState<BrandVariantKey>("proposalB");
  const [screen, setScreen] = useState<Screen>("home");
  const [uiState, setUiState] = useState<UiState>("data");
  const palette = brandVariants[variant];

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <View style={[styles.switcherBar, { borderBottomColor: palette.border }]}>
        <Text style={[styles.switcherLabel, { color: palette.textTertiary }]}>DEMO INTERNA — NO ES PRODUCCIÓN</Text>
        <SegmentRow palette={palette} options={brandVariantLabels} value={variant} onChange={(v) => setVariant(v as BrandVariantKey)} />
        <View style={styles.switcherRow}>
          <SegmentRow palette={palette} options={SCREEN_LABELS} value={screen} onChange={(v) => setScreen(v as Screen)} compact />
          <SegmentRow palette={palette} options={STATE_LABELS} value={uiState} onChange={(v) => setUiState(v as UiState)} compact />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {screen === "home" ? <HomeDemo palette={palette} uiState={uiState} /> : <ProfileDemo palette={palette} uiState={uiState} />}
      </ScrollView>
    </View>
  );
}

function SegmentRow<T extends string>({
  palette,
  options,
  value,
  onChange,
  compact = false,
}: {
  palette: BrandPalette;
  options: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.segmentRow, compact ? styles.segmentRowCompact : null]}>
      {(Object.keys(options) as T[]).map((key) => {
        const active = key === value;
        return (
          <DemoButton
            key={key}
            palette={palette}
            label={options[key]}
            size="sm"
            variant={active ? "primary" : "secondary"}
            onPress={() => onChange(key)}
          />
        );
      })}
    </View>
  );
}

function SectionHeading({ palette, icon, tone, title }: { palette: BrandPalette; icon: IconName; tone: "brand" | "success" | "warning"; title: string }) {
  return (
    <View style={styles.sectionHeadingRow}>
      <DemoIconChip palette={palette} tone={tone}>
        <Icon name={icon} size={18} color={palette.textPrimary} />
      </DemoIconChip>
      <Text style={[styles.sectionHeadingText, { color: palette.textTertiary }]}>{title}</Text>
    </View>
  );
}

function CardBody({
  palette,
  uiState,
  errorLabel,
  emptyTitle,
  emptyDescription,
  children,
}: {
  palette: BrandPalette;
  uiState: UiState;
  errorLabel: string;
  emptyTitle: string;
  emptyDescription?: string;
  children: React.ReactNode;
}) {
  if (uiState === "loading") {
    return (
      <View style={{ gap: spacing.xs }}>
        <DemoSkeleton palette={palette} />
        <DemoSkeleton palette={palette} width="60%" />
      </View>
    );
  }
  if (uiState === "error") {
    return (
      <View style={{ gap: spacing.sm, alignItems: "flex-start" }}>
        <View style={styles.errorMark}>
          <Icon name="alerta" size={18} color={palette.semantic.danger.text} />
        </View>
        <Text style={[typography.body, { color: palette.textSecondary }]}>{errorLabel}</Text>
        <Text style={[typography.numeric, { fontSize: 12, color: palette.textTertiary }]}>ERR-503 · 09:41</Text>
        <DemoButton palette={palette} label="Reintentar" size="sm" variant="secondary" onPress={() => {}} />
      </View>
    );
  }
  if (uiState === "empty") {
    return (
      <View style={{ gap: spacing.xs, alignItems: "flex-start" }}>
        <Text style={[typography.body, { color: palette.textSecondary }]}>{emptyTitle}</Text>
        {emptyDescription ? <Text style={[typography.caption, { color: palette.textTertiary }]}>{emptyDescription}</Text> : null}
      </View>
    );
  }
  return <>{children}</>;
}

function HomeDemo({ palette, uiState }: { palette: BrandPalette; uiState: UiState }) {
  return (
    <View style={styles.screenGap}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.title, { color: palette.textPrimary }]}>Hola, Daniela</Text>
          <Text style={[typography.body, { color: palette.textSecondary }]}>Afilianet Norte</Text>
        </View>
        <View style={styles.bellWrap}>
          <DemoIconChip palette={palette} tone="brand">
            <Icon name="campana" size={18} color={palette.textPrimary} />
          </DemoIconChip>
          <View style={[styles.bellDot, { backgroundColor: palette.semantic.danger.text }]} />
        </View>
      </View>

      <DemoCard palette={palette} featured actionable>
        <SectionHeading palette={palette} icon="afiliados" tone="brand" title="ESTADO DE AFILIADO" />
        <CardBody palette={palette} uiState={uiState} errorLabel="No pudimos cargar tu estado de afiliado." emptyTitle="Aún no tienes un perfil de afiliado." emptyDescription="Únete al programa para empezar.">
          <View style={styles.row}>
            <DemoBadge palette={palette} label="Activo" tone="success" />
            <Text style={[typography.body, { color: palette.textSecondary }]}>AFF-10492</Text>
          </View>
          <Text style={[typography.body, { color: palette.textSecondary }]}>Afiliado desde el 12 feb 2026</Text>
          <DemoButton palette={palette} label="Compartir enlace" variant="secondary" size="sm" iconLeft={<Icon name="compartir" size={14} color={palette.textPrimary} />} onPress={() => {}} />
        </CardBody>
      </DemoCard>

      <DemoCard palette={palette}>
        <SectionHeading palette={palette} icon="cumplimiento" tone="warning" title="VERIFICACIÓN" />
        <CardBody palette={palette} uiState={uiState} errorLabel="No pudimos cargar tu verificación." emptyTitle="Aún no has iniciado tu verificación.">
          <DemoBadge palette={palette} label="En progreso" tone="warning" />
          <Text style={[typography.body, { color: palette.textSecondary }]}>Siguiente: Documento de identidad</Text>
          <DemoButton palette={palette} label="Continuar verificación" variant="secondary" onPress={() => {}} />
        </CardBody>
      </DemoCard>

      <DemoCard palette={palette}>
        <SectionHeading palette={palette} icon="comision" tone="success" title="COMISIONES" />
        <CardBody palette={palette} uiState={uiState} errorLabel="No pudimos cargar tus comisiones." emptyTitle="Aún no tienes comisiones." emptyDescription="Aparecerán aquí en cuanto tengas tu primera venta.">
          <View style={styles.commissionRow}>
            <View>
              <Text style={[typography.body, { color: palette.textSecondary }]}>3 oct 2026</Text>
              <DemoBadge palette={palette} label="Liquidada" tone="success" />
            </View>
            <Text style={[typography.numeric, styles.amount, { color: palette.semantic.success.text }]}>+$1,240.00</Text>
          </View>
          <View style={styles.commissionRow}>
            <View>
              <Text style={[typography.body, { color: palette.textSecondary }]}>28 sep 2026</Text>
              <DemoBadge palette={palette} label="Pendiente" tone="warning" />
            </View>
            <Text style={[typography.numeric, styles.amount, { color: palette.textPrimary }]}>+$640.00</Text>
          </View>
          <DemoButton palette={palette} label="Ver todas" variant="ghost" size="sm" onPress={() => {}} />
        </CardBody>
      </DemoCard>

      <DemoCard palette={palette}>
        <SectionHeading palette={palette} icon="monedero" tone="success" title="MONEDERO" />
        <CardBody palette={palette} uiState={uiState} errorLabel="No pudimos cargar tu monedero." emptyTitle="Aún no tienes saldo.">
          <Text style={[typography.caption, { color: palette.textTertiary }]}>MXN · pendiente $320.00</Text>
          <Text style={[typography.subtitle, { color: palette.semantic.success.text }]}>$4,180.00 disponible</Text>
          <DemoButton palette={palette} label="Ver monedero" variant="ghost" size="sm" onPress={() => {}} />
        </CardBody>
      </DemoCard>

      <DemoCard palette={palette}>
        <SectionHeading palette={palette} icon="red" tone="brand" title="RED" />
        <CardBody palette={palette} uiState={uiState} errorLabel="No pudimos cargar tu red." emptyTitle="Aún no tienes actividad de red.">
          <Text style={[typography.body, { color: palette.textSecondary }]}>Referido por AFF-10021</Text>
          <Text style={[typography.body, { color: palette.textSecondary }]}>12 referidos directos</Text>
          <DemoButton palette={palette} label="Ver red" variant="ghost" size="sm" onPress={() => {}} />
        </CardBody>
      </DemoCard>
    </View>
  );
}

function ProfileDemo({ palette, uiState }: { palette: BrandPalette; uiState: UiState }) {
  return (
    <View style={styles.screenGap}>
      <DemoCard palette={palette} featured style={styles.identityRow}>
        <Avatar name="Daniela Ruiz" size={52} />
        <View>
          <Text style={[typography.subtitle, { color: palette.textPrimary }]}>Daniela Ruiz</Text>
          <Text style={[typography.body, { color: palette.textSecondary }]}>daniela.ruiz@example.com</Text>
        </View>
      </DemoCard>

      <DemoCard palette={palette}>
        <SectionHeading palette={palette} icon="afiliados" tone="brand" title="AFILIADO" />
        <CardBody palette={palette} uiState={uiState} errorLabel="No pudimos cargar tu perfil de afiliado." emptyTitle="Necesitas un perfil de afiliado.">
          <View style={styles.row}>
            <DemoBadge palette={palette} label="Activo" tone="success" />
            <Text style={[typography.body, { color: palette.textSecondary }]}>AFF-10492</Text>
          </View>
          <FieldRow palette={palette} label="Organización" value="Afilianet Norte" />
          <FieldRow palette={palette} label="Patrocinador" value="AFF-10021" />
        </CardBody>
      </DemoCard>

      <DemoCard palette={palette}>
        <SectionHeading palette={palette} icon="cumplimiento" tone="warning" title="VERIFICACIÓN" />
        <CardBody palette={palette} uiState={uiState} errorLabel="No pudimos cargar tu verificación." emptyTitle="Aún no has iniciado tu verificación.">
          <DemoBadge palette={palette} label="En progreso" tone="warning" />
          <DemoButton palette={palette} label="Ver verificación" variant="secondary" size="sm" onPress={() => {}} />
        </CardBody>
      </DemoCard>

      <DemoCard palette={palette}>
        <SectionHeading palette={palette} icon="nivel" tone="brand" title="ORGANIZACIONES" />
        <OrgRow palette={palette} name="Afilianet Norte" active />
        <OrgRow palette={palette} name="Afilianet Centro" active={false} />
      </DemoCard>

      <View style={styles.actionsGap}>
        <DemoButton palette={palette} label="Configurar notificaciones" variant="secondary" fullWidth onPress={() => {}} />
        <DemoButton palette={palette} label="Aviso de privacidad" variant="ghost" fullWidth onPress={() => {}} />
        <DemoButton palette={palette} label="Cerrar sesión" variant="secondary" fullWidth onPress={() => {}} />
      </View>
    </View>
  );
}

function FieldRow({ palette, label, value }: { palette: BrandPalette; label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={[typography.body, { color: palette.textSecondary }]}>{label}</Text>
      <Text style={[typography.body, { color: palette.textPrimary }]}>{value}</Text>
    </View>
  );
}

function OrgRow({ palette, name, active }: { palette: BrandPalette; name: string; active: boolean }) {
  return (
    <View style={[styles.orgRow, active ? { backgroundColor: palette.surfaceRaised } : null]}>
      <Text style={[typography.body, { color: palette.textPrimary }]}>{name}</Text>
      {active ? <DemoBadge palette={palette} label="Activa" tone="success" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  switcherBar: { padding: spacing.sm, borderBottomWidth: 1, gap: spacing.xs },
  switcherLabel: { ...typography.label, textAlign: "center" },
  switcherRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
  segmentRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
  segmentRowCompact: { flex: 1 },
  content: { padding: 20, gap: spacing.md },
  screenGap: { gap: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  bellWrap: { position: "relative" },
  bellDot: { position: "absolute", top: 0, right: 0, width: 8, height: 8, borderRadius: 4 },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionHeadingText: { ...typography.label },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  commissionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amount: { fontSize: 16, fontWeight: "700" },
  identityRow: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  fieldRow: { flexDirection: "row", justifyContent: "space-between" },
  orgRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  actionsGap: { gap: spacing.sm },
  errorMark: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,106,94,0.14)" },
});
