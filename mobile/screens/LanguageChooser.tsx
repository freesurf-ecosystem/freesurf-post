import React, { useMemo } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from "react-native";
import { useTheme } from "../lib/theme";
import { useAppLanguage } from "../lib/useAppLanguage";
import { SUPPORTED_LANGUAGES } from "../lib/languages";

export default function LanguageChooser({
  onDone,
  onSelect,
}: {
  onDone: () => void;
  onSelect: (code: string) => void;
}) {
  const { colors } = useTheme();
  const { lang, setLanguage, loaded, T } = useAppLanguage();

  const offered = useMemo(
    () => [...SUPPORTED_LANGUAGES].sort((a, b) => a.name.localeCompare(b.name)),
    []
  );

  if (!loaded) {
    return null;
  }

  const handleLanguagePress = (code: string) => {
    setLanguage(code);
    onSelect(code);
    onDone();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.text }]}>{T.language}</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {offered.map((item) => {
          const active = item.code === lang;
          return (
            <TouchableOpacity
              key={item.code}
              style={[
                styles.row,
                { borderColor: active ? colors.brand : colors.border, backgroundColor: colors.surface },
              ]}
              onPress={() => handleLanguagePress(item.code)}
            >
              <View style={styles.details}>
                <Text style={[styles.native, { color: active ? colors.brand : colors.text }]}>
                  {item.native}
                </Text>
                <Text style={[styles.english, { color: colors.textMuted }]}>{item.name}</Text>
              </View>
              {active && <Text style={[styles.check, { color: colors.brand }]}>✓</Text>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 24, paddingTop: 72 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 20 },
  list: { gap: 10, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  details: { flex: 1 },
  native: { fontSize: 16, fontWeight: "600" },
  english: { fontSize: 12, marginTop: 2 },
  check: { fontSize: 18, fontWeight: "700" },
});