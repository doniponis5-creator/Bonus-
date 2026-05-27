/**
 * Debt Check — Проверка клиента перед рассрочкой.
 * Кассир вводит номер → API возвращает кредитный рейтинг + рекомендацию.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft, Phone, Search, Shield, ShieldAlert,
  ShieldCheck, ShieldX, AlertTriangle, CheckCircle, XCircle, User,
} from 'lucide-react-native';
import { COLORS, formatKGS } from '@/constants/theme';
import api from '@/api/client';

export default function DebtCheckScreen() {
  const navigation = useNavigation();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleCheck = async () => {
    const p = phone.trim().replace(/\s/g, '').replace(/-/g, '');
    if (p.length < 3) {
      setError('Минимум 3 символа');
      return;
    }
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await api.get(`/api/v1/bi/debt-check/${encodeURIComponent(p)}`);
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка проверки');
    }
    setLoading(false);
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return COLORS.success;
    if (score >= 40) return COLORS.warn;
    return COLORS.danger;
  };

  const getCatIcon = (cat: string) => {
    switch (cat) {
      case 'blacklist': return <ShieldX size={20} color={COLORS.danger} />;
      case 'problematic': return <ShieldAlert size={20} color="#f97316" />;
      case 'monitoring': return <AlertTriangle size={20} color={COLORS.warn} />;
      case 'reliable': return <ShieldCheck size={20} color={COLORS.success} />;
      default: return <Shield size={20} color="#3b82f6" />;
    }
  };

  const getRecIcon = (allowed: boolean) => {
    return allowed
      ? <CheckCircle size={18} color={COLORS.success} />
      : <XCircle size={18} color={COLORS.danger} />;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Проверка клиента</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {/* Search */}
        <View style={styles.searchCard}>
          <View style={styles.inputRow}>
            <Phone size={18} color={COLORS.text3} />
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Телефон или ФИО..."
              placeholderTextColor={COLORS.text3}
              keyboardType="default"
              onSubmitEditing={handleCheck}
            />
          </View>
          <TouchableOpacity
            style={[styles.checkBtn, loading && { opacity: 0.6 }]}
            onPress={handleCheck}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading
              ? <ActivityIndicator color={COLORS.bg} size="small" />
              : <><Search size={16} color={COLORS.bg} /><Text style={styles.checkBtnText}>Проверить</Text></>
            }
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Result */}
        {result && !result.found && (
          <View style={[styles.resultCard, { borderColor: '#3b82f640' }]}>
            <View style={styles.notFoundRow}>
              <User size={28} color="#3b82f6" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.resultName}>Клиент не найден</Text>
                <Text style={styles.resultSub}>Нет в базе S Bonus</Text>
              </View>
            </View>
            <View style={[styles.recBox, { backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.3)' }]}>
              <CheckCircle size={16} color="#3b82f6" />
              <Text style={[styles.recText, { color: '#3b82f6' }]}>
                {result.recommendation?.reason || 'Новый клиент — начните с малой суммы'}
              </Text>
            </View>
          </View>
        )}

        {result && result.found && (
          <View style={[
            styles.resultCard,
            { borderColor: result.recommendation?.allowed ? COLORS.success + '40' : COLORS.danger + '40' }
          ]}>
            {/* Customer info */}
            <View style={styles.customerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resultName}>{result.name}</Text>
                <Text style={styles.resultPhone}>{result.phone}</Text>
              </View>
              <View style={[styles.scoreBadge, { backgroundColor: getScoreColor(result.credit_score) + '20', borderColor: getScoreColor(result.credit_score) + '60' }]}>
                <Text style={[styles.scoreText, { color: getScoreColor(result.credit_score) }]}>
                  {result.credit_score}/100
                </Text>
              </View>
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Активных долгов</Text>
                <Text style={[styles.statValue, result.active_debts > 0 && { color: COLORS.danger }]}>
                  {result.active_debts}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Остаток</Text>
                <Text style={[styles.statValue, { color: COLORS.warn }]}>
                  {formatKGS(result.total_remaining)}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Просрочка</Text>
                <Text style={[styles.statValue, result.max_overdue > 30 && { color: COLORS.danger }]}>
                  {result.max_overdue} дн.
                </Text>
              </View>
            </View>

            {/* Category */}
            <View style={styles.catRow}>
              {getCatIcon(result.category)}
              <Text style={[styles.catText, { color: result.category_meta?.color || COLORS.text }]}>
                {result.category_meta?.label || result.category}
              </Text>
            </View>

            {/* Recommendation */}
            <View style={[
              styles.recBox,
              {
                backgroundColor: result.recommendation?.allowed ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                borderColor: result.recommendation?.allowed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
              }
            ]}>
              {getRecIcon(result.recommendation?.allowed)}
              <Text style={[
                styles.recText,
                { color: result.recommendation?.allowed ? COLORS.success : COLORS.danger }
              ]}>
                {result.recommendation?.label}: {result.recommendation?.reason}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 20,
  },
  backBtn: { padding: 10 },
  headerTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },

  searchCard: {
    marginHorizontal: 16, backgroundColor: COLORS.card, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: COLORS.cardBorder, marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4,
    marginBottom: 12,
  },
  input: { flex: 1, color: COLORS.text, fontSize: 16, paddingVertical: 12 },
  checkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 14,
  },
  checkBtnText: { color: COLORS.bg, fontSize: 15, fontWeight: '700' },

  errorText: { color: COLORS.danger, fontSize: 13, textAlign: 'center', marginBottom: 12 },

  resultCard: {
    marginHorizontal: 16, backgroundColor: COLORS.card, borderRadius: 16,
    padding: 20, borderWidth: 1.5, marginBottom: 20,
  },
  notFoundRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  customerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  resultName: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  resultPhone: { color: COLORS.text2, fontSize: 13, marginTop: 2 },
  resultSub: { color: COLORS.text2, fontSize: 13, marginTop: 2 },

  scoreBadge: {
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1,
  },
  scoreText: { fontSize: 16, fontWeight: '900' },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.bg, borderRadius: 14, padding: 14, marginBottom: 14,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statLabel: { color: COLORS.text3, fontSize: 10, marginBottom: 4 },
  statValue: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  statDivider: { width: 1, height: 28, backgroundColor: COLORS.cardBorder },

  catRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  catText: { fontSize: 14, fontWeight: '700' },

  recBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, padding: 14, borderWidth: 1,
  },
  recText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
