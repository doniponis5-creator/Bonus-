/**
 * Search — Поиск клиента по телефону или QR коду.
 */

import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { customersAPI } from '@/api/client';
import QRScanner from '@/components/QRScanner';
import { COLORS } from '@/constants/theme';

export default function SearchScreen() {
  const navigation = useNavigation<any>();
  const [phone, setPhone] = useState('+996');
  const [loading, setLoading] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const searchByPhone = async () => {
    if (phone.length < 9) return Alert.alert('Ошибка', 'Введите корректный номер телефона');
    setLoading(true);
    try {
      const { data } = await customersAPI.byPhone(phone);
      navigation.navigate('Customer', { id: data.id  });
    } catch (err: any) {
      Alert.alert('Не найден', 'Клиент с таким номером не найден.\nЗарегистрировать?', [
        { text: 'Отмена' },
        { text: 'Регистрация', onPress: () => navigation.navigate('Register') },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleQRScan = async (qrCode: string) => {
    setShowQR(false);
    setLoading(true);
    try {
      const { data } = await customersAPI.byQR(qrCode);
      navigation.navigate('Customer', { id: data.id  });
    } catch {
      Alert.alert('Ошибка', 'QR код не распознан');
    } finally {
      setLoading(false);
    }
  };

  if (showQR) {
    return <QRScanner onScan={handleQRScan} onClose={() => setShowQR(false)} />;
  }

  return (
    <>
      <View style={styles.container}>
        {/* По телефону */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📱 По номеру телефона</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+996557100505"
            placeholderTextColor={COLORS.text3}
            keyboardType="phone-pad"
            maxLength={13}
          />
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={searchByPhone}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.bg} />
            ) : (
              <Text style={styles.searchBtnText}>Найти</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Разделитель */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>или</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* QR код */}
        <TouchableOpacity style={styles.qrBtn} onPress={() => setShowQR(true)} activeOpacity={0.7}>
          <Text style={styles.qrEmoji}>📷</Text>
          <Text style={styles.qrTitle}>Сканировать QR код</Text>
          <Text style={styles.qrDesc}>Наведите камеру на QR карточки клиента</Text>
        </TouchableOpacity>
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
  cardTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 16 },
  input: {
    backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.cardBorder,
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18,
    color: COLORS.text, fontSize: 18, fontWeight: '600', marginBottom: 14,
  },
  searchBtn: { backgroundColor: COLORS.accent, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  searchBtnText: { color: COLORS.bg, fontSize: 16, fontWeight: '800' },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.cardBorder },
  dividerText: { color: COLORS.text3, fontSize: 13, marginHorizontal: 16 },

  qrBtn: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 28,
    borderWidth: 1, borderColor: 'rgba(0,229,160,0.2)', alignItems: 'center',
  },
  qrEmoji: { fontSize: 40, marginBottom: 12 },
  qrTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700', marginBottom: 6 },
  qrDesc: { color: COLORS.text2, fontSize: 13, textAlign: 'center' },
});
