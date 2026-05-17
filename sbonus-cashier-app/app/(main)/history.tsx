/**
 * History — История транзакций клиента с пагинацией.
 */
import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator, FlatList, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Clock,
  CreditCard,
  Gift,
  PlusCircle,
  RefreshCcw,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { customersAPI } from '@/api/client';
import { COLORS, formatKGS } from '@/constants/theme';

const TYPE_LABELS: Record<string, { Icon: LucideIcon; label: string; color: string }> = {
  earn:     { Icon: PlusCircle, label: 'Начисление',    color: COLORS.accent },
  spend:    { Icon: CreditCard, label: 'Списание',       color: COLORS.accent3 },
  birthday: { Icon: Gift,       label: 'День рождения', color: COLORS.warn },
  referral: { Icon: Users,      label: 'Реферал',       color: COLORS.accent2 },
  promo:    { Icon: Ticket,     label: 'Промокод',       color: COLORS.warn },
  refund:   { Icon: RefreshCcw, label: 'Возврат',        color: COLORS.danger },
  expire:   { Icon: Clock,      label: 'Истёк',          color: COLORS.text3 },
};

const EARN_TYPES = new Set(['earn', 'birthday', 'referral', 'promo']);

export default function HistoryScreen() {
  const route = useRoute<any>();
  const { customerId } = route.params || {};
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useQuery<any>({
    queryKey: ['transactions', customerId, page],
    queryFn: () => customersAPI.transactions(customerId!, page).then(r => r.data),
    enabled: !!customerId,
    placeholderData: keepPreviousData,
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const perPage = data?.per_page || 20;
  const totalPages = Math.ceil(total / perPage);

  const renderItem = useCallback(({ item }: { item: any }) => {
    const info = TYPE_LABELS[item.type] || { Icon: Clock, label: item.type, color: COLORS.text2 };
    const Icon = info.Icon;
    const isEarn = EARN_TYPES.has(item.type);
    return (
      <View style={s.item}>
        <View style={[s.iconBox, { backgroundColor: `${info.color}15` }]}>
          <Icon size={22} color={info.color} />
        </View>
        <View style={s.info}>
          <Text style={s.label}>{info.label}</Text>
          <Text style={s.date}>{new Date(item.created_at).toLocaleString('ru-RU')}</Text>
          {item.note ? <Text style={s.note} numberOfLines={1}>{item.note}</Text> : null}
          {item.purchase_amount ? (
            <Text style={s.purchase}>Покупка: {formatKGS(item.purchase_amount)}</Text>
          ) : null}
        </View>
        <Text style={[s.amount, { color: isEarn ? COLORS.accent : COLORS.accent3 }]}>
          {isEarn ? '+' : '−'}{formatKGS(Math.abs(parseFloat(item.amount)))}
        </Text>
      </View>
    );
  }, []);

  return (
    <View style={s.c}>
      {/* Итого */}
      <View style={s.totalBar}>
        <Text style={s.totalText}>Всего операций: {total}</Text>
        {totalPages > 1 && (
          <Text style={s.pageText}>Стр. {page}/{totalPages}</Text>
        )}
      </View>

      {isLoading && page === 1 ? (
        <ActivityIndicator size="large" color={COLORS.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={i => i.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={<Text style={s.empty}>Операций пока нет</Text>}
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={s.pagination}>
                <TouchableOpacity
                  style={[s.pageBtn, page <= 1 && s.pageBtnDisabled]}
                  onPress={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1 || isFetching}
                >
                  <Text style={[s.pageBtnText, page <= 1 && { color: COLORS.text3 }]}>← Назад</Text>
                </TouchableOpacity>

                <Text style={s.pageIndicator}>{page} / {totalPages}</Text>

                <TouchableOpacity
                  style={[s.pageBtn, page >= totalPages && s.pageBtnDisabled]}
                  onPress={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isFetching}
                >
                  <Text style={[s.pageBtnText, page >= totalPages && { color: COLORS.text3 }]}>Далее →</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
      {isFetching && page > 1 && (
        <ActivityIndicator size="small" color={COLORS.accent} style={s.fetchIndicator} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.bg },
  totalBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder,
  },
  totalText: { color: COLORS.text2, fontSize: 13 },
  pageText: { color: COLORS.accent, fontSize: 13, fontWeight: '700' },
  list: { padding: 16, paddingBottom: 32 },
  item: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  iconBox: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  info: { flex: 1 },
  label: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  date: { color: COLORS.text3, fontSize: 11, marginTop: 2 },
  note: { color: COLORS.text2, fontSize: 11, marginTop: 2 },
  purchase: { color: COLORS.text3, fontSize: 11, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '800' },
  empty: { color: COLORS.text3, fontSize: 14, textAlign: 'center', marginTop: 40 },
  pagination: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 16, paddingHorizontal: 8,
  },
  pageBtn: {
    backgroundColor: COLORS.card, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { color: COLORS.accent, fontSize: 14, fontWeight: '700' },
  pageIndicator: { color: COLORS.text2, fontSize: 13 },
  fetchIndicator: { position: 'absolute', bottom: 80, alignSelf: 'center' },
});
