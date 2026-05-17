/**
 * InputModal — Универсальное модальное окно с текстовым полем (промокод, реферал и т.д.).
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { COLORS } from '@/constants/theme';

interface Props {
  visible: boolean;
  title: string;
  placeholder?: string;
  autoCapitalize?: 'none' | 'characters';
  loading?: boolean;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export default function InputModal({
  visible,
  title,
  placeholder,
  autoCapitalize = 'characters',
  loading = false,
  onSubmit,
  onClose,
}: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!visible) setValue('');
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.overlay}
      >
        <View style={s.card}>
          <View style={s.header}>
            <Text style={s.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} disabled={loading}>
              <X size={20} color={COLORS.text2} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={s.input}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={COLORS.text3}
            autoCapitalize={autoCapitalize}
            autoCorrect={false}
            editable={!loading}
            autoFocus
          />

          <View style={s.actions}>
            <TouchableOpacity
              style={[s.btn, s.btnCancel]}
              onPress={onClose}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={s.btnCancelText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnPrimary, (!value.trim() || loading) && s.btnDisabled]}
              onPress={() => onSubmit(value.trim())}
              disabled={!value.trim() || loading}
              activeOpacity={0.7}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.bg} />
              ) : (
                <Text style={s.btnPrimaryText}>Применить</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  input: {
    backgroundColor: COLORS.bg2,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 20,
  },
  actions: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnCancel: { backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.cardBorder },
  btnCancelText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  btnPrimary: { backgroundColor: COLORS.accent },
  btnPrimaryText: { color: COLORS.bg, fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.4 },
});
