/**
 * Motivation — Кассир мотивация экрани.
 * Дневные/месячные цели, стрик, заработанные бонусы.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import {
  Flame, Target, Calendar, TrendingUp, Zap, Trophy, Gift,
} from 'lucide-react-native';
import { cashierBonusAPI } from '@/api/client';
import { COLORS, formatKGS } from '@/constants/theme';

interface Milestone {
  sales: number;
  bonus: number;
}

interface ProgressBlock {
  sales: number;
  revenue: number;
  current_milestone: Milestone | null;
  next_milestone: Milestone | null;
  earned_today?: number;
  earned_month?: number;
}

interface StreakBlock {
  days: number;
  min_sales: number;
  current_milestone: { days: number; bonus: number } | null;
  next_milestone: { days: number; bonus: number } | null;
  earned_total: number;
}

interface ProgressData {
  daily: ProgressBlock;
  monthly: ProgressBlock;
  streak: StreakBlock;
}

export default function MotivationScreen() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await cashierBonusAPI.myProgress();
      setData(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Не удалось загрузить данные</Text>
      </View>
    );
  }

  const totalEarned = (data.daily.earned_today || 0) + (data.monthly.earned_month || 0) + (data.streak.earned_total || 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Flame size={28} color="#ff6b35" />
        <View>
          <Text style={styles.headerTitle}>Моя мотивация</Text>
          <Text style={styles.headerSub}>Цели, прогресс, бонусы</Text>
        </View>
      </View>

      {/* Total earned banner */}
      {totalEarned > 0 && (
        <View style={styles.totalBanner}>
          <Gift size={20} color={COLORS.accent} />
          <Text style={styles.totalText}>
            Заработано бонусов: <Text style={styles.totalAmount}>{formatKGS(totalEarned)}</Text>
          </Text>
        </View>
      )}

      {/* ═══ Daily progress ═══ */}
      <ProgressCard
        icon={<Target size={22} color="#22c55e" />}
        title="Сегодня"
        color="#22c55e"
        sales={data.daily.sales}
        revenue={data.daily.revenue}
        nextMilestone={data.daily.next_milestone}
        currentMilestone={data.daily.current_milestone}
        earned={data.daily.earned_today || 0}
        label="продаж"
      />

      {/* ═══ Monthly progress ═══ */}
      <ProgressCard
        icon={<Calendar size={22} color="#60a5fa" />}
        title="Этот месяц"
        color="#60a5fa"
        sales={data.monthly.sales}
        revenue={data.monthly.revenue}
        nextMilestone={data.monthly.next_milestone}
        currentMilestone={data.monthly.current_milestone}
        earned={data.monthly.earned_month || 0}
        label="продаж"
      />

      {/* ═══ Streak ═══ */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIconWrap, { backgroundColor: 'rgba(255,107,53,0.12)' }]}>
            <Zap size={22} color="#ff6b35" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Стрик</Text>
            <Text style={styles.cardSub}>
              {data.streak.min_sales}+ продаж каждый день подряд
            </Text>
          </View>
        </View>

        <View style={styles.streakRow}>
          <View style={styles.streakBig}>
            <Text style={styles.streakNum}>{data.streak.days}</Text>
            <Text style={styles.streakLabel}>дней</Text>
          </View>
          <Flame size={40} color={data.streak.days > 0 ? '#ff6b35' : COLORS.text3} />
        </View>

        {data.streak.next_milestone && (
          <View style={styles.nextGoal}>
            <Trophy size={14} color={COLORS.accent} />
            <Text style={styles.nextGoalText}>
              Следующая цель: {data.streak.next_milestone.days} дн. → +{formatKGS(data.streak.next_milestone.bonus)}
            </Text>
          </View>
        )}

        {data.streak.earned_total > 0 && (
          <Text style={styles.earnedText}>
            Заработано за стрики: {formatKGS(data.streak.earned_total)}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}


// ═══════════════════════════════════════
// PROGRESS CARD COMPONENT
// ═══════════════════════════════════════
function ProgressCard({
  icon, title, color, sales, revenue, nextMilestone, currentMilestone, earned, label,
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
  sales: number;
  revenue: number;
  nextMilestone: Milestone | null;
  currentMilestone: Milestone | null;
  earned: number;
  label: string;
}) {
  const target = nextMilestone?.sales || (currentMilestone?.sales || 0);
  const progress = target > 0 ? Math.min(sales / target, 1) : (sales > 0 ? 1 : 0);

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconWrap, { backgroundColor: `${color}20` }]}>
          {icon}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSub}>
            Выручка: {revenue > 0 ? (revenue / 1000).toFixed(0) + 'K' : '0'} KGS
          </Text>
        </View>
        <View style={styles.salesBadge}>
          <Text style={[styles.salesNum, { color }]}>{sales}</Text>
          <Text style={styles.salesLabel}>{label}</Text>
        </View>
      </View>

      {/* Progress bar */}
      {target > 0 && (
        <View style={styles.progressWrap}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: color }]} />
          </View>
          <Text style={styles.progressText}>
            {sales} / {target}
          </Text>
        </View>
      )}

      {/* Next milestone */}
      {nextMilestone && (
        <View style={styles.nextGoal}>
          <Trophy size={14} color={COLORS.accent} />
          <Text style={styles.nextGoalText}>
            Цель: {nextMilestone.sales} {label} → +{formatKGS(nextMilestone.bonus)}
          </Text>
          <Text style={[styles.remaining, { color }]}>
            ещё {nextMilestone.sales - sales}
          </Text>
        </View>
      )}

      {/* Already achieved */}
      {currentMilestone && (
        <View style={styles.achieved}>
          <TrendingUp size={14} color={COLORS.success} />
          <Text style={styles.achievedText}>
            Достигнуто: {currentMilestone.sales} {label} → +{formatKGS(currentMilestone.bonus)}
          </Text>
        </View>
      )}

      {/* Earned bonus */}
      {earned > 0 && (
        <Text style={styles.earnedText}>
          Заработано: {formatKGS(earned)}
        </Text>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  errorText: { color: COLORS.danger, fontSize: 16 },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20,
  },
  headerTitle: { color: COLORS.text, fontSize: 24, fontWeight: '900' },
  headerSub: { color: COLORS.text2, fontSize: 13, marginTop: 2 },

  totalBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,230,0,0.08)', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,230,0,0.15)', marginBottom: 16,
  },
  totalText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  totalAmount: { color: COLORS.accent, fontWeight: '900' },

  card: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: COLORS.cardBorder, marginBottom: 14,
  },

  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16,
  },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  cardTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  cardSub: { color: COLORS.text2, fontSize: 12, marginTop: 2 },

  salesBadge: { alignItems: 'center' },
  salesNum: { fontSize: 28, fontWeight: '900' },
  salesLabel: { color: COLORS.text3, fontSize: 10, marginTop: -2 },

  progressWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14,
  },
  progressBar: {
    flex: 1, height: 8, backgroundColor: COLORS.bg2, borderRadius: 4, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: { color: COLORS.text2, fontSize: 12, fontWeight: '700', minWidth: 55, textAlign: 'right' },

  nextGoal: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,230,0,0.06)', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,230,0,0.1)', marginBottom: 8,
  },
  nextGoalText: { color: COLORS.text, fontSize: 13, fontWeight: '600', flex: 1 },
  remaining: { fontSize: 13, fontWeight: '800' },

  achieved: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(34,197,94,0.06)', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.1)', marginBottom: 8,
  },
  achievedText: { color: COLORS.success, fontSize: 13, fontWeight: '600' },

  earnedText: {
    color: COLORS.accent, fontSize: 13, fontWeight: '700', textAlign: 'right', marginTop: 4,
  },

  streakRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14,
  },
  streakBig: { alignItems: 'center' },
  streakNum: { color: '#ff6b35', fontSize: 56, fontWeight: '900', lineHeight: 60 },
  streakLabel: { color: COLORS.text2, fontSize: 14, fontWeight: '600', marginTop: -4 },
});
