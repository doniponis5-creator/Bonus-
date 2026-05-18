/**
 * S Bonus Cashier — Offline status banner.
 * Показывается вверху экрана когда нет интернета или есть операции в очереди.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS } from '../constants/theme';

interface Props {
  isConnected: boolean;
  pendingCount: number;
  syncing: boolean;
  onSync: () => void;
}

export default function OfflineBanner({ isConnected, pendingCount, syncing, onSync }: Props) {
  if (isConnected && pendingCount === 0) return null;

  return (
    <View style={[
      styles.container,
      { backgroundColor: isConnected ? 'rgba(255,230,0,0.12)' : 'rgba(255,77,77,0.12)' },
    ]}>
      <View style={styles.left}>
        <View style={[styles.dot, { backgroundColor: isConnected ? COLORS.accent : '#ff4d4d' }]} />
        <Text style={[styles.text, { color: isConnected ? COLORS.accent : '#ff4d4d' }]}>
          {!isConnected
            ? 'Нет интернета • Операции сохраняются локально'
            : `В очереди: ${pendingCount} операций`
          }
        </Text>
      </View>
      {isConnected && pendingCount > 0 && (
        <TouchableOpacity onPress={onSync} style={styles.syncBtn} disabled={syncing}>
          {syncing ? (
            <ActivityIndicator size="small" color={COLORS.accent} />
          ) : (
            <Text style={styles.syncText}>Синхр.</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  syncBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,230,0,0.15)',
  },
  syncText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
  },
});
