/**
 * ShiftOpen — Открытие кассовой смены.
 * Кассир вводит начальный остаток наличных. Если смена уже открыта —
 * показывает её и кнопку перехода к закрытию.
 */

import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, LockOpen, Wallet, XCircle } from 'lucide-react-native';
import { shiftsAPI } from '@/api/client';
import { COLORS, formatKGS } from '@/constants/theme';

export default function ShiftOpenScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [balance, setBalance] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['shift-current'],
    queryFn: () => shiftsAPI.current().then((r) => r.data),
  });
  const openShift = data?.shift;

  const mutation = useMutation({
    mutationFn: () => shiftsAPI.open(parseFloat(balance) || 0),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-current'] });
      navigation.navigate('ShiftClose');
    },
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  // Смена уже открыта
  if (openShift) {
    const opened = new Date(openShift.opened_at);
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.activeCard}>
          <View style={styles.activeIcon}>
            <Clock size={26} color={COLORS.success} />
          </View>
          <Text style={styles.activeTitle}>Смена открыта</Text>
          <Text style={styles.activeSub}>
            {opened.toLocaleDateString('ru-RU')} • {opened.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </Text>

          <View style={styles.balanceBox}>
            <Text style={styles.balanceLabel}>Начальный остаток</Text>
            <Text style={styles.balanceValue}>{formatKGS(parseFloat(openShift.opening_balance || '0'))}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('ShiftClose')} activeOpacity={0.8}>
          <View style={styles.btnRow}>
            <Wallet size={18} color={COLORS.bg} />
            <Text style={styles.btnText}>Перейти к закрытию</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Открытие новой смены
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <LockOpen size={20} color={COLORS.accent} />
          <Text style={styles.headerTitle}>Открыть смену</Text>
        </View>
        <Text style={styles.hint}>Введите наличные в кассе на начало смены</Text>

        <Text style={styles.label}>Начальный остаток (KGS)</Text>
        <TextInput
          style={styles.input}
          value={balance}
          onChangeText={setBalance}
          placeholder="0"
          placeholderTextColor={COLORS.text3}
          keyboardType="decimal-pad"
          autoFocus
        />

        {mutation.error && (
          <View style={styles.errorRow}>
            <XCircle size={14} color={COLORS.danger} />
            <Text style={styles.error}>
              {(mutation.error as any)?.response?.data?.detail?.message || 'Ошибка'}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.btn}
          onPress={() => mutation.mutate()}
          disabled={mutation.isPending}
          activeOpacity={0.8}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={COLORS.bg} />
          ) : (
            <View style={styles.btnRow}>
              <CheckCircle2 size={18} color={COLORS.bg} />
              <Text style={styles.btnText}>Открыть смену</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20 },
  center: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: COLORS.card, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: COLORS.cardBorder },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  headerTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  hint: { color: COLORS.text2, fontSize: 13, marginBottom: 24 },
  label: { color: COLORS.text2, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: {
    backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.cardBorder,
    borderRadius: 14, paddingVertical: 18, paddingHorizontal: 18,
    color: COLORS.accent, fontSize: 28, fontWeight: '800', textAlign: 'center',
  },
  btn: { marginTop: 24, backgroundColor: COLORS.accent, paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { color: COLORS.bg, fontSize: 16, fontWeight: '800' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  error: { color: COLORS.danger, fontSize: 13 },

  activeCard: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
  },
  activeIcon: {
    width: 56, height: 56, borderRadius: 18, marginBottom: 12,
    backgroundColor: 'rgba(34,197,94,0.12)', justifyContent: 'center', alignItems: 'center',
  },
  activeTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  activeSub: { color: COLORS.text2, fontSize: 13, marginTop: 4 },
  balanceBox: {
    marginTop: 20, width: '100%', backgroundColor: COLORS.bg2, borderRadius: 14, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  balanceLabel: { color: COLORS.text2, fontSize: 14 },
  balanceValue: { color: COLORS.accent, fontSize: 18, fontWeight: '800' },
});
