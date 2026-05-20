/**
 * Root Layout — NavigationContainer + NativeStack + Auth check.
 * Использует @react-navigation/native-stack (совместим с react-native-screens 4.x).
 */

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/auth';
import { COLORS } from '@/constants/theme';
import { ActivityIndicator, View } from 'react-native';

// Import screens
import LoginScreen from './(auth)/login';
import DashboardScreen from './(main)/dashboard';
import SearchScreen from './(main)/search';
import RegisterScreen from './(main)/register';
import CustomerScreen from './(main)/customer/[id]';
import EarnScreen from './(main)/earn';
import SpendScreen from './(main)/spend';
import HistoryScreen from './(main)/history';
import MotivationScreen from './(main)/motivation';

const Stack = createNativeStackNavigator();
const queryClient = new QueryClient();

export default function RootLayout() {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();

  useEffect(() => { checkAuth(); }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator 
          initialRouteName={isAuthenticated ? 'Dashboard' : 'Login'}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.bg },
            headerStyle: { backgroundColor: COLORS.bg2 },
            headerTintColor: COLORS.accent,
            headerTitleStyle: { fontWeight: '700', fontSize: 17 },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
          <Stack.Screen name="Search" component={SearchScreen} options={{ headerShown: true, title: 'Поиск клиента' }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: true, title: 'Новый клиент' }} />
          <Stack.Screen name="Customer" component={CustomerScreen} options={{ headerShown: true, title: 'Карточка клиента' }} />
          <Stack.Screen name="Earn" component={EarnScreen} options={{ headerShown: true, title: 'Начислить бонусы' }} />
          <Stack.Screen name="Spend" component={SpendScreen} options={{ headerShown: true, title: 'Списать бонусы' }} />
          <Stack.Screen name="History" component={HistoryScreen} options={{ headerShown: true, title: 'История' }} />
          <Stack.Screen name="Motivation" component={MotivationScreen} options={{ headerShown: true, title: 'Моя мотивация' }} />
        </Stack.Navigator>
      </NavigationContainer>
      <Toast />
    </QueryClientProvider>
  );
}
