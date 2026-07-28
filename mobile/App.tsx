import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { supabase } from "./lib/supabase";
import AuthScreen from "./screens/AuthScreen";
import ComposeScreen from "./screens/ComposeScreen";
import AccountsScreen from "./screens/AccountsScreen";
import HistoryScreen from "./screens/HistoryScreen";

export type RootStackParamList = {
  Compose: undefined;
  Accounts: undefined;
  History: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function App() {
  const [session, setSession] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(Boolean(s)));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === null) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fafbfc" }}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: "#ffffff" },
            headerTintColor: "#4f46e5",
            headerTitleStyle: { fontWeight: "600" },
          }}
        >
          {session ? (
            <>
              <Stack.Screen name="Compose" component={ComposeScreen} options={{ title: "FreeSurf Post" }} />
              <Stack.Screen name="Accounts" component={AccountsScreen} options={{ title: "Accounts" }} />
              <Stack.Screen name="History" component={HistoryScreen} options={{ title: "History" }} />
            </>
          ) : (
            <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
