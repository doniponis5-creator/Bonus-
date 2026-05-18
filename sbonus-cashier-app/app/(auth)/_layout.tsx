/**
 * Auth layout — renders child routes via Slot.
 * Top-level navigation (auth vs main) is handled in app/_layout.tsx.
 * This layout exists so Expo Router can group (auth) screens;
 * no extra chrome is needed here.
 */
import { Slot } from 'expo-router';
export default function AuthLayout() {
  return <Slot />;
}
