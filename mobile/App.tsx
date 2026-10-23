import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./lib/supabase";
import { ThemeProvider, useTheme } from "./lib/theme";
import { MenuProvider } from "./components/Menu";
import OnboardingScreen from "./screens/OnboardingScreen";
import AuthScreen from "./screens/AuthScreen";
import ComposeScreen from "./screens/ComposeScreen";
import ScheduleScreen from "./screens/ScheduleScreen";
import DraftsScreen from "./screens/DraftsScreen";
import AccountsScreen from "./screens/AccountsScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";
import { loadOnboardingState, onboardingComplete, OnboardingState } from "./lib/onboarding";
import { useAppLanguage, LanguageProvider } from "./lib/useAppLanguage";
import LanguageChooser from "./screens/LanguageChooser";
import LanguageScreen from "./screens/LanguageScreen";

export type RootStackParamList = {
  Compose: { draftText?: string; draftPlatforms?: string[] } | undefined;
  Schedule: undefined;
  Drafts: undefined;
  Accounts: undefined;
  Analytics: undefined;
  Auth: undefined;
  Language: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function ThemedNavigator() {
  const { colors, theme } = useTheme();
  const [session, setSession] = useState<boolean | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const { lang, setLanguage, T, loaded } = useAppLanguage();

  // Get stored language status for navigation flow
  const [languageSelected, setLanguageSelected] = useState(false);
  useEffect(() => {
    (async () => {
      const sl = await AsyncStorage.getItem("@freesurf-app-lang");
      setLanguageSelected(!!sl);
    })();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(Boolean(data.session));
      if (data.session?.user) {
        const state = await loadOnboardingState(data.session.user.id);
        setOnboarding(onboardingComplete(state) ? null : state);
      } else {
        setOnboarding(null);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, s) => {
      console.log("[App] auth state change, session=", Boolean(s));
      setSession(Boolean(s));
      if (s?.user) {
        const state = await loadOnboardingState(s.user.id);
        setOnboarding(onboardingComplete(state) ? null : state);
      } else {
        setOnboarding(null);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // If loading or no session, show spinner
  if (!loaded || session === null) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  // If language not selected (no stored language), show LanguageChooser first
  if (!languageSelected) {
    return (
      <LanguageChooser
        onDone={() => setLanguageSelected(true)}
        onSelect={(code: string) => setLanguage(code)}
      />
    );
  }

  // If onboarding not complete, show onboarding screen
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
              <Stack.Screen name="Language" component={LanguageScreen} />
            </>
          ) : (
            <Stack.Screen name="Auth" component={AuthScreen} />
          )}
        </Stack.Navigator>
      </MenuProvider>
    </NavigationContainer>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LanguageProvider>
          <StatusBar style="auto" />
          <ThemedNavigator />
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default App;