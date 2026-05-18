/**
 * Dashboard — Главный экран кассира.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronRight, LogOut, Search, UserPlus, Hand } from 'lucide-react-native';
import { useAuthStore } from '@/store/auth';
import { COLORS } from '@/constants/theme';
import api from '@/api/client';

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuthStore();
  const [branchName, setBranchName] = useState('Смарт Центр');

  useEffect(() => {
    if (user?.branch_id) {
      api.get('/api/v1/admin/branches')
        .then(res => {
          const branch = res.data.find((b: any) => b.id === user.branch_id);
          if (branch) setBranchName(branch.name);
        })
        .catch(() => {});
    }
  }, [user?.branch_id]);

  const handleLogout = async () => {
    await logout();
    navigation.replace('Login');
  };

  return (
    <>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>S</Text>
            </View>
            <View>
              <Text style={styles.shopName}>Смарт Центр</Text>
              <Text style={styles.bonusName}>S Bonus • Кассир</Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <LogOut size={22} color={COLORS.text2} />
          </TouchableOpacity>
        </View>

        {/* Приветствие */}
        <View style={styles.welcomeCard}>
          <Hand size={36} color={COLORS.accent} style={{ marginBottom: 8 }} />
          <Text style={styles.welcomeTitle}>Добро пожаловать!</Text>
          <Text style={styles.welcomeSub}>
            Филиал: {branchName}{'\n'}
            Роль: Кассир
          </Text>
        </View>

        {/* Кнопки */}
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
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,230,0,0.12)', borderWidth: 1.5, borderColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center',
  },
  logoText: { fontSize: 20, fontWeight: '900', color: COLORS.accent },
  shopName: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  bonusName: { color: COLORS.text2, fontSize: 12 },
  logoutBtn: { padding: 10 },

  welcomeCard: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 28,
    borderWidth: 1, borderColor: COLORS.cardBorder, marginBottom: 24, alignItems: 'center',
  },
  welcomeTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800', marginBottom: 8 },
  welcomeSub: { color: COLORS.text2, fontSize: 14, textAlign: 'center', lineHeight: 22 },

  mainBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: COLORS.cardBorder, marginBottom: 12,
  },
  btnIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  btnInfo: { flex: 1, marginLeft: 14 },
  btnTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  btnDesc: { color: COLORS.text2, fontSize: 12, marginTop: 3 },
});
