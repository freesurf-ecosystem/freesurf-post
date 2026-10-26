import React, { createContext, useContext, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Linking,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Send, CalendarClock, FileText, Users, LogOut, Globe, Shield, Mail, Code2, Activity } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { useAppLanguage } from "../lib/useAppLanguage";
import type { RootStackParamList } from "../App";

type Nav = NativeStackNavigationProp<RootStackParamList>;
const MenuCtx = createContext<{ open: () => void; close: () => void }>({ open: () => {}, close: () => {} });
export const useMenu = () => useContext(MenuCtx);

const LINKS = [
  { key: "home", url: "https://freesurf.tools", Icon: Globe },
  { key: "privacy", url: "https://freesurf.tools/privacy.html", Icon: Shield },
  { key: "terms_link", url: "https://freesurf.tools/terms.html", Icon: FileText },
  { key: "support", url: "mailto:hello@freesurf.tools", Icon: Mail },
  { key: "github", url: "https://github.com/freesurf-ecosystem", Icon: Code2 },
] as const;

export function MenuButton() {
  const menu = useMenu();
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={menu.open} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: 4 }}>
      <Menu size={22} color={colors.text} />
    </TouchableOpacity>
  );
}

export function FloatingMenuButton() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.floatWrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <MenuButton />
    </View>
  );
}

export function MenuProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const nav = useNavigation<Nav>();
  const { theme, colors, toggleTheme } = useTheme();
  const { T } = useAppLanguage();

  const open = () => setVisible(true);
  const close = () => setVisible(false);

  function go(name: keyof RootStackParamList) {
    close();
    nav.navigate(name as any);
  }

  async function signOut() {
    close();
    await supabase.auth.signOut();
  }

  const tabs = [
    { key: "Compose", label: T.compose, Icon: Send },
    { key: "Schedule", label: T.schedule, Icon: CalendarClock },
    { key: "Drafts", label: T.drafts, Icon: FileText },
    { key: "Analytics", label: T.analytics, Icon: Activity },
    { key: "Accounts", label: T.accounts, Icon: Users },
  ] as const;

  return (
    <MenuCtx.Provider value={{ open, close }}>
      {children}
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close} />
          <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.panelHeader}>
              <Text style={[styles.brand, { color: colors.text }]}>Disc</Text>
            </View>

            <ScrollView>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{T.sections}</Text>
              {tabs.map(({ key, label, Icon }) => (
                <TouchableOpacity key={key} style={styles.row} onPress={() => go(key)}>
                  <Icon size={18} color={colors.textSecondary} />
                  <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
                </TouchableOpacity>
              ))}

              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{T.appearance}</Text>
              <TouchableOpacity style={styles.row} onPress={toggleTheme}>
                <Text style={[styles.themeIcon, { color: colors.textSecondary }]}>◐</Text>
                <Text style={[styles.rowLabel, { color: colors.text }]}>
                  {theme === "dark" ? T.light_mode : T.dark_mode}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.row} onPress={() => go("Language")}>
                <Globe size={18} color={colors.textSecondary} />
                <Text style={[styles.rowLabel, { color: colors.text }]}>{T.language}</Text>
              </TouchableOpacity>

              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{T.free_surf}</Text>
              {LINKS.map(({ key, url, Icon }) => (
                <TouchableOpacity key={key} style={styles.row} onPress={() => { Linking.openURL(url).catch(() => {}); }}>
                  <Icon size={18} color={colors.textSecondary} />
                  <Text style={[styles.rowLabel, { color: colors.text }]}>{(T as any)[key]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={[styles.signOut, { borderTopColor: colors.border }]} onPress={signOut}>
              <LogOut size={18} color={colors.error} />
              <Text style={[styles.signOutLabel, { color: colors.error }]}>{T.sign_out}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </MenuCtx.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: "row" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  panel: { width: "76%", maxWidth: 320, borderRightWidth: 1, paddingVertical: 20, paddingHorizontal: 16 },
  panelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  brand: { fontSize: 18, fontWeight: "700" },
  sectionLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 18, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  rowLabel: { fontSize: 15, fontWeight: "500" },
  themeIcon: { fontSize: 18, width: 18, textAlign: "center" },
  floatWrap: { position: "absolute", right: 14, zIndex: 20 },
  signOut: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 16, marginTop: 12, borderTopWidth: 1 },
  signOutLabel: { fontSize: 15, fontWeight: "600" },
});