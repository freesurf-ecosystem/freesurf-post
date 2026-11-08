import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Star, ExternalLink } from "lucide-react-native";
import { useTheme } from "../lib/theme";
import { useAppLanguage } from "../lib/useAppLanguage";
import { FloatingMenuButton } from "../components/Menu";

const LINKS = [
  { key: "googleplay", label: "Google Play", url: "https://play.google.com/store/apps/details?id=tools.freesurf.post" },
  { key: "producthunt", label: "Product Hunt", url: "https://www.producthunt.com/products/catvideo?launch=catvideo" },
  { key: "trustpilot", label: "Trustpilot", url: "https://www.trustpilot.com/review/catvideo.app" },
  { key: "g2", label: "G2", url: "https://www.g2.com/products/catvideo/reviews" },
  { key: "capterra", label: "Capterra", url: "https://www.capterra.com/p/10283793/CatVideo/" },
] as const;

export default function ReviewScreen() {
  const { colors } = useTheme();
  const { T } = useAppLanguage();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}>
        <Star size={30} color={colors.brand} />
        <Text style={[styles.title, { color: colors.text }]}>{T.review_title}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{T.review_subtitle}</Text>

        {LINKS.map(({ key, label, url }) => (
          <TouchableOpacity
            key={key}
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => Linking.openURL(url).catch(() => {})}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>{T.leave_review}</Text>
            </View>
            <ExternalLink size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
      <FloatingMenuButton />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 10 },
  title: { fontSize: 24, fontWeight: "700", marginTop: 8 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", borderRadius: 12, padding: 16, borderWidth: 1 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 16, fontWeight: "600" },
  rowSub: { fontSize: 13 },
});
