/**
 * TierBadge — Значок уровня (Bronze/Silver/Gold/Platinum).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, TIER_COLORS, TIER_EMOJI } from '@/constants/theme';

interface Props {
  tierName: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function TierBadge({ tierName, size = 'md' }: Props) {
  const color = TIER_COLORS[tierName] || COLORS.text2;
  const emoji = TIER_EMOJI[tierName] || '🏷';
  const fontSize = size === 'lg' ? 16 : size === 'md' ? 13 : 11;
  const padding = size === 'lg' ? 10 : size === 'md' ? 7 : 5;

  return (
    <View style={[styles.badge, { borderColor: color + '40', paddingVertical: padding, paddingHorizontal: padding * 2 }]}>
      <Text style={[styles.text, { color, fontSize }]}>
        {emoji} {tierName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
