import { releaseFeatures } from "../../config/release";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../../design-system/icons/Icon";
import { colors, typography } from "../../components/ui/theme";
import { surveysPreviewEnabled } from "../../features/surveys/flags";
import { strings } from "../../i18n";
import { guardedTabPress } from "../../navigation/leaveGuard";

/**
 * Profile has no equivalent in the official 24-icon set (afiliados, ajustes,
 * alerta, buscar, campana, catalogo, cerrar, check, comision, compartir,
 * cumplimiento, descargar, dispersion, enlace, filtro, flecha-derecha,
 * inicio, mas, monedero, nivel, red, reloj, reporte, ventas) -- this is the
 * documented exception, falling back to the already-installed Ionicons.
 *
 * The bar stays on every main section, Encuestas included (list, survey and
 * response: a hidden tab with its own stack). Screens outside this group --
 * capture flows, modals and authentication -- have no bar on purpose; see
 * docs/NAVEGACION_BARRA_INFERIOR_ES.md. Switching section from a screen with
 * work at risk runs its safe exit first (navigation/leaveGuard.ts).
 */
export default function AppTabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenListeners={({ navigation, route }) => ({
        tabPress: (event) => guardedTabPress(event, () => navigation.navigate(route.name)),
      })}
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        // Typing (an answer, a search) must not be covered by the bar on Android.
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          // Above the gesture/navigation area, not under it.
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: {
          fontFamily: typography.body.fontFamily,
          fontSize: 11,
          fontWeight: typography.bodyStrong.fontWeight,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: strings.nav.home,
          tabBarIcon: ({ color, size }) => <Icon name="inicio" size={size} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          title: strings.nav.network,
          tabBarIcon: ({ color, size }) => <Icon name="red" size={size} color={color as string} />,
        }}
      />
      <Tabs.Protected guard={releaseFeatures.commerce}>
        <Tabs.Screen
          name="sales"
          options={{
            title: strings.nav.sales,
            tabBarIcon: ({ color, size }) => <Icon name="ventas" size={size} color={color as string} />,
          }}
        />
        <Tabs.Screen
          name="wallet"
          options={{
            title: strings.nav.wallet,
            tabBarIcon: ({ color, size }) => <Icon name="monedero" size={size} color={color as string} />,
          }}
        />
      </Tabs.Protected>
      <Tabs.Screen
        name="profile"
        options={{
          title: strings.nav.profile,
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Protected guard={surveysPreviewEnabled}>
        <Tabs.Screen
          name="surveys"
          options={{
            // Reached from Home and from notifications, not a tab of its own.
            href: null,
            headerShown: false,
            title: strings.surveys.title,
          }}
        />
      </Tabs.Protected>
    </Tabs>
  );
}
