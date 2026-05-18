/**
 * Main layout — renders child routes via Slot.
 * Top-level navigation (auth vs main) is handled in app/_layout.tsx.
 * This layout exists so Expo Router can group (main) screens;
 * no extra chrome is needed here.
 */
import { Slot } from 'expo-router';
export default function MainLayout() {
  return <Slot />;
}
