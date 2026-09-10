import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Icon } from "../../design-system/icons/Icon";
import { colors, typography } from "../../components/ui/theme";
import { strings } from "../../i18n";

/**
 * Profile has no equivalent in the official 24-icon set (afiliados, ajustes,
 * alerta, buscar, campana, catalogo, cerrar, check, comision, compartir,
 * cumplimiento, descargar, dispersion, enlace, filtro, flecha-derecha,
 * inicio, mas, monedero, nivel, red, reloj, reporte, ventas) -- this is the
 * documented exception, falling back to the already-installed Ionicons.
 */
export default function AppTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 64,
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
      <Tabs.Screen
        name="profile"
        options={{
          title: strings.nav.profile,
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
