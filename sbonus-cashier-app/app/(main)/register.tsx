/**
 * Register — Регистрация нового клиента.
 * Поля: ФИО + телефон (день рождения больше не запрашиваем).
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CheckCircle2, Phone, User } from 'lucide-react-native';
import { customersAPI } from '@/api/client';
import { COLORS } from '@/constants/theme';

export default function RegisterScreen() {
  const navigation = useNavigation<any>();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+996');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || phone.length < 9) return Alert.alert('Ошибка', 'Заполните имя и телефон');
    setLoading(true);
    try {
      const { data } = await customersAPI.register({
        full_name: name,
        phone,
      });
      Alert.alert('Готово!', `${name} зарегистрирован в S Bonus`, [
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
    <View style={s.c}>
      <View style={s.card}>
        <View style={s.labelRow}>
          <User size={14} color={COLORS.text2} />
          <Text style={s.l}>Полное имя</Text>
        </View>
        <TextInput style={s.i} value={name} onChangeText={setName} placeholder="Иванов Иван" placeholderTextColor={COLORS.text3} />

        <View style={[s.labelRow, { marginTop: 16 }]}>
          <Phone size={14} color={COLORS.text2} />
          <Text style={s.l}>Телефон</Text>
        </View>
        <TextInput style={s.i} value={phone} onChangeText={setPhone} placeholder="+996557100505" placeholderTextColor={COLORS.text3} keyboardType="phone-pad" maxLength={13} />

        <TouchableOpacity style={[s.btn, (!name || phone.length < 9) && s.bd]} onPress={handleRegister} disabled={loading || !name || phone.length < 9} activeOpacity={0.7}>
          {loading ? (
            <ActivityIndicator color={COLORS.bg} />
          ) : (
            <View style={s.btnRow}>
              <CheckCircle2 size={18} color={COLORS.bg} />
              <Text style={s.bt}>Зарегистрировать</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.bg, padding: 20 },
  card: { backgroundColor: COLORS.card, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: COLORS.cardBorder },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  l: { color: COLORS.text2, fontSize: 13, fontWeight: '600' },
  i: { backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.cardBorder, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18, color: COLORS.text, fontSize: 17, fontWeight: '600' },
  btn: { marginTop: 28, backgroundColor: COLORS.accent, paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  bd: { opacity: 0.4 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bt: { color: COLORS.bg, fontSize: 16, fontWeight: '800' },
});
