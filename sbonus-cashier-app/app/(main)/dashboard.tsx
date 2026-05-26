/**
 * Dashboard — Главный экран кассира.
 * Logo + Welcome + Quick Actions + Motivation link
 */

import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ChevronRight, LogOut, Search, UserPlus, Hand,
  Flame, Clock, TrendingUp, Package,
} from 'lucide-react-native';
import { useAuthStore } from '@/store/auth';
import { COLORS } from '@/constants/theme';
import api from '@/api/client';

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuthStore();
  const branchName = user?.branch_name || 'Смарт Центр';
  const [todayStats, setTodayStats] = useState({ count: 0, total: 0 });

  useEffect(() => {
    // Load today's quick stats (uses /my-progress — no admin role needed)
    api.get('/api/v1/admin/cashier-bonuses/my-progress')
      .then(res => {
        const d = res.data;
        setTodayStats({
          count: d?.daily?.sales || 0,
          total: d?.daily?.revenue || 0,
        });
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    navigation.replace('Login');
  };

  return (
    <View style={styles.container}>
      {/* Header with Logo */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.logoImg}
          />
          <View>
            <Text style={styles.shopName}>Смарт Центр</Text>
            <Text style={styles.bonusName}>S Bonus • Кассир</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <LogOut size={22} color={COLORS.text2} />
        </TouchableOpacity>
      </View>

      {/* Welcome + Today Stats */}
      <View style={styles.welcomeCard}>
        <Hand size={32} color={COLORS.accent} style={{ marginBottom: 6 }} />
        <Text style={styles.welcomeTitle}>Добро пожаловать!</Text>
        <Text style={styles.welcomeSub}>Филиал: {branchName}</Text>

        {/* Mini today stats */}
        <View style={styles.todayRow}>
          <View style={styles.todayStat}>
            <Text style={styles.todayNum}>{todayStats.count}</Text>
            <Text style={styles.todayLabel}>продаж</Text>
          </View>
          <View style={styles.todayDivider} />
          <View style={styles.todayStat}>
            <Text style={styles.todayNum}>
              {todayStats.total > 0 ? (todayStats.total / 1000).toFixed(0) + 'K' : '0'}
            </Text>
            <Text style={styles.todayLabel}>KGS</Text>
          </View>
        </View>
      </View>

      {/* Main actions */}
      <TouchableOpacity
        style={styles.mainBtn}
        onPress={() => navigation.navigate('Search')}
        activeOpacity={0.7}
      >
        <View style={[styles.btnIcon, { backgroundColor: 'rgba(255,230,0,0.12)' }]}>
          <Search size={22} color={COLORS.accent} />
        </View>
        <View style={styles.btnInfo}>
          <Text style={styles.btnTitle}>Найти клиента</Text>
          <Text style={styles.btnDesc}>По телефону или QR коду</Text>
        </View>
        <ChevronRight size={22} color={COLORS.text3} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.mainBtn}
        onPress={() => navigation.navigate('Register')}
        activeOpacity={0.7}
      >
        <View style={[styles.btnIcon, { backgroundColor: 'rgba(124,111,255,0.12)' }]}>
          <UserPlus size={22} color={COLORS.accent3} />
        </View>
        <View style={styles.btnInfo}>
          <Text style={styles.btnTitle}>Новый клиент</Text>
          <Text style={styles.btnDesc}>Зарегистрировать в S Bonus</Text>
        </View>
        <ChevronRight size={22} color={COLORS.text3} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.mainBtn}
        onPress={() => navigation.navigate('Products')}
        activeOpacity={0.7}
      >
        <View style={[styles.btnIcon, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
          <Package size={22} color={COLORS.success} />
        </View>
        <View style={styles.btnInfo}>
          <Text style={styles.btnTitle}>Товарлар</Text>
          <Text style={styles.btnDesc}>Қидирув, нарх, остаток</Text>
        </View>
        <ChevronRight size={22} color={COLORS.text3} />
      </TouchableOpacity>

      {/* Motivation link */}
      <TouchableOpacity
        style={styles.motivationBtn}
        onPress={() => navigation.navigate('Motivation')}
        activeOpacity={0.7}
      >
        <View style={styles.motivationLeft}>
          <View style={styles.motivationIcon}>
            <Flame size={22} color="#ff6b35" />
          </View>
          <View>
            <Text style={styles.motivationTitle}>Моя мотивация</Text>
            <Text style={styles.motivationDesc}>Цели, прогресс, бонусы</Text>
          </View>
        </View>
        <View style={styles.motivationArrow}>
          <TrendingUp size={18} color={COLORS.accent} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20, paddingTop: 60 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoImg: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.bg2,
  },
  shopName: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  bonusName: { color: COLORS.text2, fontSize: 12 },
  logoutBtn: { padding: 10 },

  welcomeCard: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: COLORS.cardBorder, marginBottom: 20, alignItems: 'center',
  },
  welcomeTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  welcomeSub: { color: COLORS.text2, fontSize: 14, marginBottom: 16 },

  todayRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,230,0,0.06)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28,
    borderWidth: 1, borderColor: 'rgba(255,230,0,0.1)',
  },
  todayStat: { alignItems: 'center', paddingHorizontal: 16 },
  todayNum: { color: COLORS.accent, fontSize: 24, fontWeight: '900' },
  todayLabel: { color: COLORS.text2, fontSize: 11, marginTop: 2 },
  todayDivider: { width: 1, height: 30, backgroundColor: COLORS.cardBorder },

  mainBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: COLORS.cardBorder, marginBottom: 12,
  },
  btnIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  btnInfo: { flex: 1, marginLeft: 14 },
  btnTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  btnDesc: { color: COLORS.text2, fontSize: 12, marginTop: 3 },

  motivationBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.card, borderRadius: 16, padding: 18, marginTop: 8,
    borderWidth: 1, borderColor: 'rgba(255,107,53,0.2)',
    // subtle gradient feel
    shadowColor: '#ff6b35', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.08, shadowRadius: 12,
  },
  motivationLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  motivationIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(255,107,53,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  motivationTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  motivationDesc: { color: COLORS.text2, fontSize: 12, marginTop: 3 },
  motivationArrow: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,230,0,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
});
