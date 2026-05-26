/**
 * Products — Поиск товаров (кассир).
 * Premium Mobile-first iOS-style дизайн.
 * Мощный, компактный, информативный.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Dimensions, FlatList, Keyboard,
  Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft, Package, Search, X, AlertTriangle, Filter,
  TrendingUp, TrendingDown, BarChart3, Boxes, Hash,
} from 'lucide-react-native';
import { COLORS } from '@/constants/theme';
import { productsAPI } from '@/api/client';


const { width: W } = Dimensions.get('window');

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

// ═══ Animated card component ═══
function ProductCard({ item, index, showCost }: { item: ProductItem; index: number; showCost: boolean }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    const delay = Math.min(index * 50, 300);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 300, delay,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0, duration: 300, delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const outOfStock = item.current_stock <= 0;
  const margin = (showCost && item.cost_price && item.cost_price > 0)
    ? Math.round(((item.price - item.cost_price) / item.cost_price) * 100)
    : null;

  const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });

  const stockColor = outOfStock ? COLORS.danger : item.is_low_stock ? COLORS.warn : COLORS.success;
  const stockBg = outOfStock
    ? 'rgba(239,68,68,0.12)'
    : item.is_low_stock ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.10)';
  const stockText = outOfStock ? 'Нет' : item.current_stock % 1 === 0
    ? item.current_stock.toFixed(0) : item.current_stock.toFixed(1);

  return (
    <Animated.View style={[
      s.card,
      outOfStock && s.cardDim,
      { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
    ]}>
      {/* Top: Name + Stock */}
      <View style={s.cardTop}>
        <View style={s.nameCol}>
          <Text style={[s.productName, outOfStock && { color: COLORS.text3 }]} numberOfLines={2}>
            {item.name}
          </Text>
          {item.category ? (
            <View style={s.catBadge}>
              <Text style={s.catText} numberOfLines={1}>{item.category}</Text>
            </View>
          ) : null}
        </View>

        <View style={[s.stockBadge, { backgroundColor: stockBg }]}>
          {item.is_low_stock && !outOfStock && (
            <AlertTriangle size={10} color={COLORS.warn} style={{ marginRight: 3 }} />
          )}
          <Text style={[s.stockValue, { color: stockColor }]}>{stockText}</Text>
          <Text style={s.stockUnit}>{item.unit}</Text>
        </View>
      </View>

      {/* Bottom: Price metrics */}
      <View style={s.metricsRow}>
        {/* Price */}
        <View style={s.metricItem}>
          <Text style={s.metricLabel}>Цена</Text>
          <Text style={s.priceValue}>{fmt(item.price)} <Text style={s.currency}>сом</Text></Text>
        </View>

        {/* Separator */}
        {showCost && item.cost_price !== null && <View style={s.metricDivider} />}

        {/* Cost */}
        {showCost && item.cost_price !== null && (
          <View style={s.metricItem}>
            <Text style={s.metricLabel}>Себест.</Text>
            <Text style={s.costValue}>{fmt(item.cost_price)} <Text style={s.currency}>сом</Text></Text>
          </View>
        )}

        {/* Separator */}
        {margin !== null && <View style={s.metricDivider} />}

        {/* Margin */}
        {margin !== null && (
          <View style={s.metricItem}>
            <Text style={s.metricLabel}>Наценка</Text>
            <View style={s.marginRow}>
              {margin >= 30 ? (
                <TrendingUp size={12} color={COLORS.success} style={{ marginRight: 3 }} />
              ) : margin < 15 ? (
                <TrendingDown size={12} color={COLORS.danger} style={{ marginRight: 3 }} />
              ) : null}
              <Text style={[
                s.marginValue,
                margin >= 30 && { color: COLORS.success },
                margin < 15 && { color: COLORS.danger },
              ]}>{margin}%</Text>
            </View>
          </View>
        )}

        {/* Barcode — only if no cost data */}
        {!showCost && item.barcode && (
          <>
            <View style={s.metricDivider} />
            <View style={s.metricItem}>
              <Text style={s.metricLabel}>Штрих-код</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Hash size={10} color={COLORS.text3} style={{ marginRight: 2 }} />
                <Text style={s.barcodeValue} numberOfLines={1}>{item.barcode}</Text>
              </View>
            </View>
          </>
        )}
      </View>
    </Animated.View>
  );
}

// ═══ Main screen ═══
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

  // Stats
  const [stats, setStats] = useState({ total: 0, inStock: 0, lowStock: 0, outOfStock: 0 });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 350);
    Animated.timing(headerFade, {
      toValue: 1, duration: 400, useNativeDriver: true,
    }).start();
  }, []);

  const doSearch = useCallback(async (text: string, cat: string | null) => {
    if (text.trim().length < 1) {
      setProducts([]);
      setSearched(false);
      setStats({ total: 0, inStock: 0, lowStock: 0, outOfStock: 0 });
      return;
    }
    setLoading(true);
    try {
      const res = await productsAPI.search(text.trim(), cat || undefined);
      const data = res.data;
      const prods: ProductItem[] = data.products || [];
      setProducts(prods);
      setCategories(data.categories || []);
      setShowCost(data.show_cost_price || false);
      setSearched(true);

      // Calculate stats
      const inStock = prods.filter(p => p.current_stock > 0 && !p.is_low_stock).length;
      const lowStock = prods.filter(p => p.is_low_stock && p.current_stock > 0).length;
      const outOfStock = prods.filter(p => p.current_stock <= 0).length;
      setStats({ total: prods.length, inStock, lowStock, outOfStock });
    } catch (err: any) {
      console.warn('Search error:', err?.response?.status, err?.message);
      setProducts([]);
      setSearched(true);
      setStats({ total: 0, inStock: 0, lowStock: 0, outOfStock: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(text, selectedCategory), 350);
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
    setStats({ total: 0, inStock: 0, lowStock: 0, outOfStock: 0 });
    inputRef.current?.focus();
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <Animated.View style={[s.header, { opacity: headerFade }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.6}
        >
          <ArrowLeft size={22} color={COLORS.text} />
        </TouchableOpacity>

        <View style={s.titleCol}>
          <Text style={s.headerTitle}>Товары</Text>
          <Text style={s.headerSub}>Поиск и остатки</Text>
        </View>

        <TouchableOpacity
          onPress={() => setShowFilters(!showFilters)}
          style={[s.filterBtn, showFilters && s.filterBtnActive]}
          activeOpacity={0.6}
        >
          <Filter size={17} color={showFilters ? COLORS.accent : COLORS.text2} />
          {selectedCategory && (
            <View style={s.filterDot} />
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* ── Search bar ── */}
      <View style={s.searchContainer}>
        <View style={s.searchBar}>
          <Search size={17} color={COLORS.text3} />
          <TextInput
            ref={inputRef}
            style={s.searchInput}
            placeholder="Название, штрих-код, артикул..."
            placeholderTextColor={COLORS.text3}
            value={query}
            onChangeText={handleQueryChange}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardAppearance="dark"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={clearSearch}
              style={s.clearBtn}
              activeOpacity={0.6}
            >
              <X size={16} color={COLORS.text3} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Mini stats bar ── */}
      {searched && products.length > 0 && (
        <View style={s.statsBar}>
          <View style={s.statChip}>
            <Boxes size={11} color={COLORS.accent} />
            <Text style={s.statText}>{stats.total} найдено</Text>
          </View>
          {stats.inStock > 0 && (
            <View style={s.statChip}>
              <View style={[s.statDot, { backgroundColor: COLORS.success }]} />
              <Text style={s.statText}>{stats.inStock} в наличии</Text>
            </View>
          )}
          {stats.lowStock > 0 && (
            <View style={s.statChip}>
              <View style={[s.statDot, { backgroundColor: COLORS.warn }]} />
              <Text style={s.statText}>{stats.lowStock} мало</Text>
            </View>
          )}
          {stats.outOfStock > 0 && (
            <View style={s.statChip}>
              <View style={[s.statDot, { backgroundColor: COLORS.danger }]} />
              <Text style={s.statText}>{stats.outOfStock} нет</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Category chips ── */}
      {showFilters && categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipScroll}
          style={s.chipWrap}
        >
          <TouchableOpacity
            style={[s.chip, !selectedCategory && s.chipActive]}
            onPress={() => handleCategorySelect(null)}
            activeOpacity={0.7}
          >
            <Text style={[s.chipText, !selectedCategory && s.chipTextActive]}>Все</Text>
          </TouchableOpacity>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[s.chip, selectedCategory === cat && s.chipActive]}
              onPress={() => handleCategorySelect(cat)}
              activeOpacity={0.7}
            >
              <Text
                style={[s.chipText, selectedCategory === cat && s.chipTextActive]}
                numberOfLines={1}
              >{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── Content ── */}
      {loading ? (
        <View style={s.emptyWrap}>
          <ActivityIndicator color={COLORS.accent} size="large" />
          <Text style={s.emptyText}>Поиск товаров...</Text>
        </View>
      ) : !searched ? (
        <View style={s.emptyWrap}>
          <View style={s.emptyIcon}>
            <Package size={36} color={COLORS.text3} />
          </View>
          <Text style={s.emptyTitle}>Поиск товаров</Text>
          <Text style={s.emptyText}>Введите название, штрих-код{'\n'}или артикул для поиска</Text>
        </View>
      ) : products.length === 0 ? (
        <View style={s.emptyWrap}>
          <View style={s.emptyIcon}>
            <Search size={36} color={COLORS.text3} />
          </View>
          <Text style={s.emptyTitle}>Ничего не найдено</Text>
          <Text style={s.emptyText}>По запросу «{query}» нет результатов</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={p => p.id}
          renderItem={({ item, index }) => (
            <ProductCard item={item} index={index} showCost={showCost} />
          )}
          contentContainerStyle={s.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={15}
          windowSize={10}
          removeClippedSubviews={Platform.OS !== 'web'}
        />
      )}
    </View>
  );
}

// ═══ Styles ═══
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.bg,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.card,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  titleCol: {
    flex: 1, marginLeft: 12,
  },
  headerTitle: {
    color: COLORS.text, fontSize: 20, fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSub: {
    color: COLORS.text3, fontSize: 11, marginTop: 1,
  },
  filterBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.card,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  filterBtnActive: {
    backgroundColor: 'rgba(255,230,0,0.08)',
    borderColor: 'rgba(255,230,0,0.25)',
  },
  filterDot: {
    position: 'absolute', top: 8, right: 8,
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: COLORS.accent,
  },

  // ── Search ──
  searchContainer: {
    paddingHorizontal: 16, marginBottom: 8,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14, paddingHorizontal: 14, height: 48,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    gap: 10,
    // Subtle glow
    ...Platform.select({
      ios: {
        shadowColor: COLORS.accent,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      default: {},
    }),
  },
  searchInput: {
    flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '500',
    height: 48, paddingVertical: 0,
  },
  clearBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
  },

  // ── Stats bar ──
  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 6,
    gap: 8,
    flexWrap: 'wrap',
  },
  statChip: {
    flexDirection: 'row', alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8,
  },
  statDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  statText: {
    color: COLORS.text3, fontSize: 11, fontWeight: '600',
  },

  // ── Chips ──
  chipWrap: { maxHeight: 44, marginBottom: 6 },
  chipScroll: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.cardBorder,
  },
  chipActive: {
    backgroundColor: 'rgba(255,230,0,0.10)',
    borderColor: COLORS.accent,
  },
  chipText: {
    color: COLORS.text2, fontSize: 12, fontWeight: '600',
  },
  chipTextActive: {
    color: COLORS.accent, fontWeight: '700',
  },

  // ── List ──
  listContent: {
    paddingHorizontal: 16, paddingBottom: 40,
  },

  // ── Card ──
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  cardDim: { opacity: 0.45 },

  // Card top row
  cardTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 10,
  },
  nameCol: { flex: 1, marginRight: 10 },
  productName: {
    color: COLORS.text, fontSize: 14, fontWeight: '700',
    lineHeight: 19, letterSpacing: -0.2,
  },
  catBadge: {
    alignSelf: 'flex-start', marginTop: 4,
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  catText: {
    color: COLORS.text3, fontSize: 10, fontWeight: '600',
  },

  // Stock badge
  stockBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, minWidth: 50,
    justifyContent: 'center',
  },
  stockValue: {
    fontSize: 16, fontWeight: '900', letterSpacing: -0.5,
  },
  stockUnit: {
    color: COLORS.text3, fontSize: 9, fontWeight: '600',
    marginLeft: 3, marginTop: 2,
  },

  // ── Metrics row ──
  metricsRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)',
    paddingTop: 10, gap: 0,
  },
  metricItem: {
    flex: 1,
  },
  metricDivider: {
    width: 1, height: 28,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 8,
  },
  metricLabel: {
    color: COLORS.text3, fontSize: 9, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 3,
  },
  priceValue: {
    color: COLORS.accent, fontSize: 15, fontWeight: '800',
    letterSpacing: -0.3,
  },
  costValue: {
    color: COLORS.text2, fontSize: 15, fontWeight: '700',
    letterSpacing: -0.3,
  },
  marginRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  marginValue: {
    color: COLORS.text2, fontSize: 15, fontWeight: '800',
  },
  currency: {
    fontSize: 10, fontWeight: '600', color: COLORS.text3,
  },
  barcodeValue: {
    color: COLORS.text3, fontSize: 11, fontWeight: '500',
    maxWidth: 100,
  },

  // ── Empty state ──
  emptyWrap: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingBottom: 80, paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  emptyTitle: {
    color: COLORS.text2, fontSize: 17, fontWeight: '700',
    marginBottom: 6, textAlign: 'center',
  },
  emptyText: {
    color: COLORS.text3, fontSize: 13,
    textAlign: 'center', lineHeight: 19,
  },
});
