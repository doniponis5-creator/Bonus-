/**
 * SuccessModal — Красивое модальное окно успеха/ошибки.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CheckCircle2, Wallet, XCircle } from 'lucide-react-native';
import { COLORS, formatKGS } from '@/constants/theme';

interface Props {
  visible: boolean;
  type: 'success' | 'error';
  title: string;
  message: string;
  amount?: number;
  newBalance?: number;
  onClose: () => void;
}

export default function SuccessModal({ visible, type, title, message, amount, newBalance, onClose }: Props) {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.8);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, scale, opacity]);

  const isSuccess = type === 'success';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale }], opacity }]}>
          {/* Иконка */}
          <View style={[styles.iconCircle, { backgroundColor: isSuccess ? 'rgba(0,229,160,0.15)' : 'rgba(239,68,68,0.15)' }]}>
            {isSuccess ? (
              <CheckCircle2 size={44} color={COLORS.accent} />
            ) : (
              <XCircle size={44} color={COLORS.danger} />
            )}
          </View>

          {/* Заголовок */}
          <Text style={[styles.title, { color: isSuccess ? COLORS.accent : COLORS.danger }]}>
            {title}
          </Text>
          <Text style={styles.message}>{message}</Text>

          {/* Сумма */}
          {amount != null && (
            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>{isSuccess ? 'Сумма операции' : 'Запрошено'}</Text>
              <Text style={[styles.amountValue, { color: isSuccess ? COLORS.accent : COLORS.danger }]}>
                {isSuccess ? '+' : ''}{formatKGS(amount)}
              </Text>
            </View>
          )}

          {newBalance != null && (
            <View style={styles.amountRow}>
              <View style={styles.amountLabelWrap}>
                <Wallet size={14} color={COLORS.text2} />
                <Text style={styles.amountLabel}>Новый баланс</Text>
              </View>
              <Text style={styles.balanceValue}>{formatKGS(newBalance)}</Text>
            </View>
          )}

          {/* Кнопка */}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: isSuccess ? COLORS.accent : COLORS.danger }]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.btnText}>{isSuccess ? 'Отлично!' : 'Понятно'}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 24, padding: 32,
    width: '100%', maxWidth: 360, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  iconCircle: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  message: { color: COLORS.text2, fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  amountRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', backgroundColor: COLORS.bg2, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  amountLabel: { color: COLORS.text2, fontSize: 13 },
  amountLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  amountValue: { fontSize: 18, fontWeight: '800' },
  balanceValue: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  btn: { width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 12 },
  btnText: { color: COLORS.bg, fontSize: 16, fontWeight: '800' },
});
