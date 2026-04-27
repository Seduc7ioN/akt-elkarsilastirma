import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import {
  Bell,
  BellRing,
  BarChart3,
  CalendarClock,
  CalendarDays,
  Check,
  ClipboardList,
  CreditCard,
  Edit3,
  Flame,
  Lightbulb,
  ListFilter,
  Plus,
  RefreshCw,
  ScanText,
  Search,
  Sparkles,
  Tags,
  TrendingDown,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type Cadence = 'monthly' | 'yearly';
type Tab = 'overview' | 'detect' | 'add';
type Filter = 'all' | 'inactive' | 'upcoming' | 'reminders';

type Subscription = {
  id: string;
  name: string;
  category: string;
  amount: number;
  cardLast4: string;
  billingDay: number;
  cadence: Cadence;
  usedRecently: boolean;
  reminderEnabled: boolean;
  notificationId?: string;
  accent: string;
};

type Draft = {
  name: string;
  category: string;
  amount: string;
  cardLast4: string;
  billingDay: string;
  cadence: Cadence;
  usedRecently: boolean;
};

type CompetitorGap = {
  product: string;
  seenFeature: string;
  ourMove: string;
};

const STORAGE_KEY = 'abonelik-detoksu:v1:subscriptions';

const accents = ['#0f766e', '#2563eb', '#d97706', '#be123c', '#7c3aed', '#15803d'];

const seedSubscriptions: Subscription[] = [
  {
    id: 'netflix',
    name: 'Netflix',
    category: 'Eglence',
    amount: 229.99,
    cardLast4: '4821',
    billingDay: 5,
    cadence: 'monthly',
    usedRecently: true,
    reminderEnabled: false,
    accent: '#be123c',
  },
  {
    id: 'spotify',
    name: 'Spotify',
    category: 'Muzik',
    amount: 59.99,
    cardLast4: '4821',
    billingDay: 14,
    cadence: 'monthly',
    usedRecently: true,
    reminderEnabled: false,
    accent: '#15803d',
  },
  {
    id: 'icloud',
    name: 'iCloud+',
    category: 'Bulut',
    amount: 24.99,
    cardLast4: '1040',
    billingDay: 20,
    cadence: 'monthly',
    usedRecently: true,
    reminderEnabled: false,
    accent: '#2563eb',
  },
  {
    id: 'gym',
    name: 'Spor Salonu',
    category: 'Saglik',
    amount: 850,
    cardLast4: '7702',
    billingDay: 1,
    cadence: 'monthly',
    usedRecently: false,
    reminderEnabled: false,
    accent: '#d97706',
  },
];

const emptyDraft: Draft = {
  name: '',
  category: 'Dijital',
  amount: '',
  cardLast4: '',
  billingDay: '1',
  cadence: 'monthly',
  usedRecently: true,
};

const merchantHints = [
  'Netflix',
  'Spotify',
  'iCloud',
  'Apple',
  'YouTube',
  'Google',
  'Exxen',
  'BluTV',
  'Amazon Prime',
  'Prime Video',
  'Disney+',
  'TOD',
  'Gain',
  'Adobe',
  'Canva',
  'Microsoft',
  'Dropbox',
  'Digiturk',
  'Turkcell',
  'Vodafone',
  'Superonline',
  'Spor Salonu',
  'Gym',
];

const filterLabels: Record<Filter, string> = {
  all: 'Tumu',
  inactive: 'Iptal adayi',
  upcoming: '7 gun',
  reminders: 'Hatirlatmali',
};

const competitorGaps: CompetitorGap[] = [
  {
    product: 'Rocket Money',
    seenFeature: 'Yaklasan odemeleri takvim gibi gostermek',
    ourMove: 'Yaklasan odeme paneli',
  },
  {
    product: 'Tilla / Bobby',
    seenFeature: 'Bildirim, siralama ve basit abonelik duzenleme',
    ourMove: 'Kart ustunden duzenleme ve filtre',
  },
  {
    product: 'Subby / ReSubs',
    seenFeature: 'Kategori analitigi ve iptal rehberi',
    ourMove: 'Kategori kirilimi ve detoks aksiyonlari',
  },
  {
    product: 'TrackMySubs',
    seenFeature: 'Kart/etiket organizasyonu ve rapor hissi',
    ourMove: 'Kart, kategori ve yillik projeksiyon',
  },
];

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeAmount(value: string) {
  return Number(value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
}

function formatTry(value: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function monthlyAmount(subscription: Subscription) {
  return subscription.cadence === 'yearly' ? subscription.amount / 12 : subscription.amount;
}

function getNextPaymentDate(day: number) {
  const now = new Date();
  const safeDay = Math.max(1, Math.min(28, day));
  let next = new Date(now.getFullYear(), now.getMonth(), safeDay);

  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    next = new Date(now.getFullYear(), now.getMonth() + 1, safeDay);
  }

  return next;
}

function daysUntil(day: number) {
  const today = new Date();
  const next = getNextPaymentDate(day);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((next.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDayMonth(day: number) {
  const date = getNextPaymentDate(day);
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function subscriptionToDraft(subscription: Subscription): Draft {
  return {
    name: subscription.name,
    category: subscription.category,
    amount: subscription.amount.toString(),
    cardLast4: subscription.cardLast4,
    billingDay: subscription.billingDay.toString(),
    cadence: subscription.cadence,
    usedRecently: subscription.usedRecently,
  };
}

function parseTransaction(text: string): Partial<Draft> {
  const amountMatch = text.match(/(\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?)\s*(?:TL|TRY|₺)/i);
  const merchant = merchantHints.find((hint) => text.toLocaleLowerCase('tr-TR').includes(hint.toLocaleLowerCase('tr-TR')));
  const cardMatch = text.match(/(?:sonu|kart|card|no)[^\d]{0,12}(\d{4})/i) ?? text.match(/\*{2,}\s?(\d{4})/);
  const dayMatch = text.match(/\b([0-2]?\d|3[01])[./-]([01]?\d)[./-](20\d{2})\b/);

  return {
    name: merchant ?? '',
    category: merchant?.toLocaleLowerCase('tr-TR').includes('spor') ? 'Saglik' : 'Dijital',
    amount: amountMatch ? normalizeAmount(amountMatch[1]).toString() : '',
    cardLast4: cardMatch?.[1] ?? '',
    billingDay: dayMatch?.[1] ?? new Date().getDate().toString(),
    cadence: 'monthly',
    usedRecently: true,
  };
}

function buildSubscription(draft: Draft, existingCount: number): Subscription | null {
  const amount = normalizeAmount(draft.amount);
  const billingDay = Number.parseInt(draft.billingDay, 10);

  if (!draft.name.trim() || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(billingDay)) {
    return null;
  }

  return {
    id: uid(),
    name: draft.name.trim(),
    category: draft.category.trim() || 'Dijital',
    amount,
    cardLast4: draft.cardLast4.trim().slice(-4),
    billingDay: Math.max(1, Math.min(28, billingDay)),
    cadence: draft.cadence,
    usedRecently: draft.usedRecently,
    reminderEnabled: false,
    accent: accents[existingCount % accents.length],
  };
}

async function requestNotificationAccess() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function scheduleCancelReminder(subscription: Subscription) {
  const granted = await requestNotificationAccess();

  if (!granted) {
    Alert.alert('Bildirim izni kapali', 'Hatirlatma kurmak icin bildirim izni vermen gerekiyor.');
    return undefined;
  }

  const next = getNextPaymentDate(subscription.billingDay);
  next.setDate(Math.max(1, next.getDate() - 3));
  next.setHours(10, 0, 0, 0);

  if (next.getTime() < Date.now()) {
    next.setMonth(next.getMonth() + 1);
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: `${subscription.name} kontrol zamani`,
      body: `${formatTry(subscription.amount)} odemeden once bu aboneligi hala kullaniyor musun?`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: next,
    },
  });
}

export default function App() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(seedSubscriptions);
  const [tab, setTab] = useState<Tab>('overview');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [pastedText, setPastedText] = useState('');
  const [detectedDraft, setDetectedDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Subscription[];
          setSubscriptions(
            parsed.map((subscription) =>
              subscription.reminderEnabled && !subscription.notificationId
                ? { ...subscription, reminderEnabled: false }
                : subscription,
            ),
          );
        }
      } catch {
        Alert.alert('Kayit okunamadi', 'Yerel abonelik listesi acilamadi.');
      } finally {
        setHasLoaded(true);
      }
    }

    load();
  }, []);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions)).catch(() => {
      Alert.alert('Kayit hatasi', 'Abonelik listesi cihaza yazilamadi.');
    });
  }, [hasLoaded, subscriptions]);

  const totalMonthly = useMemo(
    () => subscriptions.reduce((sum, subscription) => sum + monthlyAmount(subscription), 0),
    [subscriptions],
  );
  const annualProjection = totalMonthly * 12;
  const inactiveTotal = useMemo(
    () =>
      subscriptions
        .filter((subscription) => !subscription.usedRecently)
        .reduce((sum, subscription) => sum + monthlyAmount(subscription), 0),
    [subscriptions],
  );
  const sortedSubscriptions = useMemo(
    () => [...subscriptions].sort((a, b) => daysUntil(a.billingDay) - daysUntil(b.billingDay)),
    [subscriptions],
  );
  const nextSubscription = sortedSubscriptions[0];
  const upcomingSubscriptions = sortedSubscriptions.slice(0, 4);
  const filteredSubscriptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR');

    return sortedSubscriptions.filter((subscription) => {
      const matchesQuery =
        !normalizedQuery ||
        subscription.name.toLocaleLowerCase('tr-TR').includes(normalizedQuery) ||
        subscription.category.toLocaleLowerCase('tr-TR').includes(normalizedQuery) ||
        subscription.cardLast4.includes(normalizedQuery);

      const matchesFilter =
        filter === 'all' ||
        (filter === 'inactive' && !subscription.usedRecently) ||
        (filter === 'upcoming' && daysUntil(subscription.billingDay) <= 7) ||
        (filter === 'reminders' && subscription.reminderEnabled);

      return matchesQuery && matchesFilter;
    });
  }, [filter, query, sortedSubscriptions]);
  const cardTotals = useMemo(() => {
    const totals = subscriptions.reduce<Record<string, number>>((map, subscription) => {
      const key = subscription.cardLast4 || 'Kart yok';
      map[key] = (map[key] ?? 0) + monthlyAmount(subscription);
      return map;
    }, {});

    return Object.entries(totals)
      .map(([card, amount]) => ({ card, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [subscriptions]);
  const categoryTotals = useMemo(() => {
    const totals = subscriptions.reduce<Record<string, number>>((map, subscription) => {
      const key = subscription.category || 'Diger';
      map[key] = (map[key] ?? 0) + monthlyAmount(subscription);
      return map;
    }, {});

    return Object.entries(totals)
      .map(([category, amount], index) => ({
        category,
        amount,
        color: accents[index % accents.length],
        percent: totalMonthly > 0 ? amount / totalMonthly : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [subscriptions, totalMonthly]);
  const inactiveSubscriptions = subscriptions.filter((subscription) => !subscription.usedRecently);

  function addSubscription(sourceDraft: Draft) {
    const subscription = buildSubscription(sourceDraft, subscriptions.length);

    if (!subscription) {
      Alert.alert('Eksik bilgi', 'Ad, tutar ve odeme gunu alanlarini kontrol et.');
      return;
    }

    setSubscriptions((current) => [subscription, ...current]);
    setDraft(emptyDraft);
    setDetectedDraft(null);
    setPastedText('');
    setTab('overview');
  }

  function startEditing(subscription: Subscription) {
    setEditingId(subscription.id);
    setEditDraft(subscriptionToDraft(subscription));
  }

  function cancelEditing() {
    setEditingId(null);
    setEditDraft(emptyDraft);
  }

  async function saveEditedSubscription(subscription: Subscription) {
    const updated = buildSubscription(editDraft, subscriptions.length);

    if (!updated) {
      Alert.alert('Eksik bilgi', 'Ad, tutar ve odeme gunu alanlarini kontrol et.');
      return;
    }

    if (subscription.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(subscription.notificationId);
    }

    setSubscriptions((current) =>
      current.map((item) =>
        item.id === subscription.id
          ? {
              ...item,
              name: updated.name,
              category: updated.category,
              amount: updated.amount,
              cardLast4: updated.cardLast4,
              billingDay: updated.billingDay,
              cadence: updated.cadence,
              usedRecently: updated.usedRecently,
              reminderEnabled: false,
              notificationId: undefined,
            }
          : item,
      ),
    );
    cancelEditing();
  }

  async function toggleReminder(subscription: Subscription) {
    if (subscription.reminderEnabled && subscription.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(subscription.notificationId);
      setSubscriptions((current) =>
        current.map((item) =>
          item.id === subscription.id
            ? { ...item, reminderEnabled: false, notificationId: undefined }
            : item,
        ),
      );
      return;
    }

    const notificationId = await scheduleCancelReminder(subscription);
    if (!notificationId) {
      return;
    }

    setSubscriptions((current) =>
      current.map((item) =>
        item.id === subscription.id
          ? { ...item, reminderEnabled: true, notificationId }
          : item,
      ),
    );
  }

  function toggleUsage(subscription: Subscription) {
    setSubscriptions((current) =>
      current.map((item) =>
        item.id === subscription.id ? { ...item, usedRecently: !item.usedRecently } : item,
      ),
    );
  }

  function deleteSubscription(subscription: Subscription) {
    Alert.alert('Abonelik silinsin mi?', subscription.name, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          if (subscription.notificationId) {
            await Notifications.cancelScheduledNotificationAsync(subscription.notificationId);
          }

          setSubscriptions((current) => current.filter((item) => item.id !== subscription.id));
        },
      },
    ]);
  }

  function detectFromText() {
    if (!pastedText.trim()) {
      Alert.alert('Metin yok', 'Banka SMS veya e-posta metnini alana yapistir.');
      return;
    }

    setDetectedDraft({ ...emptyDraft, ...parseTransaction(pastedText) });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.appShell}>
          <View style={styles.header}>
            <View style={styles.logoMark}>
              <WalletCards color="#0f172a" size={24} strokeWidth={2.5} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.appName}>Abonelik Detoksu</Text>
              <Text style={styles.appMeta}>{subscriptions.length} aktif odeme</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Yeni abonelik ekle"
              onPress={() => setTab('add')}
              style={styles.iconButton}
            >
              <Plus color="#f8fafc" size={20} strokeWidth={2.4} />
            </Pressable>
          </View>

          <View style={styles.segmented}>
            <TabButton
              active={tab === 'overview'}
              icon={<ClipboardList color={tab === 'overview' ? '#f8fafc' : '#334155'} size={17} />}
              label="Liste"
              onPress={() => setTab('overview')}
            />
            <TabButton
              active={tab === 'detect'}
              icon={<ScanText color={tab === 'detect' ? '#f8fafc' : '#334155'} size={17} />}
              label="Tara"
              onPress={() => setTab('detect')}
            />
            <TabButton
              active={tab === 'add'}
              icon={<Plus color={tab === 'add' ? '#f8fafc' : '#334155'} size={17} />}
              label="Ekle"
              onPress={() => setTab('add')}
            />
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {tab === 'overview' && (
              <>
                <View style={styles.heroBand}>
                  <View>
                    <Text style={styles.heroLabel}>Bu ay odenecek</Text>
                    <Text adjustsFontSizeToFit numberOfLines={1} style={styles.heroAmount}>
                      {formatTry(totalMonthly)}
                    </Text>
                  </View>
                  <View style={styles.heroIcon}>
                    <Sparkles color="#f8fafc" size={24} />
                  </View>
                </View>

                <View style={styles.metricsGrid}>
                  <Metric
                    icon={<BarChart3 color="#2563eb" size={18} />}
                    label="Yillik iz"
                    value={formatTry(annualProjection)}
                  />
                  <Metric
                    icon={<TrendingDown color="#be123c" size={18} />}
                    label="Detoks adayi"
                    value={formatTry(inactiveTotal)}
                  />
                </View>

                <View style={styles.breakdownPanel}>
                  <View style={styles.sectionTitleRowCompact}>
                    <View>
                      <Text style={styles.breakdownTitle}>Yaklasan odemeler</Text>
                      <Text style={styles.panelFinePrint}>Siradaki 4 odeme</Text>
                    </View>
                    <CalendarDays color="#475569" size={18} />
                  </View>
                  {upcomingSubscriptions.map((subscription) => (
                    <View key={subscription.id} style={styles.timelineRow}>
                      <View style={styles.timelineDate}>
                        <Text style={styles.timelineDateText}>{formatDayMonth(subscription.billingDay)}</Text>
                      </View>
                      <View style={styles.timelineService}>
                        <Text numberOfLines={1} style={styles.timelineName}>
                          {subscription.name}
                        </Text>
                        <Text style={styles.timelineMeta}>
                          {daysUntil(subscription.billingDay) === 0
                            ? 'Bugun'
                            : `${daysUntil(subscription.billingDay)} gun sonra`}
                        </Text>
                      </View>
                      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.timelineAmount}>
                        {formatTry(subscription.amount)}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.breakdownPanel}>
                  <View style={styles.sectionTitleRowCompact}>
                    <Text style={styles.breakdownTitle}>Kartlara gore</Text>
                    <CreditCard color="#475569" size={18} />
                  </View>
                  {cardTotals.map((item) => (
                    <View key={item.card} style={styles.cardTotalRow}>
                      <View style={styles.cardTotalLeft}>
                        <View style={styles.cardTotalIcon}>
                          <CreditCard color="#0f172a" size={16} />
                        </View>
                        <Text style={styles.cardTotalLabel}>
                          {item.card === 'Kart yok' ? item.card : `**** ${item.card}`}
                        </Text>
                      </View>
                      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.cardTotalAmount}>
                        {formatTry(item.amount)}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.breakdownPanel}>
                  <View style={styles.sectionTitleRowCompact}>
                    <Text style={styles.breakdownTitle}>Kategori kirilimi</Text>
                    <Tags color="#475569" size={18} />
                  </View>
                  {categoryTotals.map((item) => (
                    <View key={item.category} style={styles.categoryRow}>
                      <View style={styles.categoryHeader}>
                        <Text numberOfLines={1} style={styles.categoryName}>
                          {item.category}
                        </Text>
                        <Text style={styles.categoryAmount}>{formatTry(item.amount)}</Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              backgroundColor: item.color,
                              width: `${Math.max(8, Math.round(item.percent * 100))}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  ))}
                </View>

                {inactiveSubscriptions.length > 0 && (
                  <View style={styles.detoxPanel}>
                    <View style={styles.sectionTitleRowCompact}>
                      <View>
                        <Text style={styles.detoxTitle}>Detoks aksiyonlari</Text>
                        <Text style={styles.detoxSubtitle}>
                          {formatTry(inactiveTotal)} / ay potansiyel tasarruf
                        </Text>
                      </View>
                      <Lightbulb color="#7c2d12" size={18} />
                    </View>
                    {inactiveSubscriptions.map((subscription) => (
                      <View key={subscription.id} style={styles.actionRow}>
                        <View style={styles.actionTextBlock}>
                          <Text style={styles.actionTitle}>{subscription.name}</Text>
                          <Text style={styles.actionText}>
                            Odeme gelmeden once hizmet ayarlari, App Store/Google Play veya banka talimati
                            uzerinden iptal durumunu kontrol et.
                          </Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${subscription.name} icin hatirlatma kur`}
                          onPress={() => toggleReminder(subscription)}
                          style={styles.actionButton}
                        >
                          <Bell color="#7c2d12" size={17} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.scanPanel}>
                  <View style={styles.sectionTitleRowCompact}>
                    <View>
                      <Text style={styles.breakdownTitle}>Piyasa taramasindan eklenenler</Text>
                      <Text style={styles.panelFinePrint}>Rakiplerde gorulen pratikler</Text>
                    </View>
                    <ListFilter color="#475569" size={18} />
                  </View>
                  {competitorGaps.map((gap) => (
                    <View key={gap.product} style={styles.gapRow}>
                      <Text style={styles.gapProduct}>{gap.product}</Text>
                      <Text style={styles.gapText}>{gap.ourMove}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>Abonelikler</Text>
                  <Text style={styles.sectionHint}>
                    {filteredSubscriptions.length} / {subscriptions.length}
                  </Text>
                </View>

                <View style={styles.searchWrap}>
                  <Search color="#64748b" size={18} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Servis, kategori veya kart ara"
                    placeholderTextColor="#94a3b8"
                    style={styles.searchInput}
                  />
                </View>

                <View style={styles.filterRow}>
                  {(Object.keys(filterLabels) as Filter[]).map((item) => (
                    <Pressable
                      key={item}
                      accessibilityRole="button"
                      accessibilityState={{ selected: filter === item }}
                      onPress={() => setFilter(item)}
                      style={[styles.filterChip, filter === item && styles.filterChipActive]}
                    >
                      <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>
                        {filterLabels[item]}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {filteredSubscriptions.length === 0 && (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Sonuc yok</Text>
                    <Text style={styles.emptyText}>Arama veya filtreyi degistirerek tekrar dene.</Text>
                  </View>
                )}

                {filteredSubscriptions.map((subscription) => (
                  <SubscriptionCard
                    key={subscription.id}
                    subscription={subscription}
                    isEditing={editingId === subscription.id}
                    editDraft={editDraft}
                    setEditDraft={setEditDraft}
                    onCancelEdit={cancelEditing}
                    onDelete={() => deleteSubscription(subscription)}
                    onEdit={() => startEditing(subscription)}
                    onSaveEdit={() => saveEditedSubscription(subscription)}
                    onToggleReminder={() => toggleReminder(subscription)}
                    onToggleUsage={() => toggleUsage(subscription)}
                  />
                ))}
              </>
            )}

            {tab === 'detect' && (
              <View style={styles.panel}>
                <View style={styles.panelHeader}>
                  <View style={styles.panelIcon}>
                    <ScanText color="#0f172a" size={22} />
                  </View>
                  <View style={styles.panelTitleBlock}>
                    <Text style={styles.panelTitle}>Metinden yakala</Text>
                    <Text style={styles.panelSubtitle}>SMS veya e-posta metni</Text>
                  </View>
                </View>

                <TextInput
                  multiline
                  value={pastedText}
                  onChangeText={setPastedText}
                  placeholder="Ornek: 4821 ile biten kartinizdan Netflix icin 229,99 TL harcama yapildi."
                  placeholderTextColor="#94a3b8"
                  style={[styles.input, styles.textArea]}
                  textAlignVertical="top"
                />

                <PrimaryButton icon={<ScanText color="#f8fafc" size={18} />} label="Metni cozumle" onPress={detectFromText} />

                {detectedDraft && (
                  <View style={styles.detectedBox}>
                    <Text style={styles.detectedTitle}>Bulunan abonelik</Text>
                    <DraftEditor draft={detectedDraft} setDraft={setDetectedDraft} />
                    <PrimaryButton
                      icon={<Check color="#f8fafc" size={18} />}
                      label="Listeye ekle"
                      onPress={() => addSubscription(detectedDraft)}
                    />
                  </View>
                )}
              </View>
            )}

            {tab === 'add' && (
              <View style={styles.panel}>
                <View style={styles.panelHeader}>
                  <View style={styles.panelIcon}>
                    <Plus color="#0f172a" size={22} />
                  </View>
                  <View style={styles.panelTitleBlock}>
                    <Text style={styles.panelTitle}>Manuel abonelik</Text>
                    <Text style={styles.panelSubtitle}>Tutar, kart ve odeme gunu</Text>
                  </View>
                </View>

                <DraftEditor draft={draft} setDraft={setDraft} />
                <PrimaryButton
                  icon={<Check color="#f8fafc" size={18} />}
                  label="Aboneligi kaydet"
                  onPress={() => addSubscription(draft)}
                />
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TabButton({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.segmentButton, active && styles.segmentButtonActive]}
    >
      {icon}
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}>{icon}</View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
    </View>
  );
}

function SubscriptionCard({
  subscription,
  isEditing,
  editDraft,
  setEditDraft,
  onCancelEdit,
  onDelete,
  onEdit,
  onSaveEdit,
  onToggleReminder,
  onToggleUsage,
}: {
  subscription: Subscription;
  isEditing: boolean;
  editDraft: Draft;
  setEditDraft: (draft: Draft) => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSaveEdit: () => void;
  onToggleReminder: () => void;
  onToggleUsage: () => void;
}) {
  const dueIn = daysUntil(subscription.billingDay);

  if (isEditing) {
    return (
      <View style={styles.editCard}>
        <View style={styles.editHeader}>
          <View>
            <Text style={styles.editTitle}>Aboneligi duzenle</Text>
            <Text style={styles.editSubtitle}>{subscription.name}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Duzenlemeyi kapat"
            onPress={onCancelEdit}
            style={styles.smallAction}
          >
            <X color="#334155" size={17} />
          </Pressable>
        </View>
        <DraftEditor draft={editDraft} setDraft={setEditDraft} />
        <View style={styles.editActions}>
          <Pressable accessibilityRole="button" onPress={onCancelEdit} style={styles.secondaryButton}>
            <X color="#334155" size={17} />
            <Text style={styles.secondaryButtonText}>Vazgec</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onSaveEdit} style={styles.saveButton}>
            <Check color="#f8fafc" size={17} />
            <Text style={styles.saveButtonText}>Kaydet</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.subscriptionCard}>
      <View style={[styles.accentRail, { backgroundColor: subscription.accent }]} />
      <View style={styles.subscriptionBody}>
        <View style={styles.subscriptionTop}>
          <View style={styles.serviceBlock}>
            <Text numberOfLines={1} style={styles.serviceName}>
              {subscription.name}
            </Text>
            <Text style={styles.serviceMeta}>
              {subscription.category} · {subscription.cardLast4 ? `**** ${subscription.cardLast4}` : 'Kart yok'}
            </Text>
          </View>
          <View style={styles.amountBlock}>
            <Text adjustsFontSizeToFit numberOfLines={1} style={styles.subscriptionAmount}>
              {formatTry(subscription.amount)}
            </Text>
            <Text style={styles.subscriptionCadence}>
              {subscription.cadence === 'yearly' ? 'yillik' : 'aylik'}
            </Text>
          </View>
        </View>

        <View style={styles.subscriptionFooter}>
          <View style={[styles.statusPill, !subscription.usedRecently && styles.statusPillWarn]}>
            {subscription.usedRecently ? (
              <Check color="#0f766e" size={14} />
            ) : (
              <X color="#be123c" size={14} />
            )}
            <Text style={[styles.statusPillText, !subscription.usedRecently && styles.statusPillTextWarn]}>
              {subscription.usedRecently ? 'Kullanim var' : 'Iptal adayi'}
            </Text>
          </View>
          <Text style={styles.dueText}>{dueIn === 0 ? 'Bugun' : `${dueIn} gun sonra`}</Text>
        </View>

        <View style={styles.cardActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aboneligi duzenle"
            onPress={onEdit}
            style={styles.smallAction}
          >
            <Edit3 color="#334155" size={17} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kullanim durumunu degistir"
            onPress={onToggleUsage}
            style={styles.smallAction}
          >
            <RefreshCw color="#334155" size={17} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Iptal hatirlatmasini degistir"
            onPress={onToggleReminder}
            style={[styles.smallAction, subscription.reminderEnabled && styles.smallActionActive]}
          >
            {subscription.reminderEnabled ? (
              <BellRing color="#0f766e" size={17} />
            ) : (
              <Bell color="#334155" size={17} />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aboneligi sil"
            onPress={onDelete}
            style={styles.smallAction}
          >
            <Trash2 color="#be123c" size={17} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function DraftEditor({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
}) {
  return (
    <View style={styles.form}>
      <Field label="Servis">
        <TextInput
          value={draft.name}
          onChangeText={(name) => setDraft({ ...draft, name })}
          placeholder="Netflix, iCloud, spor salonu"
          placeholderTextColor="#94a3b8"
          style={styles.input}
        />
      </Field>

      <View style={styles.formRow}>
        <Field label="Tutar" style={styles.rowField}>
          <TextInput
            value={draft.amount}
            onChangeText={(amount) => setDraft({ ...draft, amount })}
            keyboardType="decimal-pad"
            placeholder="229,99"
            placeholderTextColor="#94a3b8"
            style={styles.input}
          />
        </Field>
        <Field label="Gun" style={styles.dayField}>
          <TextInput
            value={draft.billingDay}
            onChangeText={(billingDay) => setDraft({ ...draft, billingDay })}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="5"
            placeholderTextColor="#94a3b8"
            style={styles.input}
          />
        </Field>
      </View>

      <View style={styles.formRow}>
        <Field label="Kategori" style={styles.rowField}>
          <TextInput
            value={draft.category}
            onChangeText={(category) => setDraft({ ...draft, category })}
            placeholder="Dijital"
            placeholderTextColor="#94a3b8"
            style={styles.input}
          />
        </Field>
        <Field label="Kart" style={styles.cardField}>
          <View style={styles.cardInputWrap}>
            <CreditCard color="#64748b" size={17} />
            <TextInput
              value={draft.cardLast4}
              onChangeText={(cardLast4) => setDraft({ ...draft, cardLast4 })}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="4821"
              placeholderTextColor="#94a3b8"
              style={styles.cardInput}
            />
          </View>
        </Field>
      </View>

      <View style={styles.formRow}>
        <View style={styles.cadenceSwitch}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: draft.cadence === 'monthly' }}
            onPress={() => setDraft({ ...draft, cadence: 'monthly' })}
            style={[styles.cadenceOption, draft.cadence === 'monthly' && styles.cadenceOptionActive]}
          >
            <Text style={[styles.cadenceText, draft.cadence === 'monthly' && styles.cadenceTextActive]}>
              Aylik
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: draft.cadence === 'yearly' }}
            onPress={() => setDraft({ ...draft, cadence: 'yearly' })}
            style={[styles.cadenceOption, draft.cadence === 'yearly' && styles.cadenceOptionActive]}
          >
            <Text style={[styles.cadenceText, draft.cadence === 'yearly' && styles.cadenceTextActive]}>
              Yillik
            </Text>
          </Pressable>
        </View>
        <View style={styles.usageSwitch}>
          <Text style={styles.usageLabel}>Kullaniyorum</Text>
          <Switch
            value={draft.usedRecently}
            onValueChange={(usedRecently) => setDraft({ ...draft, usedRecently })}
            trackColor={{ false: '#fecdd3', true: '#99f6e4' }}
            thumbColor={draft.usedRecently ? '#0f766e' : '#be123c'}
          />
        </View>
      </View>
    </View>
  );
}

function Field({
  children,
  label,
  style,
}: {
  children: ReactNode;
  label: string;
  style?: object;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function PrimaryButton({
  icon,
  label,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.primaryButton}>
      {icon}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eef2f7',
  },
  keyboard: {
    flex: 1,
  },
  appShell: {
    alignSelf: 'center',
    flex: 1,
    maxWidth: 520,
    paddingHorizontal: 18,
    paddingTop: 10,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 14,
  },
  logoMark: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dbe3ee',
    borderRadius: 8,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  headerText: {
    flex: 1,
  },
  appName: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
  },
  appMeta: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  segmented: {
    backgroundColor: '#dbe3ee',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 42,
  },
  segmentButtonActive: {
    backgroundColor: '#0f172a',
  },
  segmentText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#f8fafc',
  },
  content: {
    paddingBottom: 32,
    paddingTop: 16,
  },
  heroBand: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 128,
    padding: 20,
  },
  heroLabel: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  heroAmount: {
    color: '#f8fafc',
    fontSize: 38,
    fontWeight: '900',
    marginTop: 8,
    maxWidth: 250,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  metricCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dbe3ee',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 106,
    padding: 14,
  },
  metricIcon: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    marginBottom: 10,
    width: 32,
  },
  metricLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  metricValue: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 4,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 22,
  },
  sectionTitleRowCompact: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800',
  },
  sectionHint: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
  },
  breakdownPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dbe3ee',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 14,
  },
  breakdownTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  cardTotalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 42,
  },
  cardTotalLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 9,
    minWidth: 0,
  },
  cardTotalIcon: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 34,
  },
  cardTotalLabel: {
    color: '#334155',
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  cardTotalAmount: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
    maxWidth: 130,
    textAlign: 'right',
  },
  timelineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
  },
  timelineDate: {
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 54,
  },
  timelineDateText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '900',
  },
  timelineService: {
    flex: 1,
    minWidth: 0,
  },
  timelineName: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
  },
  timelineMeta: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  timelineAmount: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '900',
    maxWidth: 112,
    textAlign: 'right',
  },
  categoryRow: {
    marginTop: 10,
  },
  categoryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  categoryName: {
    color: '#334155',
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  categoryAmount: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '900',
  },
  progressTrack: {
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    height: 8,
    marginTop: 7,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 8,
    height: 8,
  },
  detoxPanel: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 14,
  },
  detoxTitle: {
    color: '#7c2d12',
    fontSize: 16,
    fontWeight: '900',
  },
  detoxSubtitle: {
    color: '#9a3412',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  actionRow: {
    alignItems: 'center',
    borderTopColor: '#fed7aa',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
    marginTop: 10,
  },
  actionTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    color: '#7c2d12',
    fontSize: 14,
    fontWeight: '900',
  },
  actionText: {
    color: '#9a3412',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: 3,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#ffedd5',
    borderColor: '#fed7aa',
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 42,
  },
  scanPanel: {
    backgroundColor: '#f8fafc',
    borderColor: '#dbe3ee',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 14,
  },
  panelFinePrint: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  gapRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 34,
  },
  gapProduct: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '900',
    width: 112,
  },
  gapText: {
    color: '#475569',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  searchWrap: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: '#0f172a',
    flex: 1,
    fontSize: 15,
    minHeight: 46,
    padding: 0,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
    marginTop: 10,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 34,
    paddingHorizontal: 11,
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  filterText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '900',
  },
  filterTextActive: {
    color: '#f8fafc',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dbe3ee',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 18,
  },
  emptyTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  editCard: {
    backgroundColor: '#ffffff',
    borderColor: '#93c5fd',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
  },
  editHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  editTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  editSubtitle: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  editActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 46,
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '900',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 46,
  },
  saveButtonText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '900',
  },
  subscriptionCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dbe3ee',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    overflow: 'hidden',
  },
  accentRail: {
    width: 6,
  },
  subscriptionBody: {
    flex: 1,
    padding: 14,
  },
  subscriptionTop: {
    flexDirection: 'row',
    gap: 12,
  },
  serviceBlock: {
    flex: 1,
    minWidth: 0,
  },
  serviceName: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
  },
  serviceMeta: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  amountBlock: {
    alignItems: 'flex-end',
    maxWidth: 132,
  },
  subscriptionAmount: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },
  subscriptionCadence: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  subscriptionFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  statusPill: {
    alignItems: 'center',
    backgroundColor: '#ccfbf1',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 9,
  },
  statusPillWarn: {
    backgroundColor: '#ffe4e6',
  },
  statusPillText: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
  },
  statusPillTextWarn: {
    color: '#be123c',
  },
  dueText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  smallAction: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 42,
  },
  smallActionActive: {
    backgroundColor: '#ccfbf1',
    borderColor: '#99f6e4',
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: '#dbe3ee',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  panelIcon: {
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  panelTitleBlock: {
    flex: 1,
  },
  panelTitle: {
    color: '#0f172a',
    fontSize: 19,
    fontWeight: '800',
  },
  panelSubtitle: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  form: {
    gap: 12,
  },
  field: {
    gap: 7,
  },
  fieldLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  textArea: {
    lineHeight: 22,
    minHeight: 150,
    paddingTop: 12,
  },
  formRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 10,
  },
  rowField: {
    flex: 1,
  },
  dayField: {
    width: 78,
  },
  cardField: {
    width: 118,
  },
  cardInputWrap: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 48,
    paddingHorizontal: 10,
  },
  cardInput: {
    color: '#0f172a',
    flex: 1,
    fontSize: 16,
    minHeight: 46,
    padding: 0,
  },
  cadenceSwitch: {
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  cadenceOption: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  cadenceOptionActive: {
    backgroundColor: '#0f172a',
  },
  cadenceText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
  },
  cadenceTextActive: {
    color: '#f8fafc',
  },
  usageSwitch: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    paddingLeft: 12,
    paddingRight: 6,
  },
  usageLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 50,
  },
  primaryButtonText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  detectedBox: {
    borderColor: '#bae6fd',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 16,
    padding: 12,
  },
  detectedTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 12,
  },
});
