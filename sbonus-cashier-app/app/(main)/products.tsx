/**
 * Products — Товар қидирув экрани (кассир учун).
 * Smart search: ном, штрих-код бўйича.
 * Кўрсатади: ном, остаток(шт), нарх, себестоимость(настройка).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Keyboard, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft, Package, Search, X, AlertTriangle,
  Filter,
} from 'lucide-react-native';
import { COLORS } from '@/constants/theme';
import { productsAPI } from '@/api/client';

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

  // Debounce timer
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-focus
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  // Search with debounce
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
      console.warn('Product search error:', err?.message);
      setProducts([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(text, selectedCategory);
    }, 350);
  }, [doSearch, selectedCategory]);

  const handleCategorySelect = useCallback((cat: string | null) => {
    setSelectedCategory(cat);
    if (query.trim().length >= 1) {
      doSearch(query, cat);
    }
  }, [query, doSearch]);

  const clearSearch = () => {
    setQuery('');
    setProducts([]);
    setSearched(false);
    setSelectedCategory(null);
    inputRef.current?.focus();
  };

  // ── Format helpers ──
  const fmtPrice = (n: number) =>
    n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });

  const fmtStock = (n: number, unit: string) => {
    if (n <= 0) return '0';
    return n % 1 === 0 ? n.toFixed(0) : n.toFixed(1);
  };

  // ── Render product card ──
  const renderProduct = ({ item }: { item: ProductItem }) => {
    const isOutOfStock = item.current_stock <= 0;
    const margin = (showCost && item.cost_price && item.cost_price > 0)
      ? Math.round(((item.price - item.cost_price) / item.cost_price) * 100)
      : null;

    return (
      <View style={[
        styles.productCard,
        isOutOfStock && styles.outOfStockCard,
        item.is_low_stock && !isOutOfStock && styles.lowStockCard,
      ]}>
        {/* Top row: name + stock badge */}
        <View style={styles.productTop}>
          <View style={styles.productNameWrap}>
            <Text style={[styles.productName, isOutOfStock && styles.outOfStockText]} numberOfLines={2}>
              {item.name}
            </Text>
            {item.category ? (
              <Text style={styles.productCategory}>{item.category}</Text>
            ) : null}
          </View>

          {/* Stock badge */}
          <View style={[
            styles.stockBadge,
            isOutOfStock
              ? styles.stockBadgeRed
              : item.is_low_stock
                ? styles.stockBadgeYellow
                : styles.stockBadgeGreen,
          ]}>
            {item.is_low_stock && !isOutOfStock ? (
              <AlertTriangle size={12} color={COLORS.warn} style={{ marginRight: 3 }} />
            ) : null}
            <Text style={[
              styles.stockNum,
              isOutOfStock
                ? styles.stockNumRed
                : item.is_low_stock
                  ? styles.stockNumYellow
                  : styles.stockNumGreen,
            ]}>
              {fmtStock(item.current_stock, item.unit)}
            </Text>
            <Text style={styles.stockUnit}>{item.unit}</Text>
          </View>
        </View>

        {/* Bottom row: prices */}
        <View style={styles.priceRow}>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>Нарх</Text>
            <Text style={styles.priceValue}>{fmtPrice(item.price)} сом</Text>
          </View>

          {showCost && item.cost_price !== null ? (
            <View style={styles.priceItem}>
              <Text style={styles.priceLabel}>Таннарх</Text>
              <Text style={styles.costValue}>{fmtPrice(item.cost_price)} сом</Text>
            </View>
          ) : null}

          {margin !== null ? (
            <View style={styles.priceItem}>
              <Text style={styles.priceLabel}>Маржа</Text>
              <Text style={[
                styles.marginValue,
                margin < 15 ? { color: COLORS.danger } : margin > 40 ? { color: COLORS.success } : {},
              ]}>
                {margin}%
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Товарлар</Text>
        <TouchableOpacity
          onPress={() => setShowFilters(!showFilters)}
          style={[styles.filterBtn, showFilters && styles.filterBtnActive]}
        >
          <Filter size={18} color={showFilters ? COLORS.accent : COLORS.text2} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Search size={18} color={COLORS.text3} style={styles.searchIcon} />
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder="Ном, штрих-код..."
          placeholderTextColor={COLORS.text3}
          value={query}
          onChangeText={handleQueryChange}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={clearSearch} style={styles.clearBtn}>
            <X size={18} color={COLORS.text3} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Category filter chips */}
      {showFilters && categories.length > 0 ? (
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, !selectedCategory && styles.chipActive]}
            onPress={() => handleCategorySelect(null)}
          >
            <Text style={[styles.chipText, !selectedCategory && styles.chipTextActive]}>
              Барчаси
            </Text>
          </TouchableOpacity>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={categories}
            keyExtractor={(c) => c}
            renderItem={({ item: cat }) => (
              <TouchableOpacity
                style={[styles.chip, selectedCategory === cat && styles.chipActive]}
                onPress={() => handleCategorySelect(cat)}
              >
                <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextActive]}
                      numberOfLines={1}>
                  {cat}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}

      {/* Results */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      ) : !searched ? (
        <View style={styles.centerBox}>
          <Package size={48} color={COLORS.text3} />
          <Text style={styles.emptyText}>Товар номини ёзинг</Text>
          <Text style={styles.emptySubtext}>Ном ёки штрих-код бўйича қидиринг</Text>
        </View>
      ) : products.length === 0 ? (
        <View style={styles.centerBox}>
          <Search size={48} color={COLORS.text3} />
          <Text style={styles.emptyText}>Топилмади</Text>
          <Text style={styles.emptySubtext}>«{query}» бўйича товар йўқ</Text>
        </View>
      ) : (
        <>
          <Text style={styles.resultCount}>
            {products.length} та товар топилди
          </Text>
          <FlatList
            data={products}
            keyExtractor={(p) => p.id}
            renderItem={renderProduct}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12,
  },
  backBtn: { padding: 8 },
  headerTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  filterBtn: {
    padding: 8, borderRadius: 10,
    backgroundColor: COLORS.card,
  },
  filterBtnActive: {
    backgroundColor: 'rgba(255,230,0,0.12)',
  },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 14,
    marginHorizontal: 20, marginBottom: 8,
    paddingHorizontal: 14, height: 50,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  searchIcon: { marginRight: 10 },
  searchInput: {
    flex: 1, color: COLORS.text, fontSize: 16,
    height: 50, paddingVertical: 0,
  },
  clearBtn: { padding: 8 },

  // Category chips
  chipRow: {
    flexDirection: 'row', paddingHorizontal: 20,
    marginBottom: 8, gap: 6,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    marginRight: 6,
  },
  chipActive: {
    backgroundColor: 'rgba(255,230,0,0.12)',
    borderColor: COLORS.accent,
  },
  chipText: { color: COLORS.text2, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: COLORS.accent },

  // Results count
  resultCount: {
    color: COLORS.text3, fontSize: 12, paddingHorizontal: 24, marginBottom: 6,
  },

  // Product list
  list: { paddingHorizontal: 20, paddingBottom: 40 },

  // Product card
  productCard: {
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  outOfStockCard: {
    borderColor: 'rgba(239,68,68,0.3)',
    opacity: 0.6,
  },
  lowStockCard: {
    borderColor: 'rgba(245,158,11,0.3)',
  },

  productTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 12,
  },
  productNameWrap: { flex: 1, marginRight: 12 },
  productName: { color: COLORS.text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  outOfStockText: { color: COLORS.text3 },
  productCategory: { color: COLORS.text3, fontSize: 11, marginTop: 3 },

  // Stock badge
  stockBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, minWidth: 60, justifyContent: 'center',
  },
  stockBadgeGreen: { backgroundColor: 'rgba(34,197,94,0.12)' },
  stockBadgeYellow: { backgroundColor: 'rgba(245,158,11,0.12)' },
  stockBadgeRed: { backgroundColor: 'rgba(239,68,68,0.12)' },

  stockNum: { fontSize: 16, fontWeight: '900' },
  stockNumGreen: { color: COLORS.success },
  stockNumYellow: { color: COLORS.warn },
  stockNumRed: { color: COLORS.danger },
  stockUnit: { color: COLORS.text3, fontSize: 11, marginLeft: 3 },

  // Prices row
  priceRow: {
    flexDirection: 'row', gap: 16,
    borderTopWidth: 1, borderTopColor: COLORS.cardBorder,
    paddingTop: 10,
  },
  priceItem: {},
  priceLabel: { color: COLORS.text3, fontSize: 11, marginBottom: 2 },
  priceValue: { color: COLORS.accent, fontSize: 15, fontWeight: '800' },
  costValue: { color: COLORS.text2, fontSize: 15, fontWeight: '700' },
  marginValue: { color: COLORS.text2, fontSize: 15, fontWeight: '800' },

  // Empty states
  centerBox: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80,
  },
  emptyText: { color: COLORS.text2, fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptySubtext: { color: COLORS.text3, fontSize: 13, marginTop: 6 },
});
