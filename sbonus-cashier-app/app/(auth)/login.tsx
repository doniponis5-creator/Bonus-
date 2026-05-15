/**
 * Login — Вход кассира: телефон + PIN.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuthStore } from '@/store/auth';
import { COLORS } from '@/constants/theme';

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const [phone, setPhone] = useState('+996');
  const [pin, setPin] = useState('');
  const { login, isLoading, error } = useAuthStore();

  const handleLogin = async () => {
    if (phone.length < 13) return Alert.alert('Ошибка', 'Введите номер телефона');
    if (pin.length < 4) return Alert.alert('Ошибка', 'PIN должен быть 4 цифры');

    const success = await login(phone, pin);
    if (success) {
      navigation.replace('Dashboard');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        {/* Логотип */}
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>S</Text>
        </View>
        <Text style={styles.title}>S Bonus</Text>
        <Text style={styles.subtitle}>Кассир • Смарт Центр</Text>

        {/* Форма */}
        <View style={styles.form}>
          <Text style={styles.label}>📱 Номер телефона</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+996557100505"
            placeholderTextColor={COLORS.text3}
            keyboardType="phone-pad"
            maxLength={13}
          />

          <Text style={[styles.label, { marginTop: 20 }]}>🔑 PIN код</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            placeholder="• • • •"
            placeholderTextColor={COLORS.text3}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
          />

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>❌ {error}</Text>
            </View>
          )}

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
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(0,229,160,0.12)', borderWidth: 2, borderColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  logoText: { fontSize: 36, fontWeight: '900', color: COLORS.accent },
  title: { fontSize: 32, fontWeight: '900', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: COLORS.text2, marginBottom: 40 },

  form: { width: '100%' },
  label: { color: COLORS.text2, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: {
    backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.cardBorder,
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18,
    color: COLORS.text, fontSize: 17, fontWeight: '600',
  },
  errorBox: {
    marginTop: 16, backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
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
