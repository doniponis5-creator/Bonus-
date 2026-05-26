/**
 * Products — Поиск товаров (кассир).
 * Mobile-first iOS-style дизайн.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, FlatList, Keyboard,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft, Package, Search, X, AlertTriangle, Filter,
} from 'lucide-react-native';
import { COLORS } from '@/constants/theme';
import { productsAPI } from '@/api/client';

const { width: SCREEN_W } = Dimensions.get('window');

interface ProductItem {
  id: string;
  name: string;
  category: string | null;
  price: number;
  cost_price: number | null;
  current_stock: number;
  unit: string;
  barcode: string | null;
  is_low_stock: boolean;
}

export default function ProductsScreen() {
  const navigation = useNavigation<any>();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showCost, setShowCost] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const doSearch = useCallback(async (text: string, cat: string | null) => {
    if (text.trim().length < 1) {
      setProducts([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const res = await productsAPI.search(text.trim(), cat || undefined);
      const data = res.data;
      setProducts(data.products || []);
      setCategories(data.categories || []);
      setShowCost(data.show_cost_price || false);
      setSearched(true);
    } catch (err: any) {
      console.warn('Search error:', err?.response?.status, err?.message);
      setProducts([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(text, selectedCategory), 400);
  }, [doSearch, selectedCategory]);

  const handleCategorySelect = useCallback((cat: string | null) => {
    setSelectedCategory(cat);
    if (query.trim().length >= 1) doSearch(query, cat);
  }, [query, doSearch]);

  const clearSearch = () => {
    setQuery('');
    setProducts([]);
    setSearched(false);
    setSelectedCategory(null);
    inputRef.current?.focus();
  };

  const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });

  // ── Stock color ──
  const stockColor = (item: ProductItem) => {
    if (item.current_stock <= 0) return COLORS.danger;
    if (item.is_low_stock) return COLORS.warn;
    return COLORS.success;
  };

  const stockBg = (item: ProductItem) => {
    if (item.current_stock <= 0) return 'rgba(239,68,68,0.15)';
    if (item.is_low_stock) return 'rgba(245,158,11,0.15)';
    return 'rgba(34,197,94,0.12)';
  };

  // ── Render product ──
  const renderProduct = ({ item }: { item: ProductItem }) => {
    const outOfStock = item.current_stock <= 0;
    const margin = (showCost && item.cost_price && item.cost_price > 0)
      ? Math.round(((item.price - item.cost_price) / item.cost_price) * 100)
      : null;

    return (
      <View style={[s.card, outOfStock && s.cardDim]}>
        {/* Row 1: Name + Stock badge */}
        <View style={s.cardRow1}>
          <View style={s.nameWrap}>
            <Text style={[s.name, outOfStock && { color: COLORS.text3 }]} numberOfLines={2}>
              {item.name}
            </Text>
            {item.category ? (
              <Text style={s.cat} numberOfLines={1}>{item.category}</Text>
            ) : null}
          </View>

          <View style={[s.stockBadge, { backgroundColor: stockBg(item) }]}>
            {item.is_low_stock && !outOfStock ? (
              <AlertTriangle size={11} color={COLORS.warn} style={{ marginRight: 2 }} />
            ) : null}
            <Text style={[s.stockNum, { color: stockColor(item) }]}>
              {item.current_stock % 1 === 0 ? item.current_stock.toFixed(0) : item.current_stock.toFixed(1)}
            </Text>
            <Text style={s.stockUnit}>{item.unit}</Text>
          </View>
        </View>

        {/* Row 2: Prices */}
        <View style={s.priceRow}>
          <View style={s.priceBox}>
            <Text style={s.priceLabel}>Цена</Text>
            <Text style={s.priceVal}>{fmt(item.price)}</Text>
          </View>

          {showCost && item.cost_price !== null ? (
            <View style={s.priceBox}>
              <Text style={s.priceLabel}>Себест.</Text>
              <Text style={s.costVal}>{fmt(item.cost_price)}</Text>
            </View>
          ) : null}

          {margin !== null ? (
            <View style={s.priceBox}>
              <Text style={s.priceLabel}>Наценка</Text>
              <Text style={[
                s.marginVal,
                margin < 15 && { color: COLORS.danger },
                margin > 40 && { color: COLORS.success },
              ]}>{margin}%</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={s.container}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <ArrowLeft size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={s.title}>Товары</Text>
        <TouchableOpacity
          onPress={() => setShowFilters(!showFilters)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <View style={[s.filterIcon, showFilters && s.filterActive]}>
            <Filter size={18} color={showFilters ? COLORS.accent : COLORS.text2} />
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Search bar ── */}
      <View style={s.searchWrap}>
        <Search size={18} color={COLORS.text3} />
        <TextInput
          ref={inputRef}
          style={s.searchInput}
          placeholder="Название, штрих-код..."
          placeholderTextColor={COLORS.text3}
          value={query}
          onChangeText={handleQueryChange}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={clearSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={18} color={COLORS.text3} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Category chips ── */}
      {showFilters && categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipScroll}
          style={s.chipContainer}
        >
          <TouchableOpacity
            style={[s.chip, !selectedCategory && s.chipOn]}
            onPress={() => handleCategorySelect(null)}
          >
            <Text style={[s.chipTxt, !selectedCategory && s.chipTxtOn]}>Все</Text>
          </TouchableOpacity>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[s.chip, selectedCategory === cat && s.chipOn]}
              onPress={() => handleCategorySelect(cat)}
            >
              <Text style={[s.chipTxt, selectedCategory === cat && s.chipTxtOn]} numberOfLines={1}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {/* ── Content ── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      ) : !searched ? (
        <View style={s.center}>
          <Package size={44} color={COLORS.text3} />
          <Text style={s.emptyTitle}>Введите название товара</Text>
          <Text style={s.emptySub}>Поиск по названию или штрих-коду</Text>
        </View>
      ) : products.length === 0 ? (
        <View style={s.center}>
          <Search size={44} color={COLORS.text3} />
          <Text style={s.emptyTitle}>Не найдено</Text>
          <Text style={s.emptySub}>По запросу «{query}» ничего не найдено</Text>
        </View>
      ) : (
        <>
          <Text style={s.resultCount}>{products.length} товаров найдено</Text>
          <FlatList
            data={products}
            keyExtractor={p => p.id}
            renderItem={renderProduct}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </View>
  );
}

// ═══ Styles ═══
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: 16, paddingBottom: 10,
  },
  title: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  filterIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  filterActive: { backgroundColor: 'rgba(255,230,0,0.1)', borderColor: 'rgba(255,230,0,0.3)' },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 12,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 12, height: 44,
    borderWidth: 1, borderColor: COLORS.cardBorder, gap: 8,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 15, height: 44, paddingVertical: 0 },

  // Chips
  chipContainer: { maxHeight: 40, marginBottom: 6 },
  chipScroll: { paddingHorizontal: 16, gap: 6 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  chipOn: { backgroundColor: 'rgba(255,230,0,0.12)', borderColor: COLORS.accent },
  chipTxt: { color: COLORS.text2, fontSize: 12, fontWeight: '600' },
  chipTxtOn: { color: COLORS.accent },

  // Results
  resultCount: { color: COLORS.text3, fontSize: 11, paddingHorizontal: 20, marginBottom: 6 },

  // Card
  card: {
    backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  cardDim: { opacity: 0.5 },

  cardRow1: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  nameWrap: { flex: 1, marginRight: 10 },
  name: { color: COLORS.text, fontSize: 14, fontWeight: '700', lineHeight: 18 },
  cat: { color: COLORS.text3, fontSize: 11, marginTop: 2 },

  // Stock badge
  stockBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8,
  },
  stockNum: { fontSize: 15, fontWeight: '900' },
  stockUnit: { color: COLORS.text3, fontSize: 10, marginLeft: 2, marginTop: 1 },

  // Prices
  priceRow: {
    flexDirection: 'row', gap: 20,
    borderTopWidth: 1, borderTopColor: COLORS.cardBorder, paddingTop: 8,
  },
  priceBox: {},
  priceLabel: { color: COLORS.text3, fontSize: 10, marginBottom: 1 },
  priceVal: { color: COLORS.accent, fontSize: 14, fontWeight: '800' },
  costVal: { color: COLORS.text2, fontSize: 14, fontWeight: '700' },
  marginVal: { color: COLORS.text2, fontSize: 14, fontWeight: '800' },

  // Empty
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 60 },
  emptyTitle: { color: COLORS.text2, fontSize: 16, fontWeight: '700', marginTop: 14 },
  emptySub: { color: COLORS.text3, fontSize: 12, marginTop: 4 },
});
