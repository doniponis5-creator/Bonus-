/**
 * ShiftClose — Закрытие кассовой смены (инкассация).
 * Пересчёт купюр KGS (5000/2000/1000/500/200/100/50/20), live-итог,
 * эквивалент в USD, комментарий. Сверка с ожидаемой суммой — на сервере.
 */

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CheckCircle2, DollarSign, Lock, Minus, Plus, TriangleAlert } from 'lucide-react-native';
import { shiftsAPI } from '@/api/client';
import { COLORS } from '@/constants/theme';

const DENOMS = [5000, 2000, 1000, 500, 200, 100, 50, 20];
const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

export default function ShiftCloseScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();

  const [counts, setCounts] = useState<Record<string, number>>(
    Object.fromEntries(DENOMS.map((d) => [String(d), 0]))
  );
  const [note, setNote] = useState('');
  const [result, setResult] = useState<any>(null);

  const { data: shiftData } = useQuery({
    queryKey: ['shift-current'],
    queryFn: () => shiftsAPI.current().then((r) => r.data),
  });
  const { data: rateData } = useQuery({
    queryKey: ['shift-rate'],
    queryFn: () => shiftsAPI.rate().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const rate = parseFloat(rateData?.usd_rate || '87.45');

  const { total, billsCount } = useMemo(() => {
    let t = 0, c = 0;
    for (const d of DENOMS) { t += d * (counts[String(d)] || 0); c += counts[String(d)] || 0; }
    return { total: t, billsCount: c };
  }, [counts]);

  const usd = rate > 0 ? total / rate : 0;

  const setQty = (d: number, delta: number) =>
    setCounts((p) => ({ ...p, [String(d)]: Math.max(0, (p[String(d)] || 0) + delta) }));
  const setExact = (d: number, val: string) =>
    setCounts((p) => ({ ...p, [String(d)]: Math.max(0, parseInt(val) || 0) }));

  const mutation = useMutation({
    mutationFn: () => shiftsAPI.close(counts, note.trim() || undefined),
    onSuccess: (res) => {
      setResult(res.data.shift);
      queryClient.invalidateQueries({ queryKey: ['shift-current'] });
    },
  });

  const needNote = (mutation.error as any)?.response?.status === 400;

  // ─── Результат закрытия ───
  if (result) {
    const diff = parseFloat(result.difference || '0');
    const status = diff === 0 ? 'match' : diff > 0 ? 'surplus' : 'shortage';
    const color = status === 'match' ? COLORS.success : status === 'surplus' ? COLORS.warn : COLORS.danger;
    const label = status === 'match' ? 'Касса сошлась' : status === 'surplus' ? 'Излишек' : 'Недостача';
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={[styles.resultCard, { borderColor: color + '55' }]}>
          <View style={[styles.resultIcon, { backgroundColor: color + '22' }]}>
            {status === 'match' ? <CheckCircle2 size={30} color={color} /> : <TriangleAlert size={30} color={color} />}
          </View>
          <Text style={styles.resultTitle}>Смена закрыта</Text>
          <Text style={[styles.resultBadge, { color, backgroundColor: color + '1A' }]}>{label}</Text>

          <View style={styles.resultRows}>
            <Row k="Факт (пересчитано)" v={`${fmt(parseFloat(result.total_counted))} сом`} />
            <Row k="Ожидалось" v={`${fmt(parseFloat(result.total_expected))} сом`} />
            <Row k="Продажи за смену" v={`${fmt(parseFloat(result.cash_sales))} сом`} muted />
            <Row k="Расхождение" v={`${diff > 0 ? '+' : ''}${fmt(diff)} сом`} color={color} />
            <Row k="Эквивалент USD" v={`$${parseFloat(result.usd_equivalent).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} muted />
          </View>
        </View>

        <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('Dashboard')} activeOpacity={0.8}>
          <Text style={styles.btnText}>Готово</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (shiftData && !shiftData.shift) {
    return (
      <View style={styles.center}>
        <Lock size={40} color={COLORS.text3} />
        <Text style={styles.emptyText}>Нет открытой смены</Text>
        <TouchableOpacity style={[styles.btn, { marginTop: 20, paddingHorizontal: 32 }]} onPress={() => navigation.navigate('ShiftOpen')}>
          <Text style={styles.btnText}>Открыть смену</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Итоговая карточка */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Всего наличных (факт)</Text>
        <Text style={styles.totalValue}>{fmt(total)} <Text style={styles.totalCur}>сом</Text></Text>
        <View style={styles.totalSub}>
          <View style={styles.usdPill}>
            <DollarSign size={13} color={COLORS.accent3} />
            <Text style={styles.usdText}>
              ${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
          <Text style={styles.billsText}>{billsCount} купюр • курс {rate.toFixed(2)}</Text>
        </View>
      </View>

      {/* Купюры */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Banknote size={16} color={COLORS.accent} />
          <Text style={styles.cardHeaderText}>Пересчёт купюр</Text>
        </View>
        {DENOMS.map((d) => {
          const qty = counts[String(d)] || 0;
          return (
            <View key={d} style={styles.row}>
              <Text style={styles.denom}>{d.toLocaleString('ru-RU')}</Text>
              <Text style={styles.denomCur}>сом</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={styles.stepBtn} onPress={() => setQty(d, -1)} activeOpacity={0.7}>
                <Minus size={16} color={COLORS.text} />
              </TouchableOpacity>
              <TextInput
                style={styles.qtyInput}
                value={String(qty)}
                onChangeText={(v) => setExact(d, v)}
                keyboardType="number-pad"
                selectTextOnFocus
              />
              <TouchableOpacity style={styles.stepBtn} onPress={() => setQty(d, 1)} activeOpacity={0.7}>
                <Plus size={16} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.rowSum}>{fmt(d * qty)}</Text>
            </View>
          );
        })}
      </View>

      {/* Комментарий */}
      <View style={[styles.card, needNote && { borderColor: COLORS.danger }]}>
        <Text style={styles.label}>Комментарий {needNote ? '(обязателен при расхождении)' : ''}</Text>
        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="Причина расхождения, если есть…"
          placeholderTextColor={COLORS.text3}
          multiline
        />
        {needNote && (
          <View style={styles.errorRow}>
            <TriangleAlert size={14} color={COLORS.danger} />
            <Text style={styles.error}>
              {(mutation.error as any)?.response?.data?.detail?.message || 'Укажите причину'}
            </Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.btn, billsCount === 0 && styles.btnDisabled]}
        onPress={() => mutation.mutate()}
        disabled={billsCount === 0 || mutation.isPending}
        activeOpacity={0.8}
      >
        {mutation.isPending ? (
          <ActivityIndicator color={COLORS.bg} />
        ) : (
          <View style={styles.btnRow}>
            <Lock size={18} color={COLORS.bg} />
            <Text style={styles.btnText}>Закрыть смену</Text>
          </View>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ k, v, color, muted }: { k: string; v: string; color?: string; muted?: boolean }) {
  return (
    <View style={styles.kvRow}>
      <Text style={[styles.kvKey, muted && { color: COLORS.text3 }]}>{k}</Text>
      <Text style={[styles.kvVal, color ? { color } : null, muted && { color: COLORS.text2, fontWeight: '600' }]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20 },
  center: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { color: COLORS.text2, fontSize: 15, marginTop: 12 },

  totalCard: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 22, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,230,0,0.2)',
  },
  totalLabel: { color: COLORS.text2, fontSize: 13 },
  totalValue: { color: COLORS.accent, fontSize: 36, fontWeight: '900', marginTop: 4 },
  totalCur: { fontSize: 18, color: COLORS.text2, fontWeight: '700' },
  totalSub: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  usdPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(124,111,255,0.12)', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 10,
  },
  usdText: { color: COLORS.accent3, fontSize: 14, fontWeight: '800' },
  billsText: { color: COLORS.text3, fontSize: 12 },

  card: {
    backgroundColor: COLORS.card, borderRadius: 18, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardHeaderText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder, gap: 8,
  },
  denom: { color: COLORS.text, fontSize: 16, fontWeight: '700', width: 58, textAlign: 'right' },
  denomCur: { color: COLORS.text3, fontSize: 12 },
  stepBtn: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.bg2,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  qtyInput: {
    width: 54, height: 38, backgroundColor: COLORS.bg2, borderRadius: 10,
    color: COLORS.text, fontSize: 16, fontWeight: '700', textAlign: 'center',
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  rowSum: { width: 76, textAlign: 'right', color: COLORS.text2, fontSize: 13, fontWeight: '600' },

  label: { color: COLORS.text2, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  noteInput: {
    backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.cardBorder, borderRadius: 12,
    padding: 14, color: COLORS.text, fontSize: 14, minHeight: 64, textAlignVertical: 'top',
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  error: { color: COLORS.danger, fontSize: 13, flex: 1 },

  btn: { backgroundColor: COLORS.accent, paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { color: COLORS.bg, fontSize: 16, fontWeight: '800' },

  resultCard: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 24, marginBottom: 16,
    alignItems: 'center', borderWidth: 1,
  },
  resultIcon: { width: 60, height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  resultTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  resultBadge: {
    marginTop: 8, fontSize: 13, fontWeight: '800', overflow: 'hidden',
    paddingVertical: 5, paddingHorizontal: 14, borderRadius: 10,
  },
  resultRows: { width: '100%', marginTop: 20 },
  kvRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 11, borderTopWidth: 1, borderTopColor: COLORS.cardBorder,
  },
  kvKey: { color: COLORS.text2, fontSize: 14 },
  kvVal: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
});
