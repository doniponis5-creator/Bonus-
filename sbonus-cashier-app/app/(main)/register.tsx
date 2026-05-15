/**
 * Register — Регистрация нового клиента.
 */
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { customersAPI } from '@/api/client';
import { COLORS } from '@/constants/theme';

export default function RegisterScreen() {
  const navigation = useNavigation<any>();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+996');
  const [birth, setBirth] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || phone.length < 9) return Alert.alert('Ошибка', 'Заполните имя и телефон');
    setLoading(true);
    try {
      const { data } = await customersAPI.register({
        full_name: name, phone,
        birth_date: birth || undefined,
      });
      Alert.alert('✅ Готово!', `${name} зарегистрирован в S Bonus`, [
        { text: 'Открыть карточку', onPress: () => navigation.replace('Customer', { id: data.id }) },
      ]);
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || 'Ошибка регистрации';
      Alert.alert('Ошибка', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <View style={s.c}>
        <View style={s.card}>
          <Text style={s.l}>👤 Полное имя</Text>
          <TextInput style={s.i} value={name} onChangeText={setName} placeholder="Иванов Иван" placeholderTextColor={COLORS.text3} />
          <Text style={[s.l, { marginTop: 16 }]}>📱 Телефон</Text>
          <TextInput style={s.i} value={phone} onChangeText={setPhone} placeholder="+996557100505" placeholderTextColor={COLORS.text3} keyboardType="phone-pad" maxLength={13} />
          <Text style={[s.l, { marginTop: 16 }]}>🎂 Дата рождения (опционально)</Text>
          <TextInput style={s.i} value={birth} onChangeText={setBirth} placeholder="1990-05-15" placeholderTextColor={COLORS.text3} />
          <TouchableOpacity style={[s.btn, (!name || phone.length < 9) && s.bd]} onPress={handleRegister} disabled={loading || !name || phone.length < 9} activeOpacity={0.7}>
            <Text style={s.bt}>{loading ? '⏳...' : '✅ Зарегистрировать'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.bg, padding: 20 },
  card: { backgroundColor: COLORS.card, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: COLORS.cardBorder },
  l: { color: COLORS.text2, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  i: { backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.cardBorder, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18, color: COLORS.text, fontSize: 17, fontWeight: '600' },
  btn: { marginTop: 28, backgroundColor: COLORS.accent, paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  bd: { opacity: 0.4 }, bt: { color: COLORS.bg, fontSize: 16, fontWeight: '800' },
});
