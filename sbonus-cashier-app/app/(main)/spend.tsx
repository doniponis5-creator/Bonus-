/**
 * Spend — Списание бонуса.
 */
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CreditCard, User, Wallet } from 'lucide-react-native';
import { bonusAPI } from '@/api/client';
import SuccessModal from '@/components/SuccessModal';
import { useAuthStore } from '@/store/auth';
import { COLORS, formatKGS } from '@/constants/theme';

export default function SpendScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { customerId, customerName, balance: balStr } = route.params || {};
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const bal = parseFloat(balStr || '0');
  const [pa, setPa] = useState('');
  const [sa, setSa] = useState('');
  const [show, setShow] = useState(false);
  const [res, setRes] = useState<any>(null);
  const pn = parseFloat(pa) || 0;
  const sn = parseFloat(sa) || 0;
  const mx = Math.min(bal, Math.floor(pn * 0.30));
  const ok = sn > 0 && sn <= mx && pn > 0;

  const m = useMutation({
    mutationFn: () => bonusAPI.spend({ customer_id: customerId!, spend_amount: sn, purchase_amount: pn, branch_id: user?.branch_id || '' }),
    onSuccess: (r) => { setRes(r.data); setShow(true); qc.invalidateQueries({ queryKey: ['balance', customerId] }); },
  });

  return (
    <>
      <View style={s.c}>
        <View style={s.card}>
          <View style={s.nameRow}>
            <User size={18} color={COLORS.text} />
            <Text style={s.name}>{customerName}</Text>
          </View>
          <View style={s.br}>
            <View style={s.brLabelWrap}>
              <Wallet size={14} color={COLORS.text2} />
              <Text style={s.bl}>Доступно:</Text>
            </View>
            <Text style={s.bv}>{formatKGS(bal)}</Text>
          </View>
          <Text style={s.l}>Сумма покупки (KGS)</Text>
          <TextInput style={s.i} value={pa} onChangeText={setPa} placeholder="0" placeholderTextColor={COLORS.text3} keyboardType="decimal-pad" />
          {pn > 0 && <View style={s.mx}><Text style={s.mt}>Макс. списание: {formatKGS(mx)} (30%)</Text></View>}
          <Text style={[s.l, { marginTop: 16 }]}>Сумма списания (KGS)</Text>
          <TextInput style={[s.i, { color: COLORS.accent3 }]} value={sa} onChangeText={setSa} placeholder="0" placeholderTextColor={COLORS.text3} keyboardType="decimal-pad" />
          {sn > mx && pn > 0 && (
            <View style={s.eRow}>
              <AlertTriangle size={14} color={COLORS.danger} />
              <Text style={s.e}>Превышен лимит: макс. {formatKGS(mx)}</Text>
            </View>
          )}
          <TouchableOpacity style={[s.btn, !ok && s.bd]} onPress={() => m.mutate()} disabled={!ok || m.isPending} activeOpacity={0.7}>
            {m.isPending ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <View style={s.btnRow}>
                <CreditCard size={18} color={COLORS.white} />
                <Text style={s.bt}>Подтвердить списание</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <SuccessModal visible={show} type="success" title="Бонус списан!" message={res?.message_ru || ''} amount={res?.amount ? parseFloat(res.amount) : undefined} newBalance={res?.new_balance ? parseFloat(res.new_balance) : undefined} onClose={() => { setShow(false); navigation.goBack(); }} />
      </View>
    </>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.bg, padding: 20 },
  card: { backgroundColor: COLORS.card, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: COLORS.cardBorder },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  name: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  br: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,230,0,0.08)', borderRadius: 12, padding: 14, marginBottom: 20 },
  brLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bl: { color: COLORS.text2, fontSize: 14 }, bv: { color: COLORS.accent, fontSize: 20, fontWeight: '800' },
  l: { color: COLORS.text2, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  i: { backgroundColor: COLORS.bg2, borderWidth: 1, borderColor: COLORS.cardBorder, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18, color: COLORS.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  mx: { backgroundColor: COLORS.bg2, borderRadius: 10, padding: 10, marginTop: 10, borderWidth: 1, borderColor: COLORS.cardBorder },
  mt: { color: COLORS.text2, fontSize: 12, textAlign: 'center' },
  eRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  e: { color: COLORS.danger, fontSize: 13 },
  btn: { marginTop: 24, backgroundColor: COLORS.accent3, paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  bd: { opacity: 0.4 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bt: { color: COLORS.white, fontSize: 16, fontWeight: '800' },
});
