import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { supabase } from "./lib/supabase";
import { ThemeProvider, useTheme } from "./lib/theme";
import { MenuProvider } from "./components/Menu";
import AuthScreen from "./screens/AuthScreen";
import ComposeScreen from "./screens/ComposeScreen";
import ScheduleScreen from "./screens/ScheduleScreen";
import DraftsScreen from "./screens/DraftsScreen";
import AccountsScreen from "./screens/AccountsScreen";

export type RootStackParamList = {
  Compose: { draftText?: string; draftPlatforms?: string[] } | undefined;
  Schedule: undefined;
  Drafts: undefined;
  Accounts: undefined;
  Auth: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function ThemedNavigator() {
  const { colors, theme } = useTheme();
  const [session, setSession] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(Boolean(s)));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === null) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  const navTheme = {
    ...DefaultTheme,
    dark: theme === "dark",
    colors: {
      ...DefaultTheme.colors,
      background: colors.bg,
      card: colors.surface,
      text: colors.text,
      primary: colors.brand,
      border: colors.border,
      notification: colors.brand,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <MenuProvider>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {session ? (
            <>
              <Stack.Screen name="Compose" component={ComposeScreen} />
              <Stack.Screen name="Schedule" component={ScheduleScreen} />
              <Stack.Screen name="Drafts" component={DraftsScreen} />
              <Stack.Screen name="Accounts" component={AccountsScreen} />
            </>
          ) : (
            <Stack.Screen name="Auth" component={AuthScreen} />
          )}
        </Stack.Navigator>
      </MenuProvider>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StatusBar style="auto" />
        <ThemedNavigator />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
