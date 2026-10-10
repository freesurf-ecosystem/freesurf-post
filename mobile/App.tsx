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
import AnalyticsScreen from "./screens/AnalyticsScreen";
import OnboardingScreen from "./screens/OnboardingScreen";
import { loadOnboardingState, onboardingComplete, OnboardingState } from "./lib/onboarding";

export type RootStackParamList = {
  Compose: { draftText?: string; draftPlatforms?: string[] } | undefined;
  Schedule: undefined;
  Drafts: undefined;
  Accounts: undefined;
  Analytics: undefined;
  Auth: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function ThemedNavigator() {
  const { colors, theme } = useTheme();
  const [session, setSession] = useState<boolean | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(Boolean(data.session));
      setOnboarding(data.session?.user ? await loadOnboardingState(data.session.user.id) : null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, s) => {
      console.log("[App] auth state change, session=", Boolean(s));
      setSession(Boolean(s));
      setOnboarding(s?.user ? await loadOnboardingState(s.user.id) : null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === null || (session && onboarding === null)) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  // Blocking onboarding: shown until Terms are accepted and both opt-ins are answered.
  if (session && onboarding && !onboardingComplete(onboarding)) {
    return (
      <OnboardingScreen
        initial={onboarding}
        onDone={() => setOnboarding({ terms: true, digest: true, updates: true })}
      />
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
              <Stack.Screen name="Analytics" component={AnalyticsScreen} />
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
