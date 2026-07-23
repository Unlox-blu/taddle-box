import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  Alert, Share, Switch, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';
import { useWallet } from '../../context/WalletContext';
import MainHeader from '../../components/common/MainHeader';
import type { Transaction } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type TxnFilter = 'All' | 'Earned' | 'Spent' | 'XP' | 'Cash';
type ActiveModal = 'none' | 'withdraw' | 'linkUPI' | 'convert' | 'history' | 'settings';

const TXN_META: Record<string, { icon: string; bg: string; label: string }> = {
  earn:     { icon: '⬆️', bg: 'rgba(16,185,129,0.13)',  label: 'Earned'    },
  spend:    { icon: '🎯', bg: 'rgba(239,68,68,0.11)',    label: 'Spent'     },
  convert:  { icon: '⚡', bg: 'rgba(251,191,36,0.11)',   label: 'Converted' },
  withdraw: { icon: '🏦', bg: 'rgba(6,182,212,0.11)',    label: 'Withdrawn' },
};

const UPI_APPS = [
  { id: 'paytm',    name: 'Paytm',    suffix: '@paytm',   icon: '💙' },
  { id: 'gpay',     name: 'GPay',     suffix: '@okicici', icon: '🔵' },
  { id: 'phonepe',  name: 'PhonePe',  suffix: '@ybl',     icon: '💜' },
  { id: 'bhim',     name: 'BHIM',     suffix: '@upi',     icon: '🟠' },
];

const QUICK_AMOUNTS = [100, 250, 500, 1000];
const QUICK_XP      = [500, 1000, 5000];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WalletScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation();
  const { wallet, withdraw, convertXP, earnXP, linkUPI, toggleSetting } = useWallet();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [txnFilter,    setTxnFilter]    = useState<TxnFilter>('All');
  const [activeModal,  setActiveModal]  = useState<ActiveModal>('none');
  const [handoffUrl,   setHandoffUrl]   = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // ── Computed stats ──
  const thisMonthEarned = wallet.transactions
    .filter(t => t.type === 'earn' && t.date.includes('Today') || t.date.includes('Yesterday') || t.date.startsWith('Jun'))
    .reduce((s, t) => s + (t.currency === 'INR' && t.amount > 0 ? t.amount : 0), 0);

  const filteredTxns = wallet.transactions.filter(t => {
    if (txnFilter === 'Earned') return t.type === 'earn';
    if (txnFilter === 'Spent')  return t.type === 'spend' || t.type === 'withdraw';
    if (txnFilter === 'XP')     return t.currency === 'XP';
    if (txnFilter === 'Cash')   return t.currency === 'INR';
    return true;
  });

  // ── Earn-more actions (navigate to relevant tab) ──
  const earnActions = [
    { emoji: '🎮', label: 'Win Games',     xp: '+50–150 XP', tab: 'Games'  },
    { emoji: '📝', label: 'Post Content',  xp: '+10–75 XP',  tab: 'Home'   },
    { emoji: '🎯', label: 'Attend Events', xp: '+100–500 XP',tab: 'Events' },
    { emoji: '🔥', label: 'Daily Streak',  xp: '+25–100 XP', tab: 'Home'   },
  ];

  const handleShareWallet = async () => {
    await Share.share({ message: `I've earned ₹${wallet.totalEarned.toLocaleString()} on TADDLEBOX! 🎮⚡ Join me and start earning today.` });
  };

  const openModal = (m: ActiveModal) => setActiveModal(m);
  const closeModal = () => setActiveModal('none');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      <MainHeader />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Wallet 💎</Text>
          <Text style={styles.subtitle}>Manage your earnings & XP</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => openModal('settings')}>
          <Ionicons name="settings-outline" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>

        {/* ── Hero: Cash Balance ── */}
        <LinearGradient
          colors={[colors.primaryDark, '#1a0a3e']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroGlow} />
          <View style={styles.heroGlow2} />

          <Text style={styles.heroLabel}>Cash Balance</Text>
          <Text style={styles.heroAmount}>₹ {wallet.cashBalance.toLocaleString()}</Text>
          <Text style={styles.heroSub}>Available for withdrawal</Text>

          {/* UPI linked badge */}
          {wallet.linkedUPI && (
            <View style={styles.upiLinkedBadge}>
              <Ionicons name="checkmark-circle" size={12} color={colors.success} />
              <Text style={styles.upiLinkedText}>UPI Linked: {wallet.linkedUPI}</Text>
            </View>
          )}

          <View style={styles.heroActions}>
            {[
              { icon: 'arrow-up-circle-outline', label: 'Withdraw', modal: 'withdraw' as ActiveModal },
              { icon: 'link-outline',            label: 'Link UPI', modal: 'linkUPI'  as ActiveModal },
              { icon: 'time-outline',            label: 'History',  modal: 'history'  as ActiveModal },
              { icon: 'share-outline',           label: 'Share',    modal: 'none'     as ActiveModal },
            ].map(a => (
              <TouchableOpacity
                key={a.label}
                style={styles.heroAction}
                onPress={() => a.label === 'Share' ? handleShareWallet() : openModal(a.modal)}
                activeOpacity={0.75}
              >
                <Ionicons name={a.icon as any} size={20} color="rgba(255,255,255,0.9)" />
                <Text style={styles.heroActionLabel}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>

        {/* ── XP Balance Card ── */}
        <View style={styles.xpCard}>
          <LinearGradient colors={[colors.xpGold, colors.xpOrange]} style={styles.xpIcon}>
            <Text style={{ fontSize: 24 }}>⚡</Text>
          </LinearGradient>
          <View style={styles.xpInfo}>
            <Text style={styles.xpAmount}>{wallet.xpBalance.toLocaleString()} XP</Text>
            <Text style={styles.xpSub}>≈ ₹{(wallet.xpBalance / 100).toFixed(2)} convertible</Text>
          </View>
          <TouchableOpacity
            style={[styles.convertBtn, wallet.xpBalance < 500 && styles.convertBtnDisabled]}
            onPress={() => wallet.xpBalance >= 500 ? openModal('convert') : Alert.alert('Not enough XP', 'You need at least 500 XP to convert.')}
            activeOpacity={0.8}
          >
            <Text style={styles.convertBtnText}>Convert →</Text>
          </TouchableOpacity>
        </View>

        {/* ── Quick Stats Row ── */}
        <View style={styles.statsRow}>
          {[
            { label: 'Total Earned', value: `₹${wallet.totalEarned.toLocaleString()}`,    color: colors.success },
            { label: 'Withdrawn',    value: `₹${wallet.totalWithdrawn.toLocaleString()}`, color: colors.cyan    },
            { label: 'XP Balance',   value: `${wallet.xpBalance.toLocaleString()}`,       color: colors.xpGold  },
          ].map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <View style={styles.statDivider} />}
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* ── Earn More Card ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardTitle}>Earn more XP ⚡</Text>
          <View style={styles.earnGrid}>
            {earnActions.map(e => (
              <TouchableOpacity
                key={e.label}
                style={styles.earnItem}
                onPress={() => (navigation as any).getParent()?.navigate(e.tab)}
                activeOpacity={0.75}
              >
                <Text style={styles.earnEmoji}>{e.emoji}</Text>
                <Text style={styles.earnLabel}>{e.label}</Text>
                <Text style={styles.earnXp}>{e.xp}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Conversion Rate Info ── */}
        <TouchableOpacity style={styles.rateCard} onPress={() => openModal('convert')} activeOpacity={0.85}>
          <LinearGradient
            colors={['rgba(251,191,36,0.12)', 'rgba(249,115,22,0.08)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.rateCardInner}
          >
            <View style={styles.rateLeft}>
              <Text style={styles.rateTitle}>100 XP = ₹1.00</Text>
              <Text style={styles.rateSub}>Min. 500 XP to convert · Instant credit</Text>
            </View>
            <TouchableOpacity style={styles.rateBtn} onPress={() => openModal('convert')}>
              <Text style={styles.rateBtnText}>Convert Now</Text>
            </TouchableOpacity>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Transactions ── */}
        <View style={styles.txnHeaderRow}>
          <Text style={styles.txnTitle}>Transactions</Text>
          <TouchableOpacity onPress={() => openModal('history')}>
            <Text style={styles.txnSeeAll}>See all →</Text>
          </TouchableOpacity>
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.txnFilters}
        >
          {(['All', 'Earned', 'Spent', 'XP', 'Cash'] as TxnFilter[]).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.txnChip, txnFilter === f && styles.txnChipActive]}
              onPress={() => setTxnFilter(f)}
            >
              <Text style={[styles.txnChipText, txnFilter === f && styles.txnChipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Transaction list */}
        <View style={styles.txnList}>
          {filteredTxns.length === 0 ? (
            <View style={styles.txnEmpty}>
              <Text style={styles.txnEmptyText}>No {txnFilter.toLowerCase()} transactions yet</Text>
            </View>
          ) : (
            filteredTxns.slice(0, 8).map((t, i) => (
              <TxnRow key={t.id} txn={t} isLast={i === Math.min(filteredTxns.length, 8) - 1} />
            ))
          )}
        </View>

        {filteredTxns.length > 8 && (
          <TouchableOpacity style={styles.viewAllBtn} onPress={() => openModal('history')}>
            <Text style={styles.viewAllText}>View all {filteredTxns.length} transactions →</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Modals ── */}
      <WithdrawModal
        visible={activeModal === 'withdraw'}
        cashBalance={wallet.cashBalance}
        linkedUPI={wallet.linkedUPI}
        onWithdraw={async (amount) => {
          try {
            const url = await withdraw(amount);
            if (url) setHandoffUrl(url);
          } catch (e) {
            console.log(e);
          }
        }}
        onLinkUPI={() => openModal('linkUPI')}
        onClose={closeModal}
      />
      <LinkUPIModal
        visible={activeModal === 'linkUPI'}
        current={wallet.linkedUPI}
        onLink={linkUPI}
        onClose={closeModal}
      />
      <ConvertModal
        visible={activeModal === 'convert'}
        xpBalance={wallet.xpBalance}
        onConvert={convertXP}
        onClose={closeModal}
      />
      <HistoryModal
        visible={activeModal === 'history'}
        transactions={wallet.transactions}
        onClose={closeModal}
      />
      <SettingsModal
        visible={activeModal === 'settings'}
        wallet={wallet}
        onToggle={toggleSetting}
        onLinkUPI={() => { closeModal(); setTimeout(() => openModal('linkUPI'), 300); }}
        onClose={closeModal}
      />

      {handoffUrl && (
        <Modal visible={true} animationType="slide" onRequestClose={() => setHandoffUrl(null)}>
          <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.bg.base }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: colors.bg.base }}>
              <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: 'bold' }}>Complete Withdrawal</Text>
              <TouchableOpacity onPress={() => setHandoffUrl(null)}>
                <Text style={{ color: colors.primary }}>Close</Text>
              </TouchableOpacity>
            </View>
            <WebView 
              source={{ uri: handoffUrl }} 
              style={{ flex: 1 }} 
              onNavigationStateChange={(state) => {
                // If it hits a success/failure URL, close it
                if (state.url.includes('success') || state.url.includes('failure')) {
                  setTimeout(() => setHandoffUrl(null), 2000);
                }
              }}
            />
          </View>
        </Modal>
      )}

    </View>
  );
}

// ─── TxnRow ───────────────────────────────────────────────────────────────────

function TxnRow({ txn: t, isLast }: { txn: Transaction; isLast: boolean }) {
  const meta = TXN_META[t.type] ?? TXN_META.earn;
  const isXP  = t.currency === 'XP';
  const isNeg = t.amount < 0;
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.txnRow, isLast && { borderBottomWidth: 0 }]}>
      <View style={[styles.txnIcon, { backgroundColor: meta.bg }]}>
        <Text style={{ fontSize: 17 }}>{meta.icon}</Text>
      </View>
      <View style={styles.txnInfo}>
        <Text style={styles.txnRowTitle} numberOfLines={1}>{t.title}</Text>
        <Text style={styles.txnDate}>{t.date}</Text>
      </View>
      <View style={styles.txnAmtCol}>
        <Text style={[
          styles.txnAmt,
          isXP  ? { color: colors.xpGold  } :
          isNeg ? { color: colors.danger   } :
                  { color: colors.success  },
        ]}>
          {isXP  ? `+${t.amount.toLocaleString()} XP`
          : isNeg ? `-₹${Math.abs(t.amount).toLocaleString()}`
          :         `+₹${t.amount.toLocaleString()}`}
        </Text>
        <Text style={styles.txnTypeBadge}>{meta.label}</Text>
      </View>
    </View>
  );
}

// ─── WithdrawModal ────────────────────────────────────────────────────────────

function WithdrawModal({
  visible, cashBalance, linkedUPI, onWithdraw, onLinkUPI, onClose,
}: {
  visible:     boolean;
  cashBalance: number;
  linkedUPI:   string | null;
  onWithdraw:  (amount: number) => void;
  onLinkUPI:   () => void;
  onClose:     () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [amountStr, setAmountStr] = useState('');
  const amount = parseInt(amountStr, 10) || 0;

  const error = amount < 100              ? 'Minimum withdrawal is ₹100'
              : amount > cashBalance      ? `Insufficient balance (₹${cashBalance.toLocaleString()})`
              : null;

  const canSubmit = !error && amount > 0 && !!linkedUPI;

  const reset = () => { setAmountStr(''); };

  const handleConfirm = () => {
    if (!linkedUPI) { onLinkUPI(); return; }
    if (error) { Alert.alert('Invalid Amount', error); return; }
    Alert.alert(
      'Confirm Withdrawal',
      `Withdraw ₹${amount.toLocaleString()} to ${linkedUPI}?\n\nArrives within 1–2 business days.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Withdraw', style: 'destructive', onPress: () => { onWithdraw(amount); reset(); onClose(); } },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView
        style={[styles.modalShell, { paddingTop: insets.top || 16 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => { reset(); onClose(); }}>
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Withdraw Funds</Text>
          <TouchableOpacity onPress={handleConfirm} disabled={!canSubmit}>
            <LinearGradient
              colors={canSubmit ? [colors.primary, colors.cyanDark] : [colors.bg.elevated, colors.bg.elevated]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.modalActionBtn}
            >
              <Text style={[styles.modalActionText, !canSubmit && { color: colors.text.muted }]}>Withdraw</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          {/* Balance chip */}
          <View style={styles.balanceChip}>
            <Ionicons name="wallet-outline" size={14} color={colors.primaryLight} />
            <Text style={styles.balanceChipText}>Available: ₹{cashBalance.toLocaleString()}</Text>
          </View>

          {/* Amount input */}
          <Text style={styles.fieldLabel}>Amount</Text>
          <View style={[styles.amountInput, error && amountStr ? styles.amountInputError : null]}>
            <Text style={styles.rupeePre}>₹</Text>
            <TextInput
              style={styles.amountField}
              placeholder="0"
              placeholderTextColor={colors.text.muted}
              keyboardType="numeric"
              value={amountStr}
              onChangeText={v => setAmountStr(v.replace(/[^0-9]/g, ''))}
              maxLength={6}
            />
          </View>
          {error && amountStr ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Quick amounts */}
          <View style={styles.quickRow}>
            {QUICK_AMOUNTS.map(q => (
              <TouchableOpacity
                key={q}
                style={[styles.quickChip, amount === q && styles.quickChipActive]}
                onPress={() => setAmountStr(String(q))}
              >
                <Text style={[styles.quickChipText, amount === q && styles.quickChipTextActive]}>₹{q}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.quickChip, amount === cashBalance && styles.quickChipActive]}
              onPress={() => setAmountStr(String(cashBalance))}
            >
              <Text style={[styles.quickChipText, amount === cashBalance && styles.quickChipTextActive]}>Max</Text>
            </TouchableOpacity>
          </View>

          {/* Transfer to */}
          <Text style={styles.fieldLabel}>Transfer to</Text>
          {linkedUPI ? (
            <View style={styles.linkedUPIRow}>
              <View style={styles.linkedUPILeft}>
                <View style={styles.upiDot} />
                <Text style={styles.linkedUPIText}>{linkedUPI}</Text>
              </View>
              <TouchableOpacity onPress={onLinkUPI}>
                <Text style={styles.changeLink}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.noUPIRow} onPress={onLinkUPI}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primaryLight} />
              <Text style={styles.noUPIText}>Link a UPI account first</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
            </TouchableOpacity>
          )}

          {/* Info row */}
          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={14} color={colors.text.muted} />
            <Text style={styles.infoText}>Min ₹100 · No withdrawal fee · Arrives in 1–2 business days</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── LinkUPIModal ─────────────────────────────────────────────────────────────

function LinkUPIModal({
  visible, current, onLink, onClose,
}: {
  visible:  boolean;
  current:  string | null;
  onLink:   (upiId: string) => void;
  onClose:  () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [upiId,    setUpiId]    = useState(current ?? '');
  const [verifying, setVerifying] = useState(false);
  const [verified,  setVerified]  = useState(false);

  const isValidUPI = /^[a-zA-Z0-9._-]+@[a-zA-Z]{3,}$/.test(upiId.trim());

  const handleVerify = () => {
    if (!isValidUPI) { Alert.alert('Invalid UPI ID', 'Enter a valid UPI ID like name@paytm'); return; }
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      setVerified(true);
    }, 1500);
  };

  const handleSave = () => {
    if (!verified) { handleVerify(); return; }
    onLink(upiId.trim());
    setVerified(false);
    onClose();
  };

  const reset = () => { setUpiId(current ?? ''); setVerified(false); setVerifying(false); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView
        style={[styles.modalShell, { paddingTop: insets.top || 16 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => { reset(); onClose(); }}>
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Link UPI</Text>
          <TouchableOpacity onPress={handleSave} disabled={verifying}>
            <LinearGradient
              colors={verified ? [colors.success, '#065F46'] : [colors.primary, colors.cyanDark]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.modalActionBtn}
            >
              <Text style={styles.modalActionText}>{verified ? 'Save' : 'Verify'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          {/* UPI app shortcuts */}
          <Text style={styles.fieldLabel}>Quick select app</Text>
          <View style={styles.upiAppRow}>
            {UPI_APPS.map(app => (
              <TouchableOpacity
                key={app.id}
                style={styles.upiAppBtn}
                onPress={() => { setUpiId(prev => prev.split('@')[0] + app.suffix); setVerified(false); }}
              >
                <Text style={{ fontSize: 22 }}>{app.icon}</Text>
                <Text style={styles.upiAppName}>{app.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* UPI input */}
          <Text style={styles.fieldLabel}>UPI ID</Text>
          <View style={[styles.upiInput, verified && styles.upiInputVerified]}>
            <TextInput
              style={styles.upiTextField}
              placeholder="yourname@paytm"
              placeholderTextColor={colors.text.muted}
              value={upiId}
              onChangeText={v => { setUpiId(v); setVerified(false); }}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {verified && <Ionicons name="checkmark-circle" size={20} color={colors.success} />}
            {verifying && <Text style={styles.verifyingText}>Checking…</Text>}
          </View>

          {verified && (
            <View style={styles.verifiedBanner}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.verifiedBannerText}>UPI ID verified successfully!</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.text.muted} />
            <Text style={styles.infoText}>Your UPI ID is encrypted and stored securely. Used only for withdrawals.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── ConvertModal ─────────────────────────────────────────────────────────────

function ConvertModal({
  visible, xpBalance, onConvert, onClose,
}: {
  visible:    boolean;
  xpBalance:  number;
  onConvert:  (xp: number) => void;
  onClose:    () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [xpStr, setXpStr] = useState('');
  const xpAmount   = parseInt(xpStr, 10) || 0;
  const cashResult = Math.floor(xpAmount / 100);

  const error = xpAmount > 0 && xpAmount < 500   ? 'Minimum 500 XP to convert'
              : xpAmount > xpBalance              ? `You only have ${xpBalance.toLocaleString()} XP`
              : null;

  const canConvert = xpAmount >= 500 && xpAmount <= xpBalance;

  const reset = () => setXpStr('');

  const handleConvert = () => {
    if (!canConvert || error) return;
    Alert.alert(
      'Confirm Conversion',
      `Convert ${xpAmount.toLocaleString()} XP → ₹${cashResult.toFixed(2)}?\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Convert', onPress: () => { onConvert(xpAmount); reset(); onClose(); } },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView
        style={[styles.modalShell, { paddingTop: insets.top || 16 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => { reset(); onClose(); }}>
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Convert XP to Cash</Text>
          <TouchableOpacity onPress={handleConvert} disabled={!canConvert}>
            <LinearGradient
              colors={canConvert ? [colors.xpGold, colors.xpOrange] : [colors.bg.elevated, colors.bg.elevated]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.modalActionBtn}
            >
              <Text style={[styles.modalActionText, !canConvert && { color: colors.text.muted }]}>Convert</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          {/* XP balance chip */}
          <View style={[styles.balanceChip, { borderColor: 'rgba(251,191,36,0.3)', backgroundColor: 'rgba(251,191,36,0.08)' }]}>
            <Text style={{ fontSize: 13 }}>⚡</Text>
            <Text style={[styles.balanceChipText, { color: colors.xpGold }]}>You have {xpBalance.toLocaleString()} XP</Text>
          </View>

          {/* Rate banner */}
          <View style={styles.rateBanner}>
            <Text style={styles.rateBannerText}>100 XP = ₹1.00</Text>
            <Text style={styles.rateBannerSub}>Instant credit to your cash balance</Text>
          </View>

          {/* XP amount input */}
          <Text style={styles.fieldLabel}>XP to Convert</Text>
          <View style={[styles.amountInput, error ? styles.amountInputError : null]}>
            <Text style={[styles.rupeePre, { color: colors.xpGold }]}>⚡</Text>
            <TextInput
              style={styles.amountField}
              placeholder="500"
              placeholderTextColor={colors.text.muted}
              keyboardType="numeric"
              value={xpStr}
              onChangeText={v => setXpStr(v.replace(/[^0-9]/g, ''))}
              maxLength={7}
            />
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Quick XP amounts */}
          <View style={styles.quickRow}>
            {QUICK_XP.map(q => (
              <TouchableOpacity
                key={q}
                style={[styles.quickChip, xpAmount === q && styles.quickChipActive]}
                onPress={() => setXpStr(String(q))}
              >
                <Text style={[styles.quickChipText, xpAmount === q && styles.quickChipTextActive]}>
                  {q.toLocaleString()} XP
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.quickChip, xpAmount === xpBalance && styles.quickChipActive]}
              onPress={() => setXpStr(String(xpBalance))}
            >
              <Text style={[styles.quickChipText, xpAmount === xpBalance && styles.quickChipTextActive]}>All</Text>
            </TouchableOpacity>
          </View>

          {/* Preview */}
          {xpAmount >= 500 && !error && (
            <LinearGradient
              colors={['rgba(251,191,36,0.12)', 'rgba(249,115,22,0.08)']}
              style={styles.convertPreview}
            >
              <View style={styles.convertPreviewRow}>
                <View style={styles.convertPreviewSide}>
                  <Text style={styles.convertPreviewLabel}>You give</Text>
                  <Text style={styles.convertPreviewXP}>⚡ {xpAmount.toLocaleString()} XP</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color={colors.text.muted} />
                <View style={styles.convertPreviewSide}>
                  <Text style={styles.convertPreviewLabel}>You get</Text>
                  <Text style={styles.convertPreviewCash}>₹ {cashResult.toFixed(2)}</Text>
                </View>
              </View>
            </LinearGradient>
          )}

          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={14} color={colors.text.muted} />
            <Text style={styles.infoText}>Converted cash is added instantly to your cash balance and can be withdrawn anytime.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── HistoryModal ─────────────────────────────────────────────────────────────

type HistFilter = 'All' | 'Earned' | 'Spent' | 'XP' | 'Cash';

function HistoryModal({
  visible, transactions, onClose,
}: {
  visible:      boolean;
  transactions: Transaction[];
  onClose:      () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [filter, setFilter] = useState<HistFilter>('All');

  const filtered = transactions.filter(t => {
    if (filter === 'Earned') return t.type === 'earn';
    if (filter === 'Spent')  return t.type === 'spend' || t.type === 'withdraw';
    if (filter === 'XP')     return t.currency === 'XP';
    if (filter === 'Cash')   return t.currency === 'INR';
    return true;
  });

  // Group by date prefix
  const groups: Record<string, Transaction[]> = {};
  filtered.forEach(t => {
    const key = t.date.split(' · ')[0];
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalShell, { paddingTop: insets.top || 16 }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Transaction History</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.txnFilters}>
          {(['All', 'Earned', 'Spent', 'XP', 'Cash'] as HistFilter[]).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.txnChip, filter === f && styles.txnChipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.txnChipText, filter === f && styles.txnChipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView showsVerticalScrollIndicator={false}>
          {Object.keys(groups).length === 0 ? (
            <View style={styles.txnEmpty}>
              <Text style={styles.txnEmptyText}>No transactions found</Text>
            </View>
          ) : (
            Object.entries(groups).map(([date, txns]) => (
              <View key={date}>
                <Text style={styles.histDateLabel}>{date}</Text>
                <View style={styles.txnList}>
                  {txns.map((t, i) => (
                    <TxnRow key={t.id} txn={t} isLast={i === txns.length - 1} />
                  ))}
                </View>
              </View>
            ))
          )}
          <View style={{ height: 60 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── SettingsModal ────────────────────────────────────────────────────────────

function SettingsModal({
  visible, wallet, onToggle, onLinkUPI, onClose,
}: {
  visible:   boolean;
  wallet:    ReturnType<typeof useWallet>['wallet'];
  onToggle:  (key: 'pinEnabled' | 'biometricEnabled' | 'notifXP' | 'notifWithdraw' | 'notifPromos') => void;
  onLinkUPI: () => void;
  onClose:   () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const Section = ({ title }: { title: string }) => (
    <Text style={styles.settingsSection}>{title}</Text>
  );

  const ToggleRow = ({
    icon, label, desc, settingKey, value,
  }: {
    icon: string; label: string; desc: string;
    settingKey: 'pinEnabled' | 'biometricEnabled' | 'notifXP' | 'notifWithdraw' | 'notifPromos';
    value: boolean;
  }) => (
    <View style={styles.settingsRow}>
      <View style={styles.settingsRowLeft}>
        <Text style={styles.settingsRowIcon}>{icon}</Text>
        <View>
          <Text style={styles.settingsRowLabel}>{label}</Text>
          <Text style={styles.settingsRowDesc}>{desc}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={() => onToggle(settingKey)}
        trackColor={{ false: colors.bg.elevated, true: colors.primary }}
        thumbColor={value ? '#fff' : colors.text.muted}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalShell, { paddingTop: insets.top || 16 }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Wallet Settings</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.modalBody, { gap: 0 }]} showsVerticalScrollIndicator={false}>

          {/* Linked Accounts */}
          <Section title="Linked Accounts" />
          <View style={styles.settingsCard}>
            <TouchableOpacity style={styles.settingsRow} onPress={onLinkUPI}>
              <View style={styles.settingsRowLeft}>
                <Text style={styles.settingsRowIcon}>📱</Text>
                <View>
                  <Text style={styles.settingsRowLabel}>UPI Account</Text>
                  <Text style={[styles.settingsRowDesc, wallet.linkedUPI ? { color: colors.success } : {}]}>
                    {wallet.linkedUPI ?? 'Not linked'}
                  </Text>
                </View>
              </View>
              <Text style={styles.changeLink}>{wallet.linkedUPI ? 'Change' : 'Link →'}</Text>
            </TouchableOpacity>

            <View style={[styles.settingsRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <View style={styles.settingsRowLeft}>
                <Text style={styles.settingsRowIcon}>🏦</Text>
                <View>
                  <Text style={styles.settingsRowLabel}>Bank Account</Text>
                  <Text style={styles.settingsRowDesc}>Not linked</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => Alert.alert('Coming Soon', 'Bank account linking will be available in the next update.')}>
                <Text style={styles.changeLink}>Link →</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Security */}
          <Section title="Security" />
          <View style={styles.settingsCard}>
            <ToggleRow
              icon="🔐" label="PIN Protection"
              desc="Require PIN for withdrawals"
              settingKey="pinEnabled" value={wallet.pinEnabled}
            />
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
              <ToggleRow
                icon="👆" label="Biometric Auth"
                desc="Use fingerprint or face ID"
                settingKey="biometricEnabled" value={wallet.biometricEnabled}
              />
            </View>
          </View>

          {/* Notifications */}
          <Section title="Notifications" />
          <View style={styles.settingsCard}>
            <ToggleRow icon="⚡" label="XP Earned"    desc="Get notified when you earn XP"    settingKey="notifXP"       value={wallet.notifXP}       />
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
              <ToggleRow icon="🏦" label="Withdrawals" desc="Status updates for withdrawals"   settingKey="notifWithdraw" value={wallet.notifWithdraw} />
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
              <ToggleRow icon="🎁" label="Promotions"  desc="Bonus XP offers and promotions"  settingKey="notifPromos"   value={wallet.notifPromos}   />
            </View>
          </View>

          {/* About */}
          <Section title="About" />
          <View style={styles.settingsCard}>
            {[
              { label: 'Conversion Rate', value: '100 XP = ₹1.00' },
              { label: 'Min Withdrawal',  value: '₹100'           },
              { label: 'Min Conversion',  value: '500 XP'         },
              { label: 'Payout Time',     value: '1–2 business days' },
            ].map((row, i, arr) => (
              <View
                key={row.label}
                style={[styles.aboutRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
              >
                <Text style={styles.aboutLabel}>{row.label}</Text>
                <Text style={styles.aboutValue}>{row.value}</Text>
              </View>
            ))}
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg.base },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingTop: 12, paddingBottom: 6,
  },
  title:    { fontSize: fontSizes.xxl, fontWeight: '800', color: c.text.primary },
  subtitle: { fontSize: fontSizes.xs,  color: c.text.muted, marginTop: 2 },
  settingsBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: c.bg.card, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // Hero card
  heroCard: {
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(124,58,237,0.38)',
    padding: spacing.xxl, overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute', top: -40, right: -40,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(124,58,237,0.18)',
  },
  heroGlow2: {
    position: 'absolute', bottom: -60, left: -30,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(6,182,212,0.1)',
  },
  heroLabel:  { fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.5)', marginBottom: 4 },
  heroAmount: { fontSize: 40, fontWeight: '800', color: '#fff', marginBottom: 2 },
  heroSub:    { fontSize: fontSizes.xs, color: 'rgba(255,255,255,0.35)', marginBottom: 10 },
  upiLinkedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: radii.full, paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: 'flex-start', marginBottom: 14,
  },
  upiLinkedText: { fontSize: fontSizes.xs, color: c.success, fontWeight: '600' },
  heroActions:   { flexDirection: 'row', gap: 8, marginTop: 6 },
  heroAction: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radii.md, paddingVertical: 10,
    alignItems: 'center', gap: 4,
  },
  heroActionLabel: { fontSize: fontSizes.xs, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

  // XP card
  xpCard: {
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    backgroundColor: 'rgba(251,191,36,0.07)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)',
    borderRadius: radii.lg, padding: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  xpIcon:   { width: 48, height: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  xpInfo:   { flex: 1 },
  xpAmount: { fontSize: fontSizes.xl, fontWeight: '800', color: c.xpGold },
  xpSub:    { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 2 },
  convertBtn: {
    backgroundColor: 'rgba(251,191,36,0.18)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)',
    borderRadius: radii.full, paddingVertical: 8, paddingHorizontal: 16,
  },
  convertBtnDisabled: { opacity: 0.4 },
  convertBtnText: { fontSize: fontSizes.xs, fontWeight: '700', color: c.xpGold },

  // Stats row
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    backgroundColor: c.bg.card,
    borderRadius: radii.lg, borderWidth: 1, borderColor: c.border,
    padding: spacing.md,
  },
  statItem:    { flex: 1, alignItems: 'center' },
  statValue:   { fontSize: fontSizes.md, fontWeight: '800' },
  statLabel:   { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: c.border },

  // Earn card
  sectionCard: {
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    backgroundColor: c.bg.card,
    borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, padding: spacing.md,
  },
  cardTitle: { fontSize: fontSizes.sm, fontWeight: '700', color: c.text.primary, marginBottom: 12 },
  earnGrid:  { flexDirection: 'row', gap: 8 },
  earnItem: {
    flex: 1, backgroundColor: c.bg.elevated,
    borderRadius: radii.md, padding: 10, alignItems: 'center', gap: 4,
  },
  earnEmoji: { fontSize: 22 },
  earnLabel: { fontSize: fontSizes.xs, color: c.text.secondary, textAlign: 'center' },
  earnXp:    { fontSize: fontSizes.xs, color: c.xpGold, fontWeight: '700' },

  // Rate card
  rateCard: { marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radii.lg, overflow: 'hidden' },
  rateCardInner: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.md,
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)', borderRadius: radii.lg,
  },
  rateLeft:  { flex: 1 },
  rateTitle: { fontSize: fontSizes.md, fontWeight: '700', color: c.xpGold },
  rateSub:   { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 2 },
  rateBtn: {
    backgroundColor: 'rgba(251,191,36,0.18)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)',
    borderRadius: radii.full, paddingHorizontal: 14, paddingVertical: 7,
  },
  rateBtnText: { fontSize: fontSizes.xs, fontWeight: '700', color: c.xpGold },

  // Transactions
  txnHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, marginBottom: 6,
  },
  txnTitle:  { fontSize: fontSizes.md, fontWeight: '700', color: c.text.primary },
  txnSeeAll: { fontSize: fontSizes.xs, color: c.primaryLight },
  txnFilters: { paddingHorizontal: spacing.lg, gap: 8, marginBottom: spacing.md },
  txnChip: {
    paddingVertical: 5, paddingHorizontal: 14,
    borderRadius: radii.full, borderWidth: 1, borderColor: c.border,
  },
  txnChipActive:    { backgroundColor: 'rgba(124,58,237,0.18)', borderColor: c.primary },
  txnChipText:      { fontSize: fontSizes.xs, color: c.text.muted, fontWeight: '600' },
  txnChipTextActive: { color: c.primaryLight },
  txnList: {
    marginHorizontal: spacing.lg,
    backgroundColor: c.bg.card,
    borderRadius: radii.lg, borderWidth: 1, borderColor: c.border,
    paddingHorizontal: spacing.md, overflow: 'hidden',
  },
  txnRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  txnIcon:     { width: 40, height: 40, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  txnInfo:     { flex: 1 },
  txnRowTitle: { fontSize: fontSizes.sm, color: c.text.primary, fontWeight: '500' },
  txnDate:     { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 1 },
  txnAmtCol:   { alignItems: 'flex-end' },
  txnAmt:      { fontSize: fontSizes.sm, fontWeight: '700' },
  txnTypeBadge: { fontSize: 9, color: c.text.muted, fontWeight: '600', textTransform: 'uppercase', marginTop: 2 },
  txnEmpty:    { padding: 24, alignItems: 'center' },
  txnEmptyText: { color: c.text.muted, fontSize: fontSizes.sm },
  viewAllBtn:  { alignItems: 'center', padding: spacing.md },
  viewAllText: { color: c.primaryLight, fontSize: fontSizes.sm, fontWeight: '600' },

  // Modal shell
  modalShell:  { flex: 1, backgroundColor: c.bg.base },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  modalTitle:     { fontSize: fontSizes.lg, fontWeight: '700', color: c.text.primary },
  modalActionBtn: { paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radii.full },
  modalActionText: { fontSize: fontSizes.sm, fontWeight: '700', color: '#fff' },
  modalBody:      { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },

  // Shared form
  balanceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(124,58,237,0.1)',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.25)',
    borderRadius: radii.full, paddingHorizontal: 12, paddingVertical: 5,
  },
  balanceChipText: { fontSize: fontSizes.xs, fontWeight: '600', color: c.primaryLight },
  fieldLabel: { fontSize: fontSizes.sm, fontWeight: '700', color: c.text.secondary },
  amountInput: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.bg.card,
    borderWidth: 1, borderColor: c.border,
    borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 12,
  },
  amountInputError: { borderColor: c.danger },
  rupeePre:    { fontSize: fontSizes.xl, fontWeight: '700', color: c.text.secondary },
  amountField: { flex: 1, fontSize: 28, fontWeight: '800', color: c.text.primary, paddingVertical: 0 },
  errorText:   { fontSize: fontSizes.xs, color: c.danger, marginTop: -8 },
  quickRow:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  quickChip: {
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: radii.full, borderWidth: 1, borderColor: c.border,
    backgroundColor: c.bg.card,
  },
  quickChipActive:    { borderColor: c.primaryLight, backgroundColor: 'rgba(124,58,237,0.15)' },
  quickChipText:      { fontSize: fontSizes.xs, fontWeight: '600', color: c.text.muted },
  quickChipTextActive: { color: c.primaryLight },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  infoText: { flex: 1, fontSize: fontSizes.xs, color: c.text.muted, lineHeight: 17 },

  // Withdraw modal
  linkedUPIRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.bg.card,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: radii.md, padding: spacing.md,
  },
  linkedUPILeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  upiDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.success },
  linkedUPIText: { fontSize: fontSizes.md, color: c.text.primary, fontWeight: '500' },
  changeLink:    { fontSize: fontSizes.sm, color: c.primaryLight, fontWeight: '600' },
  noUPIRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(124,58,237,0.08)',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.25)', borderStyle: 'dashed',
    borderRadius: radii.md, padding: spacing.md,
  },
  noUPIText: { flex: 1, fontSize: fontSizes.sm, color: c.primaryLight },

  // Link UPI modal
  upiAppRow:  { flexDirection: 'row', gap: 10 },
  upiAppBtn: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: c.bg.card,
    borderWidth: 1, borderColor: c.border,
    borderRadius: radii.md, paddingVertical: 10,
  },
  upiAppName: { fontSize: fontSizes.xs, color: c.text.secondary, fontWeight: '600' },
  upiInput: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.bg.card,
    borderWidth: 1, borderColor: c.border,
    borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 12,
  },
  upiInputVerified: { borderColor: c.success },
  upiTextField:  { flex: 1, fontSize: fontSizes.md, color: c.text.primary, paddingVertical: 0 },
  verifyingText: { fontSize: fontSizes.xs, color: c.text.muted },
  verifiedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: radii.md, padding: spacing.md,
  },
  verifiedBannerText: { fontSize: fontSizes.sm, color: c.success, fontWeight: '600' },

  // Convert modal
  rateBanner: {
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)',
    borderRadius: radii.md, padding: spacing.md, alignItems: 'center',
  },
  rateBannerText: { fontSize: fontSizes.lg, fontWeight: '800', color: c.xpGold },
  rateBannerSub:  { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 3 },
  convertPreview: {
    borderRadius: radii.md, padding: spacing.md,
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)',
  },
  convertPreviewRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convertPreviewSide: { alignItems: 'center', gap: 4 },
  convertPreviewLabel: { fontSize: fontSizes.xs, color: c.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  convertPreviewXP:   { fontSize: fontSizes.md, fontWeight: '700', color: c.xpGold },
  convertPreviewCash: { fontSize: fontSizes.md, fontWeight: '700', color: c.success },

  // History modal
  histDateLabel: {
    fontSize: fontSizes.xs, color: c.text.muted, fontWeight: '700',
    textTransform: 'uppercase', paddingHorizontal: spacing.lg,
    marginTop: spacing.md, marginBottom: 6,
  },

  // Settings modal
  settingsSection: {
    fontSize: fontSizes.xs, fontWeight: '700', color: c.text.muted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: 6,
  },
  settingsCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: c.bg.card,
    borderRadius: radii.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md,
  },
  settingsRowLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingsRowIcon:  { fontSize: 20 },
  settingsRowLabel: { fontSize: fontSizes.sm, fontWeight: '600', color: c.text.primary },
  settingsRowDesc:  { fontSize: fontSizes.xs, color: c.text.muted, marginTop: 2 },
  aboutRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    padding: spacing.md,
  },
  aboutLabel: { fontSize: fontSizes.sm, color: c.text.secondary },
  aboutValue: { fontSize: fontSizes.sm, fontWeight: '600', color: c.text.primary },
});
}
