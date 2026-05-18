/**
 * Earn — Начисление бонуса за покупку.
 */

import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, User, XCircle } from 'lucide-react-native';
import { bonusAPI } from '@/api/client';
import SuccessModal from '@/components/SuccessModal';
import { useAuthStore } from '@/store/auth';
import { COLORS, formatKGS } from '@/constants/theme';

export default function EarnScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { customerId, customerName, tierPercent } = route.params || {};
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [result, setResult] = useState<any>(null);

  const pct = parseFloat(tierPercent || '3');
  const purchaseNum = parseFloat(amount) || 0;
  const bonusPreview = Math.floor(purchaseNum * pct / 100);

  const mutation = useMutation({
    mutationFn: () => bonusAPI.earn({
      customer_id: customerId!,
      purchase_amount: purchaseNum,
      branch_id: user?.branch_id || '',
    }),
    onSuccess: (res) => {
      setResult(res.data);
      setShowSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['balance', customerId] });
    },
  });

  return (
    <>
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.customerRow}>
            <User size={18} color={COLORS.text} />
            <Text style={styles.customer}>{customerName}</Text>
          </View>
          <Text style={styles.hint}>Текущий процент: {pct}%</Text>

          <Text style={styles.label}>Сумма покупки (KGS)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor={COLORS.text3}
            keyboardType="decimal-pad"
            autoFocus
          />

          {/* Preview */}
          {purchaseNum > 0 && (
            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Будет начислено:</Text>
              <Text style={styles.previewValue}>+{formatKGS(bonusPreview)}</Text>
            </View>
          )}

          {purchaseNum < 500 && purchaseNum > 0 && (
            <View style={styles.warningRow}>
              <AlertTriangle size={14} color={COLORS.warn} />
              <Text style={styles.warning}>Минимум 500 KGS для начисления бонуса</Text>
            </View>
          )}

          {mutation.error && (
            <View style={styles.errorRow}>
              <XCircle size={14} color={COLORS.danger} />
              <Text style={styles.error}>
                {(mutation.error as any)?.response?.data?.detail?.message || 'Ошибка'}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btn, purchaseNum < 500 && styles.btnDisabled]}
            onPress={() => mutation.mutate()}
            disabled={purchaseNum < 500 || mutation.isPending}
            activeOpacity={0.7}
          >
            {mutation.isPending ? (
              <ActivityIndicator color={COLORS.bg} />
            ) : (
              <View style={styles.btnRow}>
                <CheckCircle2 size={18} color={COLORS.bg} />
                <Text style={styles.btnText}>Подтвердить начисление</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <SuccessModal
          visible={showSuccess}
          type="success"
          title="Бонус начислен!"
          message={result?.message_ru || ''}
          amount={result?.amount ? parseFloat(result.amount) : undefined}
          newBalance={result?.new_balance ? parseFloat(result.new_balance) : undefined}
          onClose={() => { setShowSuccess(false); navigation.goBack(); }}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  customer: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  hint: { color: COLORS.text2, fontSize: 13, marginBottom: 24 },
  label: { color: COLORS.text2, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: {
    backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.cardBorder,
    borderRadius: 14, paddingVertical: 18, paddingHorizontal: 18,
    color: COLORS.accent, fontSize: 28, fontWeight: '800', textAlign: 'center',
  },
  preview: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(255,230,0,0.08)', borderRadius: 14, padding: 16, marginTop: 16,
    borderWidth: 1, borderColor: 'rgba(255,230,0,0.15)',
  },
  previewLabel: { color: COLORS.text2, fontSize: 14 },
  previewValue: { color: COLORS.accent, fontSize: 22, fontWeight: '800' },
  warningRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  warning: { color: COLORS.warn, fontSize: 13 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  error: { color: COLORS.danger, fontSize: 13 },
  btn: { marginTop: 24, backgroundColor: COLORS.accent, paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { color: COLORS.bg, fontSize: 16, fontWeight: '800' },
});
