/**
 * Isolated visual-direction demo. NOT a production screen -- see
 * src/design-system/demo/README.md for scope, how to view it, and how to
 * remove it. Synthetic data only; reuses the real Icon/Avatar components
 * and the real spacing/radius/typography/motion tokens, with color supplied
 * by the selected brandVariants palette instead of the global theme (see
 * DemoPrimitives.tsx for why).
 *
 * Color discipline (per guia/implementacion.md §2 -- see each call site
 * below for the specific justification): a section's icon chip is tinted
 * ONLY when the badge directly below it already reflects a real,
 * currently-displayed semantic state that matches that tint's official
 * meaning (éxito = liquidado/verificado/activo, alerta = espera real).
 * Never a fixed tone chosen because of what the section is named. A
 * section whose content is a *list* of mixed states (Comisiones) or whose
 * money figure already carries its own color (Monedero's "disponible"
 * text) gets a neutral, untinted chip -- the per-row badge/figure is the
 * only color carrier there, exactly as it already is in the real app.
 */
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../icons/Icon";
import { Avatar } from "../../components/ui/Avatar";
import type { BadgeTone } from "../../components/ui/Badge";
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

/** `tone="neutral"` renders an untinted chip -- the deliberate default for any section without a single, real, currently-displayed semantic state to reflect (see file docblock). */
function SectionHeading({ palette, icon, tone, title }: { palette: BrandPalette; icon: IconName; tone: BadgeTone; title: string }) {
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
  const hasData = uiState === "data";
  // Mirrors the real affiliate/compliance status exactly as it would be
  // computed by affiliateStatusCopy/complianceStatusCopy from the
  // synthetic record below -- the chip never picks a tone independently.
  const affiliateTone: BadgeTone = hasData ? "success" : "neutral"; // "activo" -> éxito, per the official status table
  const complianceTone: BadgeTone = hasData ? "warning" : "neutral"; // "en progreso" -> a genuine, real wait on review

  return (
    <View style={styles.screenGap}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.title, { color: palette.textPrimary }]}>Hola, Daniela</Text>
          <Text style={[typography.body, { color: palette.textSecondary }]}>Afilianet Norte</Text>
        </View>
        <View style={styles.bellWrap}>
          {/* The bell itself has no semantic state of its own -- neutral chip; only the unread dot (a real count, not decoration) carries color. */}
          <DemoIconChip palette={palette} tone="neutral">
            <Icon name="campana" size={18} color={palette.textPrimary} />
          </DemoIconChip>
          <View style={[styles.bellDot, { backgroundColor: palette.semantic.danger.text }]} />
        </View>
      </View>

      <DemoCard palette={palette} featured>
        <SectionHeading palette={palette} icon="afiliados" tone={affiliateTone} title="ESTADO DE AFILIADO" />
        <CardBody palette={palette} uiState={uiState} errorLabel="No pudimos cargar tu estado de afiliado." emptyTitle="Aún no tienes un perfil de afiliado." emptyDescription="Únete al programa para empezar.">
          <View style={styles.row}>
            <DemoBadge palette={palette} label="Activo" tone="success" />
            <Text style={[typography.body, { color: palette.textSecondary }]}>AFF-10492</Text>
          </View>
          <Text style={[typography.body, { color: palette.textSecondary }]}>Afiliado desde el 12 feb 2026</Text>
          <DemoButton palette={palette} label="Compartir enlace" variant="secondary" size="sm" iconLeft={<Icon name="compartir" size={14} color={palette.textPrimary} />} onPress={() => {}} />
        </CardBody>
      </DemoCard>

      {/* The one card marked `actionable`: it's the thing genuinely pending the affiliate's own action right now, not an arbitrary "primary" pick. */}
      <DemoCard palette={palette} actionable={hasData}>
        <SectionHeading palette={palette} icon="cumplimiento" tone={complianceTone} title="VERIFICACIÓN" />
        <CardBody palette={palette} uiState={uiState} errorLabel="No pudimos cargar tu verificación." emptyTitle="Aún no has iniciado tu verificación.">
          <DemoBadge palette={palette} label="En progreso" tone="warning" />
          <Text style={[typography.body, { color: palette.textSecondary }]}>Siguiente: Documento de identidad</Text>
          <DemoButton palette={palette} label="Continuar verificación" variant="secondary" onPress={() => {}} />
        </CardBody>
      </DemoCard>

      <DemoCard palette={palette}>
        {/* Neutral chip: this card lists MIXED states (liquidada/pendiente) -- no single tone represents "Comisiones" as a whole. Each row's own badge already carries the real color (éxito for liquidada, alerta for pendiente). */}
        <SectionHeading palette={palette} icon="comision" tone="neutral" title="COMISIONES" />
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
        {/* Neutral chip: the section itself isn't "liberado", only the specific "disponible" figure below is -- that figure keeps its own éxito color, same as the real app. */}
        <SectionHeading palette={palette} icon="monedero" tone="neutral" title="MONEDERO" />
        <CardBody palette={palette} uiState={uiState} errorLabel="No pudimos cargar tu monedero." emptyTitle="Aún no tienes saldo.">
          <Text style={[typography.caption, { color: palette.textTertiary }]}>MXN · pendiente $320.00</Text>
          <Text style={[typography.subtitle, { color: palette.semantic.success.text }]}>$4,180.00 disponible</Text>
          <DemoButton palette={palette} label="Ver monedero" variant="ghost" size="sm" onPress={() => {}} />
        </CardBody>
      </DemoCard>

      <DemoCard palette={palette}>
        {/* Neutral chip: viewing your network has no inherent success/warning/danger meaning. */}
        <SectionHeading palette={palette} icon="red" tone="neutral" title="RED" />
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
  const hasData = uiState === "data";
  const affiliateTone: BadgeTone = hasData ? "success" : "neutral";
  const complianceTone: BadgeTone = hasData ? "warning" : "neutral";

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
        <SectionHeading palette={palette} icon="afiliados" tone={affiliateTone} title="AFILIADO" />
        <CardBody palette={palette} uiState={uiState} errorLabel="No pudimos cargar tu perfil de afiliado." emptyTitle="Necesitas un perfil de afiliado.">
          <View style={styles.row}>
            <DemoBadge palette={palette} label="Activo" tone="success" />
            <Text style={[typography.body, { color: palette.textSecondary }]}>AFF-10492</Text>
          </View>
          <FieldRow palette={palette} label="Organización" value="Afilianet Norte" />
          <FieldRow palette={palette} label="Patrocinador" value="AFF-10021" />
        </CardBody>
      </DemoCard>

      <DemoCard palette={palette} actionable={hasData}>
        <SectionHeading palette={palette} icon="cumplimiento" tone={complianceTone} title="VERIFICACIÓN" />
        <CardBody palette={palette} uiState={uiState} errorLabel="No pudimos cargar tu verificación." emptyTitle="Aún no has iniciado tu verificación.">
          <DemoBadge palette={palette} label="En progreso" tone="warning" />
          <DemoButton palette={palette} label="Ver verificación" variant="secondary" size="sm" onPress={() => {}} />
        </CardBody>
      </DemoCard>

      <DemoCard palette={palette}>
        {/* Neutral chip: only ONE row in this list is "Activa" -- the section as a whole isn't. */}
        <SectionHeading palette={palette} icon="nivel" tone="neutral" title="ORGANIZACIONES" />
        <OrgRow palette={palette} name="Afilianet Norte" active />
        <OrgRow palette={palette} name="Afilianet Centro" active={false} />
      </DemoCard>

      {/*
        Real screen today (src/app/(app)/profile.tsx): Notificaciones ->
        [Salir de organización] -> Aviso de privacidad -> Eliminar mi cuenta
        -> Cerrar sesión -- "Eliminar mi cuenta" currently renders as a plain
        `ghost` button, not the spec's dedicated `peligro` variant
        (especificacion/componentes.md §1: "destructivo, siempre con
        confirmación"). This demo groups the account-level actions into
        their own labeled block with the destructive action in that
        `danger` variant, and keeps "Aviso de privacidad" as the LAST
        element on the screen (per this round's explicit instruction) --
        OUTSIDE that block, since it's informational, not an account
        action. KNOWN DIFFERENCE FROM THE REAL SCREEN, left for product to
        confirm: this reorders/regroups the five buttons; it does not match
        today's shipped order 1:1.
      */}
      <View style={styles.actionsGap}>
        <Text style={[typography.label, { color: palette.textTertiary }]}>ACCIONES DE CUENTA</Text>
        <DemoButton palette={palette} label="Configurar notificaciones" variant="secondary" fullWidth onPress={() => {}} />
        <DemoButton palette={palette} label="Salir de la organización" variant="ghost" fullWidth onPress={() => {}} />
        <DemoButton palette={palette} label="Eliminar mi cuenta" variant="danger" fullWidth onPress={() => {}} />
        <DemoButton palette={palette} label="Cerrar sesión" variant="secondary" fullWidth onPress={() => {}} />
      </View>
      <DemoButton palette={palette} label="Aviso de privacidad" variant="ghost" fullWidth onPress={() => {}} />
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
