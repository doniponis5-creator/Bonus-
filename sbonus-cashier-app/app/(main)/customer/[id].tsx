/**
 * Customer [id] — Карточка клиента с балансом.
 */

import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { customersAPI } from '@/api/client';
import CustomerCard from '@/components/CustomerCard';
import { useAuthStore } from '@/store/auth';
import { COLORS } from '@/constants/theme';

import QRCode from 'react-native-qrcode-svg';

export default function CustomerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { id } = route.params || {};
  const user = useAuthStore((s) => s.user);

  const { data: balance, isLoading, error } = useQuery({
    queryKey: ['balance', id],
    queryFn: () => customersAPI.balance(id!).then((r) => r.data),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (error || !balance) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>❌ Ошибка загрузки клиента</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <CustomerCard
          fullName={balance.full_name}
          phone={balance.phone}
          balance={parseFloat(balance.balance)}
          totalEarned={parseFloat(balance.total_earned)}
          tierName={balance.tier_name}
          tierPercent={parseFloat(balance.tier_percent)}
          nextTierName={balance.next_tier_name}
          nextTierRemaining={balance.next_tier_remaining ? parseFloat(balance.next_tier_remaining) : null}
          onEarn={() => navigation.navigate('Earn', {
            customerId: id, customerName: balance.full_name, tierPercent: balance.tier_percent
          })}
          onSpend={() => navigation.navigate('Spend', {
            customerId: id, customerName: balance.full_name, balance: balance.balance
          })}
        />

        {/* QR Код */}
        {balance.qr_code && (
          <View style={{ alignItems: 'center', padding: 20, backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.cardBorder, marginBottom: 16 }}>
            <Text style={{ color: COLORS.text3, marginBottom: 16, fontWeight: '600' }}>Скан для поиска клиента</Text>
            <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 12 }}>
              <QRCode
                value={balance.qr_code}
                size={160}
                color="#000"
                backgroundColor="#fff"
              />
            </View>
            <Text style={{ color: COLORS.text2, marginTop: 16, fontSize: 13, letterSpacing: 1, fontWeight: '700' }}>
              {balance.qr_code}
            </Text>
          </View>
        )}

        {/* История */}
        <View style={styles.historyBtn}>
          <Text
            style={styles.historyLink}
            onPress={() => navigation.navigate('History', { customerId: id } )}
          >
            📋 Показать историю операций →
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  errorText: { color: COLORS.danger, fontSize: 16 },
  historyBtn: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.cardBorder, alignItems: 'center',
  },
  historyLink: { color: COLORS.accent, fontSize: 14, fontWeight: '600' },
});
