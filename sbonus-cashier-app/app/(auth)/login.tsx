/**
 * Login — Вход кассира: телефон + PIN.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { KeyRound, Phone, XCircle } from 'lucide-react-native';
import { useAuthStore } from '@/store/auth';
import { COLORS } from '@/constants/theme';

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const [phone, setPhone] = useState('+996');
  const [pin, setPin] = useState('');
  const { login, isLoading, error } = useAuthStore();

  const [localError, setLocalError] = useState('');

  const handleLogin = async () => {
    if (phone.length < 13) { setLocalError('Введите номер телефона'); return; }
    if (pin.length < 4) { setLocalError('PIN должен быть 4 цифры'); return; }
    setLocalError('');

    const success = await login(phone, pin);
    if (success) {
      navigation.replace('Dashboard');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        {/* Логотип */}
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.logoImg}
        />
        <Text style={styles.title}>S Bonus</Text>
        <Text style={styles.subtitle}>Кассир • Смарт Центр</Text>

        {/* Форма */}
        <View style={styles.form}>
          <View style={styles.labelRow}>
            <Phone size={14} color={COLORS.text2} />
            <Text style={styles.label}>Номер телефона</Text>
          </View>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+996557100505"
            placeholderTextColor={COLORS.text3}
            keyboardType="phone-pad"
            maxLength={13}
            autoComplete="username"
            textContentType="username"
            // @ts-ignore — RN-web ham name'ni qabul qiladi
            name="phone"
            // @ts-ignore
            autoCapitalize="none"
          />

          <View style={[styles.labelRow, { marginTop: 20 }]}>
            <KeyRound size={14} color={COLORS.text2} />
            <Text style={styles.label}>PIN код</Text>
          </View>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            placeholder="• • • •"
            placeholderTextColor={COLORS.text3}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            autoComplete="current-password"
            textContentType="password"
            // @ts-ignore — RN-web ham name'ni qabul qiladi
            name="pin"
          />

          {(error || localError) ? (
            <View style={styles.errorBox}>
              <XCircle size={14} color={COLORS.danger} />
              <Text style={styles.errorText}>{error || localError}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, (isLoading || pin.length < 4) && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={isLoading || pin.length < 4}
            activeOpacity={0.7}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.bg} />
            ) : (
              <Text style={styles.btnText}>Войти</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Смарт Центр • Ош-3000, 86</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  logoImg: {
    width: 88, height: 88, borderRadius: 22, marginBottom: 16,
  },
  title: { fontSize: 32, fontWeight: '900', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: COLORS.text2, marginBottom: 40 },

  form: { width: '100%' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  label: { color: COLORS.text2, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.cardBorder,
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18,
    color: COLORS.text, fontSize: 17, fontWeight: '600',
  },
  errorBox: {
    marginTop: 16, backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  errorText: { color: COLORS.danger, fontSize: 13, fontWeight: '600' },

  btn: {
    marginTop: 28, backgroundColor: COLORS.accent,
    paddingVertical: 18, borderRadius: 16, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: COLORS.bg, fontSize: 17, fontWeight: '800' },

  footer: { color: COLORS.text3, fontSize: 12, marginTop: 40 },
});
