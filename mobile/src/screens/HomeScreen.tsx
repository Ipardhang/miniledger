import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl,
  StyleSheet, Text, View, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, Loan, Summary } from '../api';
import { daysOverdue, formatDate, formatMoney } from '../format';
import { colors } from '../theme';

type Props = { onAdd: () => void; onLogout: () => void };

export default function HomeScreen({ onAdd, onLogout }: Props) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([api.getSummary(), api.getLoans()]);
      setSummary(s); setLoans(l); setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load entries');
    }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);
  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  async function saveRepaid(loan: Loan) {
    try {
      await api.markRepaid(loan.id);
      await load();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Try again';
      if (Platform.OS === 'web') {
        // Alert.alert is not supported by React Native Web in all environments.
        window.alert(`Could not update repayment: ${message}`);
      } else {
        Alert.alert('Could not update', message);
      }
    }
  }

  function confirmRepaid(loan: Loan) {
    const message = `${loan.friendName} paid back ${formatMoney(loan.amount)}.`;
    // Use the browser's native confirmation dialog on web; Alert.alert is for native.
    if (Platform.OS === 'web') {
      if (window.confirm(`Mark as repaid?\n\n${message}`)) {
        void saveRepaid(loan);
      }
      return;
    }

    Alert.alert('Mark as repaid?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark repaid', onPress: () => { void saveRepaid(loan); } },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>m</Text></View>
          <View><Text style={styles.title}>MiniLedger</Text><Text style={styles.tagline}>YOUR MONEY, IN GOOD ORDER</Text></View>
        </View>
        <Pressable onPress={onLogout} hitSlop={12} style={styles.avatar}><Text style={styles.avatarText}>↗</Text></Pressable>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} /> : (
        <FlatList
          data={loans}
          keyExtractor={(l) => l.id}
          renderItem={({ item }) => <LoanRow loan={item} onRepaid={() => confirmRepaid(item)} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<View>
            <View style={styles.welcomeRow}>
              <View><Text style={styles.eyebrow}>YOUR OVERVIEW</Text><Text style={styles.greeting}>Good to see you.</Text></View>
              <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>UP TO DATE</Text></View>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {summary ? <SummaryCard summary={summary} /> : null}
            <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Your entries</Text><Text style={styles.sectionSub}>{loans.length} {loans.length === 1 ? 'record' : 'records'} in your ledger</Text></View><View style={styles.countPill}><Text style={styles.countText}>{loans.filter(l => !l.isRepaid).length} active</Text></View></View>
          </View>}
          ListEmptyComponent={!error ? <View style={styles.emptyCard}><Text style={styles.emptyIcon}>↗</Text><Text style={styles.emptyTitle}>Your ledger starts here</Text><Text style={styles.empty}>Add money you’ve lent to a friend and keep every repayment in one place.</Text><Pressable onPress={onAdd} style={styles.emptyButton}><Text style={styles.emptyButtonText}>＋ Add your first entry</Text></Pressable></View> : null}
        />
      )}
      {loans.length > 0 && !loading ? <Pressable style={({ pressed }) => [styles.fab, pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] }]} onPress={onAdd}><Text style={styles.fabPlus}>＋</Text><Text style={styles.fabText}>New entry</Text></Pressable> : null}
    </SafeAreaView>
  );
}

function SummaryCard({ summary }: { summary: Summary }) {
  return <View style={styles.summary}>
    <View style={styles.summaryTop}><Text style={styles.summaryLabel}>TOTAL OUTSTANDING</Text><View style={styles.summaryIcon}><Text style={styles.summaryIconText}>↗</Text></View></View>
    <Text style={styles.summaryBig}>{formatMoney(summary.outstanding)}</Text>
    <Text style={styles.summaryCaption}>Money still to come back to you</Text>
    <View style={styles.summaryDivider} />
    <View style={styles.statRow}><Stat label="Total lent" value={formatMoney(summary.totalLent)} /><View style={styles.statDivider} /><Stat label="Repaid" value={formatMoney(summary.totalRepaid)} /><View style={styles.statDivider} /><Stat label="Overdue" value={formatMoney(summary.overdueAmount)} alert={summary.overdueAmount > 0} /></View>
  </View>;
}
function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return <View style={{ flex: 1 }}><Text style={styles.statLabel}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.statValue, alert && { color: '#FFC0AE' }]}>{value}</Text></View>;
}
function LoanRow({ loan, onRepaid }: { loan: Loan; onRepaid: () => void }) {
  const [showReceipt, setShowReceipt] = useState(false);
  let status: string;
  if (loan.isRepaid && loan.repaidAt) status = `Repaid on ${formatDate(loan.repaidAt)}`;
  else if (loan.isOverdue) { const d = daysOverdue(loan.dueDate); status = `Overdue by ${d} day${d === 1 ? '' : 's'} · due ${formatDate(loan.dueDate)}`; }
  else status = `Due ${formatDate(loan.dueDate)}`;
  const initial = loan.friendName.trim().charAt(0).toUpperCase() || '?';
  return <View style={[styles.row, loan.isOverdue && styles.rowOverdue, loan.isRepaid && styles.rowRepaid]}>
    <View style={styles.rowTop}><View style={styles.person}><View style={[styles.personAvatar, loan.isOverdue && styles.personAvatarOverdue, loan.isRepaid && styles.personAvatarRepaid]}><Text style={styles.personInitial}>{initial}</Text></View><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.name}>{loan.friendName}</Text><Text style={[styles.status, loan.isOverdue && styles.overdueText, loan.isRepaid && styles.repaidText]}>{loan.isOverdue && !loan.isRepaid ? '● ' : loan.isRepaid ? '✓ ' : '◷ '}{status}</Text></View></View><Text style={[styles.amount, loan.isRepaid && styles.strike]}>{formatMoney(loan.amount)}</Text></View>
    <View style={styles.actions}>{loan.hasReceipt ? <Pressable onPress={() => setShowReceipt(v => !v)} hitSlop={8}><Text style={styles.link}>{showReceipt ? 'Hide receipt' : 'View receipt'}</Text></Pressable> : <View />}{!loan.isRepaid && <Pressable style={styles.repayBtn} onPress={onRepaid}><Text style={styles.repayText}>✓  Mark repaid</Text></Pressable>}{loan.isRepaid && <View style={styles.paidBadge}><Text style={styles.paidBadgeText}>PAID</Text></View>}</View>
    {showReceipt && <Image source={api.receiptSource(loan.id)} style={styles.receipt} resizeMode="contain" />}
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#FFFFFF', fontSize: 29, fontWeight: '800', fontStyle: 'italic', marginTop: -3 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.6, color: colors.text },
  tagline: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.25, marginTop: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5EEE7', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: colors.primary },
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 110, flexGrow: 1 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  greeting: { color: colors.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.9, marginTop: 4 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, backgroundColor: '#E6F3EA', paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  liveText: { color: colors.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  error: { color: colors.danger, marginBottom: 12 },
  summary: { backgroundColor: colors.primaryDark, borderRadius: 25, padding: 21, marginBottom: 26, shadowColor: '#153C2B', shadowOpacity: 0.14, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { color: '#B8D6C6', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  summaryIcon: { width: 33, height: 33, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  summaryIconText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  summaryBig: { color: '#FFFFFF', fontSize: 35, fontWeight: '800', letterSpacing: -1.2, marginTop: 9 },
  summaryCaption: { color: '#B8D6C6', fontSize: 12, marginTop: 3 },
  summaryDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.17)', marginVertical: 19 },
  statRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.18)' },
  statLabel: { color: '#B8D6C6', fontSize: 10, fontWeight: '600' },
  statValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', marginTop: 6 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  sectionSub: { color: colors.muted, fontSize: 12, marginTop: 3 },
  countPill: { backgroundColor: '#E8EEE8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  countText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  row: { backgroundColor: colors.card, borderRadius: 19, padding: 15, marginBottom: 11, borderWidth: 1, borderColor: colors.border },
  rowOverdue: { backgroundColor: '#FFF9F7', borderColor: '#F4C9C0' },
  rowRepaid: { backgroundColor: '#F8FBF8' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 },
  personAvatar: { width: 43, height: 43, borderRadius: 15, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  personAvatarOverdue: { backgroundColor: '#FCE4DE' }, personAvatarRepaid: { backgroundColor: '#E5F2E8' },
  personInitial: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '800', color: colors.text },
  amount: { fontSize: 16, fontWeight: '800', color: colors.text },
  strike: { textDecorationLine: 'line-through', color: colors.muted },
  status: { fontSize: 11, color: colors.muted, marginTop: 5 },
  overdueText: { color: colors.danger, fontWeight: '700' }, repaidText: { color: colors.success, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EDF1ED' },
  link: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  repayBtn: { backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11 },
  repayText: { color: colors.primary, fontWeight: '800', fontSize: 11 },
  paidBadge: { backgroundColor: '#E5F3E9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  paidBadgeText: { color: colors.success, fontWeight: '900', fontSize: 9, letterSpacing: 1 },
  receipt: { width: '100%', height: 220, marginTop: 12, borderRadius: 12, backgroundColor: '#F3F6F3' },
  fab: { position: 'absolute', right: 20, bottom: 22, backgroundColor: colors.primary, paddingHorizontal: 20, height: 56, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', elevation: 5, shadowColor: '#123B2A', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  fabPlus: { color: '#FFFFFF', fontSize: 22, fontWeight: '500', marginTop: -2 }, fabText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  emptyCard: { alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 25, marginTop: 4 },
  emptyIcon: { width: 58, height: 58, textAlign: 'center', textAlignVertical: 'center', borderRadius: 20, overflow: 'hidden', backgroundColor: colors.primarySoft, color: colors.primary, fontSize: 30, fontWeight: '700', marginBottom: 14 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800' }, empty: { color: colors.muted, textAlign: 'center', lineHeight: 20, marginTop: 8, fontSize: 13 },
  emptyButton: { backgroundColor: colors.primary, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 12, marginTop: 18 }, emptyButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
});
