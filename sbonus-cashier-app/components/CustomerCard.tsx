/**
 * CustomerCard — Карточка клиента с балансом и уровнем.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CreditCard, PlusCircle, TrendingUp, Wallet } from 'lucide-react-native';
import { COLORS, formatKGS, TIER_COLORS } from '@/constants/theme';
import TierBadge from './TierBadge';

interface Props {
  fullName: string;
  phone: string;
  balance: number;
  totalEarned: number;
  tierName: string;
  tierPercent: number;
  nextTierName?: string | null;
  nextTierRemaining?: number | null;
  onEarn?: () => void;
  onSpend?: () => void;
}

export default function CustomerCard({
  fullName, phone, balance, totalEarned, tierName, tierPercent,
  nextTierName, nextTierRemaining, onEarn, onSpend,
}: Props) {
  const tierColor = TIER_COLORS[tierName] || COLORS.accent;

  return (
    <View style={styles.card}>
      {/* Заголовок */}
      <View style={styles.header}>
        <View style={[styles.avatar, { borderColor: tierColor }]}>
          <Text style={[styles.avatarText, { color: tierColor }]}>
            {fullName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.phone}>{phone}</Text>
        </View>
        <TierBadge tierName={tierName} size="md" />
      </View>

      {/* Баланс */}
      <View style={styles.balanceRow}>
        <View style={styles.balanceBlock}>
          <View style={styles.balanceLabelRow}>
            <Wallet size={12} color={COLORS.text2} />
            <Text style={styles.balanceLabel}>Баланс</Text>
          </View>
          <Text style={[styles.balanceValue, { color: COLORS.accent }]}>
            {formatKGS(balance)}
          </Text>
        </View>
        <View style={styles.balanceBlock}>
          <View style={styles.balanceLabelRow}>
            <TrendingUp size={12} color={COLORS.text2} />
            <Text style={styles.balanceLabel}>Всего накоплено</Text>
          </View>
          <Text style={styles.balanceValue2}>{formatKGS(totalEarned)}</Text>
        </View>
      </View>

      {/* Прогресс */}
      {nextTierName && nextTierRemaining != null && (
        <View style={styles.progressSection}>
          <Text style={styles.progressText}>
            До {nextTierName}: ещё {formatKGS(nextTierRemaining)}
          </Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, {
              width: `${Math.min(100, (totalEarned / (totalEarned + nextTierRemaining)) * 100)}%`,
              backgroundColor: tierColor,
            }]} />
          </View>
        </View>
      )}

      {/* Кнопки */}
      {(onEarn || onSpend) && (
        <View style={styles.actions}>
          {onEarn && (
            <TouchableOpacity style={[styles.btn, styles.btnEarn]} onPress={onEarn} activeOpacity={0.7}>
              <PlusCircle size={16} color={COLORS.text} />
              <Text style={styles.btnText}>Начислить</Text>
            </TouchableOpacity>
          )}
          {onSpend && (
            <TouchableOpacity style={[styles.btn, styles.btnSpend]} onPress={onSpend} activeOpacity={0.7}>
              <CreditCard size={16} color={COLORS.text} />
              <Text style={styles.btnText}>Списать</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 20,
    marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatar: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  avatarText: { fontSize: 20, fontWeight: '800' },
  headerInfo: { flex: 1, marginLeft: 12 },
  name: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
  phone: { color: COLORS.text2, fontSize: 13, marginTop: 2 },

  balanceRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  balanceBlock: {
    flex: 1, backgroundColor: COLORS.bg2, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  balanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  balanceLabel: { color: COLORS.text2, fontSize: 12 },
  balanceValue: { fontSize: 22, fontWeight: '800' },
  balanceValue2: { color: COLORS.text, fontSize: 18, fontWeight: '700' },

  progressSection: { marginBottom: 16 },
  progressText: { color: COLORS.text2, fontSize: 12, marginBottom: 6 },
  progressBar: {
    height: 6, borderRadius: 3, backgroundColor: COLORS.bg3, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },

  actions: { flexDirection: 'row', gap: 12 },
  btn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    flexDirection: 'row', gap: 8,
  },
  btnEarn: { backgroundColor: 'rgba(0,229,160,0.15)', borderWidth: 1, borderColor: 'rgba(0,229,160,0.3)' },
  btnSpend: { backgroundColor: 'rgba(124,111,255,0.15)', borderWidth: 1, borderColor: 'rgba(124,111,255,0.3)' },
  btnText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
});
