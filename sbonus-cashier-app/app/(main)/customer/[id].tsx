/**
 * Customer [id] — Карточка клиента с балансом и быстрыми действиями.
 */

import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Cake, History, Link2, Ticket, Users } from 'lucide-react-native';
import { bonusAPI, customerAuthAPI, customersAPI } from '@/api/client';
import CustomerCard from '@/components/CustomerCard';
import InputModal from '@/components/InputModal';
import SuccessModal from '@/components/SuccessModal';
import { useAuthStore } from '@/store/auth';
import { COLORS } from '@/constants/theme';

import QRCode from 'react-native-qrcode-svg';

type ResultModal =
  | { type: 'success'; title: string; message: string; amount?: number; newBalance?: number }
  | { type: 'error'; title: string; message: string }
  | null;

export default function CustomerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { id } = route.params || {};
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [promoOpen, setPromoOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [promoLoading, setPromoLoading] = useState(false);
  const [referralLoading, setReferralLoading] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [bdLoading, setBdLoading] = useState(false);
  const [result, setResult] = useState<ResultModal>(null);

  const { data: balance, isLoading, error } = useQuery({
    queryKey: ['balance', id],
    queryFn: () => customersAPI.balance(id!).then((r) => r.data),
    enabled: !!id,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['balance', id] });

  const handleBirthday = () => {
    Alert.alert(
      'День рождения',
      `Начислить бонус ко дню рождения клиенту «${balance?.full_name}»?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Начислить',
          style: 'default',
          onPress: async () => {
            setBdLoading(true);
            try {
              const r = await bonusAPI.birthday(id);
              setResult({
                type: 'success',
                title: 'Бонус начислен',
                message: r.data.message_ru || 'Бонус ко дню рождения добавлен',
                amount: Number(r.data.amount),
                newBalance: Number(r.data.new_balance),
              });
              refresh();
            } catch (er: any) {
              setResult({
                type: 'error',
                title: 'Не удалось',
                message: er?.response?.data?.detail?.message || 'Ошибка начисления',
              });
            } finally {
              setBdLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleSendLink = () => {
    Alert.alert(
      'Отправить ссылку',
      `Отправить клиенту «${balance?.full_name}» ссылку на личный кабинет в WhatsApp?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отправить',
          style: 'default',
          onPress: async () => {
            setSendingLink(true);
            try {
              const r = await customerAuthAPI.sendCabinetLink(id);
              setResult({
                type: 'success',
                title: 'Ссылка отправлена',
                message: r.data.message || 'Ссылка отправлена в WhatsApp',
              });
            } catch (er: any) {
              setResult({
                type: 'error',
                title: 'Не отправлено',
                message: er?.response?.data?.detail?.message || 'Ошибка отправки',
              });
            } finally {
              setSendingLink(false);
            }
          },
        },
      ],
    );
  };

  const submitPromo = async (code: string) => {
    setPromoLoading(true);
    try {
      const r = await bonusAPI.applyPromo(id, code);
      setPromoOpen(false);
      setResult({
        type: 'success',
        title: 'Промокод применён',
        message: r.data.message_ru || `Бонус начислен по промокоду «${code}»`,
        amount: Number(r.data.amount),
        newBalance: Number(r.data.new_balance),
      });
      refresh();
    } catch (er: any) {
      setPromoOpen(false);
      setResult({
        type: 'error',
        title: 'Не применён',
        message: er?.response?.data?.detail?.message || 'Промокод недействителен',
      });
    } finally {
      setPromoLoading(false);
    }
  };

  const submitReferral = async (code: string) => {
    setReferralLoading(true);
    try {
      const r = await bonusAPI.applyReferral(id, code);
      setReferralOpen(false);
      setResult({
        type: 'success',
        title: 'Реферал применён',
        message: r.data.message_ru || `Реферальный бонус начислен`,
        amount: Number(r.data.amount),
        newBalance: Number(r.data.new_balance),
      });
      refresh();
    } catch (er: any) {
      setReferralOpen(false);
      setResult({
        type: 'error',
        title: 'Не применён',
        message: er?.response?.data?.detail?.message || 'Реферальный код недействителен',
      });
    } finally {
      setReferralLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (error || !balance) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Ошибка загрузки клиента</Text>
      </View>
    );
  }

  const isBusy = bdLoading || sendingLink;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <CustomerCard
          fullName={balance.full_name}
          phone={balance.phone}
          balance={parseFloat(balance.balance)}
          totalEarned={parseFloat(balance.total_earned)}
          tierName={balance.tier_name}
          tierPercent={parseFloat(balance.tier_percent)}
          nextTierName={balance.next_tier_name}
          nextTierRemaining={balance.next_tier_remaining ? parseFloat(balance.next_tier_remaining) : null}
          onEarn={() => navigation.navigate('Earn', {
            customerId: id, customerName: balance.full_name, tierPercent: balance.tier_percent
          })}
          onSpend={() => navigation.navigate('Spend', {
            customerId: id, customerName: balance.full_name, balance: balance.balance
          })}
        />

        {/* Быстрые действия */}
        <View style={styles.actionsGrid}>
          <ActionButton icon={Cake} label="День рождения" color={COLORS.warn} onPress={handleBirthday} loading={bdLoading} disabled={isBusy} />
          <ActionButton icon={Ticket} label="Промокод" color={COLORS.accent3} onPress={() => setPromoOpen(true)} disabled={isBusy} />
          <ActionButton icon={Users} label="Реферал" color={COLORS.accent2} onPress={() => setReferralOpen(true)} disabled={isBusy} />
          <ActionButton icon={Link2} label="Ссылка в WA" color={COLORS.accent} onPress={handleSendLink} loading={sendingLink} disabled={isBusy} />
        </View>

        {/* QR Код */}
        {balance.qr_code && (
          <View style={styles.qrCard}>
            <Text style={styles.qrLabel}>Скан для поиска клиента</Text>
            <View style={styles.qrBox}>
              <QRCode value={balance.qr_code} size={160} color="#000" backgroundColor="#fff" />
            </View>
            <Text style={styles.qrCode}>{balance.qr_code}</Text>
          </View>
        )}

        {/* История */}
        <TouchableOpacity
          style={styles.historyBtn}
          onPress={() => navigation.navigate('History', { customerId: id })}
          activeOpacity={0.7}
        >
          <History size={18} color={COLORS.accent} />
          <Text style={styles.historyLink}>Показать историю операций →</Text>
        </TouchableOpacity>
      </ScrollView>

      <InputModal
        visible={promoOpen}
        title="Применить промокод"
        placeholder="BONUS500"
        loading={promoLoading}
        onSubmit={submitPromo}
        onClose={() => !promoLoading && setPromoOpen(false)}
      />

      <InputModal
        visible={referralOpen}
        title="Реферальный код"
        placeholder="REF-ABC12345"
        loading={referralLoading}
        onSubmit={submitReferral}
        onClose={() => !referralLoading && setReferralOpen(false)}
      />

      <SuccessModal
        visible={result !== null}
        type={result?.type ?? 'success'}
        title={result?.title ?? ''}
        message={result?.message ?? ''}
        amount={result?.type === 'success' ? result.amount : undefined}
        newBalance={result?.type === 'success' ? result.newBalance : undefined}
        onClose={() => setResult(null)}
      />
    </>
  );
}

function ActionButton({
  icon: Icon,
  label,
  color,
  onPress,
  loading,
  disabled,
}: {
  icon: any;
  label: string;
  color: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { borderColor: `${color}40` }, disabled && { opacity: 0.4 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={[styles.actionIcon, { backgroundColor: `${color}20` }]}>
        {loading ? <ActivityIndicator color={color} /> : <Icon size={22} color={color} />}
      </View>
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  errorText: { color: COLORS.danger, fontSize: 16 },

  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  actionBtn: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { flex: 1, fontSize: 13, fontWeight: '700' },

  qrCard: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 16,
  },
  qrLabel: { color: COLORS.text3, marginBottom: 16, fontWeight: '600' },
  qrBox: { padding: 12, backgroundColor: '#fff', borderRadius: 12 },
  qrCode: { color: COLORS.text2, marginTop: 16, fontSize: 13, letterSpacing: 1, fontWeight: '700' },

  historyBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  historyLink: { color: COLORS.accent, fontSize: 14, fontWeight: '600' },
});
