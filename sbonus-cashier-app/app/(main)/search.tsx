/**
 * Search — Умный поиск клиента по ФИО, телефону или QR коду.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Camera, Search, User, Phone, X } from 'lucide-react-native';
import { customersAPI } from '@/api/client';
import QRScanner from '@/components/QRScanner';
import { COLORS } from '@/constants/theme';

interface CustomerResult {
  id: string;
  full_name: string;
  phone: string;
  tier_name?: string;
  qr_code?: string;
}

export default function SearchScreen() {
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Автопоиск с debounce 400ms
  const doSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const { data } = await customersAPI.search(trimmed);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  const selectCustomer = (customer: CustomerResult) => {
    navigation.navigate('Customer', { id: customer.id });
  };

  const handleQRScan = async (qrCode: string) => {
    setShowQR(false);
    setLoading(true);
    try {
      const { data } = await customersAPI.byQR(qrCode);
      navigation.navigate('Customer', { id: data.id });
    } catch {
      Alert.alert('Ошибка', 'QR код не распознан');
    } finally {
      setLoading(false);
    }
  };

  if (showQR) {
    return <QRScanner onScan={handleQRScan} onClose={() => setShowQR(false)} />;
  }

  const renderItem = ({ item }: { item: CustomerResult }) => (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={() => selectCustomer(item)}
      activeOpacity={0.7}
    >
      <View style={styles.resultAvatar}>
        <User size={20} color={COLORS.accent} />
      </View>
      <View style={styles.resultInfo}>
        <Text style={styles.resultName}>{item.full_name}</Text>
        <Text style={styles.resultPhone}>{item.phone}</Text>
      </View>
      {item.tier_name && (
        <View style={styles.tierBadge}>
          <Text style={styles.tierText}>{item.tier_name}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Поле поиска */}
      <View style={styles.searchCard}>
        <View style={styles.searchInputRow}>
          <Search size={20} color={COLORS.text3} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="ФИО, телефон или QR код..."
            placeholderTextColor={COLORS.text3}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={18} color={COLORS.text3} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Результаты */}
      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={styles.loadingText}>Поиск...</Text>
        </View>
      )}

      {!loading && searched && results.length === 0 && (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Клиент не найден</Text>
          <TouchableOpacity
            style={styles.registerLink}
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.7}
          >
            <Text style={styles.registerLinkText}>Зарегистрировать нового клиента</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={styles.resultsList}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* QR сканер — всегда внизу */}
      {!searched && !loading && (
        <>
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>или</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity style={styles.qrBtn} onPress={() => setShowQR(true)} activeOpacity={0.7}>
            <Camera size={36} color={COLORS.accent} style={{ marginBottom: 12 }} />
            <Text style={styles.qrTitle}>Сканировать QR код</Text>
            <Text style={styles.qrDesc}>Наведите камеру на QR карточки клиента</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20 },

  searchCard: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 6,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  searchInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  searchInput: {
    flex: 1, color: COLORS.text, fontSize: 17, fontWeight: '600',
  },

  loadingWrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 24,
  },
  loadingText: { color: COLORS.text3, fontSize: 14 },

  emptyWrap: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: COLORS.text3, fontSize: 15, marginBottom: 12 },
  registerLink: {
    backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24,
    borderWidth: 1, borderColor: COLORS.accent,
  },
  registerLinkText: { color: COLORS.accent, fontSize: 14, fontWeight: '700' },

  resultsList: { marginTop: 12 },
  resultItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  resultAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,230,0,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  resultInfo: { flex: 1 },
  resultName: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 2 },
  resultPhone: { color: COLORS.text2, fontSize: 14 },
  tierBadge: {
    backgroundColor: 'rgba(255,230,0,0.15)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8,
  },
  tierText: { color: COLORS.accent, fontSize: 12, fontWeight: '700' },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.cardBorder },
  dividerText: { color: COLORS.text3, fontSize: 13, marginHorizontal: 16 },

  qrBtn: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 28,
    borderWidth: 1, borderColor: 'rgba(255,230,0,0.2)', alignItems: 'center',
  },
  qrTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700', marginBottom: 6 },
  qrDesc: { color: COLORS.text2, fontSize: 13, textAlign: 'center' },
});
