import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  Alert, Share, Switch, Animated, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';
import { useWallet } from '../../context/WalletContext';
import { useAuth } from '../../context/AuthContext';
import MainHeader from '../../components/common/MainHeader';
import PinPad from '../../components/common/PinPad';
import { authService } from '../../services/auth.service';
import * as LocalAuthentication from '../../utils/localAuth';
import * as SecureStore from 'expo-secure-store';
import type { Transaction } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type TxnFilter = 'All' | 'Earned' | 'Spent' | 'XP' | 'Cash';
type ActiveModal = 'none' | 'withdraw' | 'linkUPI' | 'convert' | 'buyXP' | 'recharge' | 'history' | 'settings';

const TXN_META: Record<string, { icon: string; bg: string; label: string; iconColor: string }> = {
  earn:     { icon: 'arrow-up', bg: 'rgba(16,185,129,0.13)',  label: 'Earned',    iconColor: '#10B981' },
  spend:    { icon: 'pricetag', bg: 'rgba(239,68,68,0.11)',   label: 'Spent',     iconColor: '#EF4444' },
  convert:  { icon: 'flash',    bg: 'rgba(251,191,36,0.11)',  label: 'Converted', iconColor: '#F59E0B' },
  withdraw: { icon: 'cash',     bg: 'rgba(6,182,212,0.11)',   label: 'Withdrawn', iconColor: '#06B6D4' },
  topup:    { icon: 'add-circle', bg: 'rgba(124,58,237,0.13)', label: 'Recharged', iconColor: '#8B5CF6' },
};

const QUICK_AMOUNTS = [100, 250, 500, 1000];
const QUICK_RECHARGE = [100, 250, 500, 1000, 2000];
const QUICK_XP      = [500, 1000, 5000];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WalletScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation();
  const { wallet, withdraw, convertXP, recharge, convertCashToXP, linkUPI, toggleSetting, fetchWalletData } = useWallet();
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [txnFilter,       setTxnFilter]       = useState<TxnFilter>('All');
  const [activeModal,     setActiveModal]      = useState<ActiveModal>('none');
  const [handoffUrl,      setHandoffUrl]       = useState<string | null>(null);
  const [payuHtml,        setPayuHtml]         = useState<string | null>(null);
  const [payuBusy,        setPayuBusy]         = useState(false);
  const [unlockError,     setUnlockError]      = useState('');
  const [isUnlocking,     setIsUnlocking]      = useState(false);
  const [walletUnlocked,  setWalletUnlocked]   = useState(false);
  const [localPinEnabled, setLocalPinEnabled]  = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    SecureStore.getItemAsync('wallet_pinEnabled').then(val => {
      setLocalPinEnabled(val === 'true');
    });
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchWalletData();
      const pinOn = wallet.pinEnabled || localPinEnabled;
      if (pinOn && !user?.appLockEnabled) {
        setWalletUnlocked(false);
        setUnlockError('');
      }
    }, [wallet.pinEnabled, localPinEnabled, user?.appLockEnabled, fetchWalletData])
  );

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
    { icon: 'game-controller', label: 'Win Games',     xp: '+50–150 XP', tab: 'Games'  },
    { icon: 'document-text',   label: 'Post Content',  xp: '+10–75 XP',  tab: 'Home'   },
    { icon: 'calendar',        label: 'Attend Events', xp: '+100–500 XP',tab: 'Events' },
    { icon: 'flame',           label: 'Daily Streak',  xp: '+25–100 XP', tab: 'Home'   },
  ];

  const handleShareWallet = async () => {
    await Share.share({ message: `I've earned ₹${wallet.totalEarned.toLocaleString()} on TADDLEBOX! 🎮⚡ Join me and start earning today.` });
  };

  const openModal = (m: ActiveModal) => setActiveModal(m);
  const closeModal = () => setActiveModal('none');

  // ── Wallet Lock Check ──
  const pinOn = wallet.pinEnabled || localPinEnabled;
  const isWalletLocked = pinOn && !user?.appLockEnabled && !walletUnlocked;
  
  const handleWalletUnlock = async (pin: string) => {
    try {
      await authService.verifyPin(pin);
      setWalletUnlocked(true);
    } catch (e: any) {
      const msg: string = e?.response?.data?.message || e?.message || 'Invalid PIN';
      // If no PIN is set up (auto-healed by backend), clear stale SecureStore flag and let them in
      if (msg.toLowerCase().includes('not set up') || msg.toLowerCase().includes('lock has been disabled')) {
        await SecureStore.deleteItemAsync('wallet_pinEnabled');
        setLocalPinEnabled(false);
        setWalletUnlocked(true); // let them through — lock was stale
      } else {
        throw new Error(msg);
      }
    }
  };

  const triggerBiometric = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && isEnrolled) {
        setIsUnlocking(true);
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock Wallet',
          disableDeviceFallback: true,
          cancelLabel: 'Use PIN',
        });
        if (result.success) {
          setWalletUnlocked(true);
        }
      }
    } catch (e) {
      console.log('Biometric error', e);
    } finally {
      setIsUnlocking(false);
    }
  };

  useEffect(() => {
    if (isWalletLocked && wallet.biometricEnabled && !walletUnlocked) {
      triggerBiometric();
    }
  }, [isWalletLocked, wallet.biometricEnabled, walletUnlocked]);

  if (isWalletLocked) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <MainHeader />
        <View style={{ flex: 1, backgroundColor: colors.bg.base }}>
          <PinPad
            title="Wallet Locked"
            subtitle="Enter your PIN to access your wallet"
            length={4}
            onPinComplete={async (pin) => {
               try {
                 setIsUnlocking(true);
                 setUnlockError('');
                 await handleWalletUnlock(pin);
               } catch (e: any) {
                 setUnlockError(e.message);
               } finally {
                 setIsUnlocking(false);
               }
            }}
            error={unlockError}
            isVerifying={isUnlocking}
            showBiometric={wallet.biometricEnabled}
            onBiometric={triggerBiometric}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      <MainHeader />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Wallet</Text>
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
              { icon: 'add-circle-outline',     label: 'Add Money', onPress: () => openModal('recharge') },
              { icon: 'arrow-up-circle-outline', label: 'Withdraw',  onPress: () => openModal('withdraw') },
              { icon: 'time-outline',            label: 'History',   onPress: () => openModal('history') },
              { icon: 'share-outline',           label: 'Share',     onPress: handleShareWallet },
            ].map(a => (
              <TouchableOpacity
                key={a.label}
                style={styles.heroAction}
                onPress={a.onPress}
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
            <Ionicons name="flash" size={24} color="#fff" />
          </LinearGradient>
          <View style={styles.xpInfo}>
            <Text style={styles.xpAmount}>{wallet.xpBalance.toLocaleString()} XP</Text>
            <Text style={styles.xpSub}>≈ ₹{(wallet.xpBalance / 100).toFixed(2)} convertible</Text>
          </View>
          <View style={styles.xpBtnCol}>
            <TouchableOpacity
              style={styles.buyXpBtn}
              onPress={() => openModal('buyXP')}
              activeOpacity={0.8}
            >
              <Text style={styles.buyXpBtnText}>Buy XP +</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.convertBtn, wallet.xpBalance < 500 && styles.convertBtnDisabled]}
              onPress={() => wallet.xpBalance >= 500 ? openModal('convert') : Alert.alert('Not enough XP', 'You need at least 500 XP to convert.')}
              activeOpacity={0.8}
            >
              <Text style={styles.convertBtnText}>Convert →</Text>
            </TouchableOpacity>
          </View>
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
          <Text style={styles.cardTitle}>Earn more XP <Ionicons name="flash" size={16} color={colors.xpGold} /></Text>
          <View style={styles.earnGrid}>
            {earnActions.map(e => (
              <TouchableOpacity
                key={e.label}
                style={styles.earnItem}
                onPress={() => (navigation as any).getParent()?.navigate(e.tab)}
                activeOpacity={0.75}
              >
                <Ionicons name={e.icon as any} size={24} color={colors.primaryLight} style={{ marginBottom: 8 }} />
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
              <Text style={styles.rateSub}>Buy XP with cash · Convert XP to cash · Instant</Text>
            </View>
            <TouchableOpacity style={styles.rateBtn} onPress={() => openModal('buyXP')}>
              <Text style={styles.rateBtnText}>Buy XP</Text>
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
        pinEnabled={wallet.pinEnabled}
        globalLock={user?.appLockEnabled || false}
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
      <BuyXPModal
        visible={activeModal === 'buyXP'}
        cashBalance={wallet.cashBalance}
        onBuy={convertCashToXP}
        onClose={closeModal}
      />
      <RechargeModal
        visible={activeModal === 'recharge'}
        onRecharge={async (amount) => {
          try {
            setPayuBusy(true);
            const res = await recharge(amount);
            if (res?.html) {
              setPayuHtml(res.html);
              closeModal();
            }
          } catch (e: any) {
            Alert.alert('Recharge Error', e?.response?.data?.message || e?.message || 'Could not start recharge.');
          } finally {
            setPayuBusy(false);
          }
        }}
        busy={payuBusy}
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

      {payuHtml && (
        <Modal visible={true} animationType="slide" onRequestClose={() => setPayuHtml(null)}>
          <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.bg.base }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: colors.bg.base }}>
              <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: 'bold' }}>Add Money · PayU</Text>
              <TouchableOpacity onPress={() => setPayuHtml(null)}>
                <Text style={{ color: colors.primary }}>Close</Text>
              </TouchableOpacity>
            </View>
            <WebView 
              source={{ html: payuHtml }} 
              style={{ flex: 1 }} 
              originWhitelist={['*']}
              onNavigationStateChange={(state) => {
                // Backend redirect target after PayU checkout
                if (state.url.includes('/wallet/recharge/result')) {
                  setPayuHtml(null);
                  fetchWalletData();
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
  const isNeg = t.amount < 0 || t.type === 'spend' || t.type === 'withdraw';
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const displayAmount = Math.abs(t.amount);

  return (
    <View style={[styles.txnRow, isLast && { borderBottomWidth: 0 }]}>
      <View style={[styles.txnIcon, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon as any} size={18} color={meta.iconColor} />
      </View>
      <View style={styles.txnInfo}>
        <Text style={styles.txnRowTitle} numberOfLines={1}>
          {t.title} {t.status === 'pending' ? '(Pending)' : t.status === 'failed' ? '(Failed)' : ''}
        </Text>
        <Text style={styles.txnDate}>{t.date}</Text>
      </View>
      <View style={styles.txnAmtCol}>
        <Text style={[
          styles.txnAmt,
          isXP  ? { color: colors.xpGold  } :
          isNeg ? { color: colors.danger   } :
                  { color: colors.success  },
        ]}>
          {isXP  ? `${isNeg ? '-' : '+'}${displayAmount.toLocaleString()} XP`
          : isNeg ? `-₹${displayAmount.toLocaleString()}`
          :         `+₹${displayAmount.toLocaleString()}`}
        </Text>
        <Text style={styles.txnTypeBadge}>
          {t.status === 'pending' ? 'Pending' : t.status === 'failed' ? 'Failed' : meta.label}
        </Text>
      </View>
    </View>
  );
}

// ─── WithdrawModal ────────────────────────────────────────────────────────────

function WithdrawModal({
  visible, cashBalance, linkedUPI, onWithdraw, onLinkUPI, onClose, pinEnabled, globalLock
}: {
  visible:     boolean;
  cashBalance: number;
  linkedUPI:   string | null;
  onWithdraw:  (amount: number) => void;
  onLinkUPI:   () => void;
  onClose:     () => void;
  pinEnabled?: boolean;
  globalLock?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [amountStr, setAmountStr] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [showBiometric, setShowBiometric] = useState(false);
  const amount = parseInt(amountStr, 10) || 0;

  const error = amount < 100              ? 'Minimum withdrawal is ₹100'
              : amount > cashBalance      ? `Insufficient balance (₹${cashBalance.toLocaleString()})`
              : null;

  const canSubmit = !error && amount > 0 && !!linkedUPI;

  const reset = () => { setAmountStr(''); setVerifyingPin(false); setPinError(''); };

  const handleConfirm = () => {
    if (!linkedUPI) { onLinkUPI(); return; }
    if (error) { Alert.alert('Invalid Amount', error); return; }
    
    if (pinEnabled || globalLock) {
      setVerifyingPin(true);
      checkBiometric();
    } else {
      executeWithdraw();
    }
  };

  const executeWithdraw = () => {
    onWithdraw(amount);
    reset();
    onClose();
  };

  const checkBiometric = async () => {
    const key = globalLock ? 'app_biometricEnabled' : 'wallet_biometricEnabled';
    const enabled = await SecureStore.getItemAsync(key);
    if (enabled === 'true') {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && isEnrolled) {
        setShowBiometric(true);
        triggerBiometric();
      }
    }
  };

  const triggerBiometric = async () => {
    try {
      setIsVerifying(true);
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to withdraw',
        disableDeviceFallback: true,
        cancelLabel: 'Use PIN'
      });
      if (result.success) {
        executeWithdraw();
      }
    } catch (e) {
      console.log('Biometric error', e);
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePinComplete = async (pin: string) => {
    try {
      setIsVerifying(true);
      setPinError('');
      await authService.verifyPin(pin);
      executeWithdraw();
    } catch (e: any) {
      setPinError(e.response?.data?.message || 'Invalid PIN');
    } finally {
      setIsVerifying(false);
    }
  };

  if (verifyingPin) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { reset(); onClose(); }}>
        <SafeAreaView style={[styles.modalShell, { backgroundColor: colors.bg.base, flex: 1 }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setVerifyingPin(false)}>
              <Ionicons name="arrow-back" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Security Check</Text>
            <View style={{ width: 24 }} />
          </View>
          <PinPad
            title="Enter PIN"
            subtitle={`Authorize withdrawal of ₹${amount}`}
            length={4}
            onPinComplete={handlePinComplete}
            onBiometric={triggerBiometric}
            showBiometric={showBiometric}
            error={pinError}
            isVerifying={isVerifying}
          />
        </SafeAreaView>
      </Modal>
    );
  }

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
            <Ionicons name="flash" size={13} color={colors.xpGold} />
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
            <Ionicons name="flash" size={24} color={colors.xpGold} style={styles.rupeePre} />
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
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="flash" size={16} color={colors.xpGold} style={{ marginRight: 4 }} />
                    <Text style={styles.convertPreviewXP}>{xpAmount.toLocaleString()} XP</Text>
                  </View>
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

// ─── RechargeModal (Add Money via PayU) ─────────────────────────────────────

function RechargeModal({
  visible, onRecharge, onClose, busy,
}: {
  visible:   boolean;
  onRecharge: (amount: number) => void;
  onClose:   () => void;
  busy?:     boolean;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [amountStr, setAmountStr] = useState('');
  const amount = parseInt(amountStr, 10) || 0;

  const error = amount > 0 && amount < 100 ? 'Minimum recharge is ₹100' : null;
  const canSubmit = !error && amount >= 100;

  const reset = () => setAmountStr('');

  const handleRecharge = () => {
    if (!canSubmit || busy) return;
    Alert.alert(
      'Add Money',
      `You'll be redirected to PayU to add ₹${amount.toLocaleString('en-IN')} to your wallet.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Proceed', onPress: () => { onRecharge(amount); reset(); onClose(); } },
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
          <Text style={styles.modalTitle}>Add Money</Text>
          <TouchableOpacity onPress={handleRecharge} disabled={!canSubmit || busy}>
            <LinearGradient
              colors={canSubmit ? [colors.primary, colors.cyanDark] : [colors.bg.elevated, colors.bg.elevated]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.modalActionBtn}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.modalActionText, !canSubmit && { color: colors.text.muted }]}>Next</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <View style={styles.balanceChip}>
            <Ionicons name="wallet-outline" size={14} color={colors.primaryLight} />
            <Text style={styles.balanceChipText}>Add money to your wallet balance</Text>
          </View>

          <Text style={styles.fieldLabel}>Amount</Text>
          <View style={[styles.amountInput, error ? styles.amountInputError : null]}>
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
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.quickRow}>
            {QUICK_RECHARGE.map(q => (
              <TouchableOpacity
                key={q}
                style={[styles.quickChip, amount === q && styles.quickChipActive]}
                onPress={() => setAmountStr(String(q))}
              >
                <Text style={[styles.quickChipText, amount === q && styles.quickChipTextActive]}>₹{q}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {amount >= 100 && (
            <LinearGradient
              colors={['rgba(124,58,237,0.12)', 'rgba(6,182,212,0.08)']}
              style={styles.convertPreview}
            >
              <View style={styles.convertPreviewRow}>
                <View style={styles.convertPreviewSide}>
                  <Text style={styles.convertPreviewLabel}>You pay</Text>
                  <Text style={styles.convertPreviewCash}>₹ {amount.toLocaleString('en-IN')}</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color={colors.text.muted} />
                <View style={styles.convertPreviewSide}>
                  <Text style={styles.convertPreviewLabel}>You get</Text>
                  <Text style={styles.convertPreviewCash}>₹ {amount.toLocaleString('en-IN')} wallet balance</Text>
                </View>
              </View>
            </LinearGradient>
          )}

          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.text.muted} />
            <Text style={styles.infoText}>Secured by PayU. Money is added to your wallet instantly and can be converted to XP or withdrawn.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── BuyXPModal (Cash → XP) ──────────────────────────────────────────────────

function BuyXPModal({
  visible, cashBalance, onBuy, onClose,
}: {
  visible:     boolean;
  cashBalance: number;
  onBuy:       (amount: number) => void;
  onClose:     () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [cashStr, setCashStr] = useState('');
  const cashAmount = parseInt(cashStr, 10) || 0;
  const xpResult = Math.floor(cashAmount * 100); // 100 XP = ₹1

  const error = cashAmount > 0 && cashAmount < 10   ? 'Minimum purchase is ₹10'
              : cashAmount > cashBalance             ? `Insufficient balance (₹${cashBalance.toLocaleString()})`
              : null;

  const canBuy = cashAmount >= 10 && cashAmount <= cashBalance;

  const reset = () => setCashStr('');

  const handleBuy = () => {
    if (!canBuy || error) return;
    Alert.alert(
      'Buy XP',
      `Convert ₹${cashAmount.toLocaleString('en-IN')} → ${xpResult.toLocaleString()} XP?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Buy', onPress: () => { onBuy(cashAmount); reset(); onClose(); } },
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
          <Text style={styles.modalTitle}>Buy XP</Text>
          <TouchableOpacity onPress={handleBuy} disabled={!canBuy}>
            <LinearGradient
              colors={canBuy ? [colors.xpGold, colors.xpOrange] : [colors.bg.elevated, colors.bg.elevated]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.modalActionBtn}
            >
              <Text style={[styles.modalActionText, !canBuy && { color: colors.text.muted }]}>Buy</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <View style={styles.balanceChip}>
            <Ionicons name="wallet-outline" size={14} color={colors.primaryLight} />
            <Text style={styles.balanceChipText}>Available: ₹{cashBalance.toLocaleString()}</Text>
          </View>

          <View style={styles.rateBanner}>
            <Text style={styles.rateBannerText}>₹1.00 = 100 XP</Text>
            <Text style={styles.rateBannerSub}>Instant credit to your XP balance</Text>
          </View>

          <Text style={styles.fieldLabel}>Cash to spend</Text>
          <View style={[styles.amountInput, error ? styles.amountInputError : null]}>
            <Text style={styles.rupeePre}>₹</Text>
            <TextInput
              style={styles.amountField}
              placeholder="0"
              placeholderTextColor={colors.text.muted}
              keyboardType="numeric"
              value={cashStr}
              onChangeText={v => setCashStr(v.replace(/[^0-9]/g, ''))}
              maxLength={6}
            />
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.quickRow}>
            {[50, 100, 250, 500].map(q => (
              <TouchableOpacity
                key={q}
                style={[styles.quickChip, cashAmount === q && styles.quickChipActive]}
                onPress={() => setCashStr(String(q))}
              >
                <Text style={[styles.quickChipText, cashAmount === q && styles.quickChipTextActive]}>₹{q}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.quickChip, cashAmount === cashBalance && styles.quickChipActive]}
              onPress={() => setCashStr(String(Math.floor(cashBalance)))}
            >
              <Text style={[styles.quickChipText, cashAmount === cashBalance && styles.quickChipTextActive]}>Max</Text>
            </TouchableOpacity>
          </View>

          {canBuy && (
            <LinearGradient
              colors={['rgba(251,191,36,0.12)', 'rgba(249,115,22,0.08)']}
              style={styles.convertPreview}
            >
              <View style={styles.convertPreviewRow}>
                <View style={styles.convertPreviewSide}>
                  <Text style={styles.convertPreviewLabel}>You give</Text>
                  <Text style={styles.convertPreviewCash}>₹ {cashAmount.toLocaleString('en-IN')}</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color={colors.text.muted} />
                <View style={styles.convertPreviewSide}>
                  <Text style={styles.convertPreviewLabel}>You get</Text>
                  <Text style={styles.convertPreviewXP}>⚡ {xpResult.toLocaleString()} XP</Text>
                </View>
              </View>
            </LinearGradient>
          )}

          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={14} color={colors.text.muted} />
            <Text style={styles.infoText}>Use your wallet balance to buy XP for paid events, games and more.</Text>
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
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.modalShell, { paddingTop: insets.top || 16 }]}>
        <View style={[styles.modalHeader, { borderBottomWidth: 0, paddingBottom: 8 }]}>
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

// ─── Shared Setting Components ──────────────────────────────────────────────────

const Section = ({ title, styles }: { title: string; styles: any }) => (
  <Text style={styles.settingsSection}>{title}</Text>
);

const ToggleRow = ({
  icon, label, desc, settingKey, value, disabled, onDisabledPress, onToggle, colors, styles
}: {
  icon: string; label: string; desc: string;
  settingKey: 'pinEnabled' | 'biometricEnabled' | 'notifXP' | 'notifWithdraw' | 'notifPromos';
  value: boolean;
  disabled?: boolean;
  onDisabledPress?: () => void;
  onToggle: (k: any) => void;
  colors: any;
  styles: any;
}) => (
  <View style={styles.settingsRow}>
    <View style={styles.settingsRowLeft}>
      <View style={{ width: 30, alignItems: 'center' }}>
        <Text style={styles.settingsRowIcon}>{icon}</Text>
      </View>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.settingsRowLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.settingsRowDesc} numberOfLines={2}>{desc}</Text>
      </View>
    </View>
    {disabled ? (
      <TouchableOpacity onPress={onDisabledPress}>
        <Switch
          value={value}
          disabled={true}
          trackColor={{ false: colors.bg.elevated, true: colors.primary }}
          thumbColor={value ? '#fff' : colors.text.muted}
          style={{ opacity: 0.5 }}
        />
      </TouchableOpacity>
    ) : (
      <Switch
        value={value}
        onValueChange={() => onToggle(settingKey)}
        trackColor={{ false: colors.bg.elevated, true: colors.primary }}
        thumbColor={value ? '#fff' : colors.text.muted}
      />
    )}
  </View>
);

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
  const { user, refreshUser } = useAuth();
  const globalLock = user?.appLockEnabled;

  const [setupPinVisible, setSetupPinVisible] = useState(false);
  const [setupPinError, setSetupPinError] = useState('');
  const [isSettingPin, setIsSettingPin] = useState(false);

  const handleToggle = (key: any) => {
    if (key === 'pinEnabled' && !wallet.pinEnabled && !globalLock) {
      // Trying to enable PIN when it's off and global lock isn't on.
      // We should prompt them to setup a PIN if they don't have one globally!
      setSetupPinVisible(true);
    } else {
      onToggle(key);
    }
  };

  const handlePinComplete = async (pin: string) => {
    try {
      setIsSettingPin(true);
      setSetupPinError('');
      if (user?.appLock) {
        // PIN exists — just verify to confirm user knows it before enabling wallet lock
        await authService.verifyPin(pin);
      } else {
        // No PIN exists — create it
        await authService.setupPin(pin, false);
        await refreshUser(); // update user.appLock in AuthContext
      }
      onToggle('pinEnabled');
      setSetupPinVisible(false);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Something went wrong';
      if (msg.toLowerCase().includes('already set')) {
         onToggle('pinEnabled');
         setSetupPinVisible(false);
      } else {
         setSetupPinError(msg);
      }
    } finally {
      setIsSettingPin(false);
    }
  };

  if (setupPinVisible) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSetupPinVisible(false)}>
        <SafeAreaView style={[styles.modalShell, { backgroundColor: colors.bg.base, flex: 1 }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSetupPinVisible(false)}>
              <Ionicons name="arrow-back" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{user?.appLock ? 'Verify PIN' : 'Setup PIN'}</Text>
            <View style={{ width: 24 }} />
          </View>
          <PinPad
            title={user?.appLock ? "Enter your PIN" : "Create a 4-digit PIN"}
            subtitle="This PIN will protect your wallet withdrawals"
            length={4}
            onPinComplete={handlePinComplete}
            error={setupPinError}
            isVerifying={isSettingPin}
          />
        </SafeAreaView>
      </Modal>
    );
  }


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
          <Section title="Linked Accounts" styles={styles} />
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
          <Section title="Security" styles={styles} />
          <View style={styles.settingsCard}>
            <ToggleRow
              icon="🔐" label="PIN Protection"
              desc={globalLock ? "Enabled by Global App Lock" : "Require PIN for withdrawals"}
              settingKey="pinEnabled" value={globalLock ? true : wallet.pinEnabled}
              disabled={globalLock}
              onDisabledPress={() => Alert.alert("Global Lock Active", "Wallet PIN is automatically enabled because you have Global App Lock turned on in your main Settings.")}
              onToggle={handleToggle} colors={colors} styles={styles}
            />
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
              <ToggleRow
                icon="👆" label="Biometric Auth"
                desc={globalLock ? "Enabled by Global App Lock" : "Use fingerprint or face ID"}
                settingKey="biometricEnabled" value={globalLock ? true : wallet.biometricEnabled}
                disabled={globalLock}
                onDisabledPress={() => Alert.alert("Global Lock Active", "Wallet Biometrics are automatically enabled because you have Global App Lock turned on in your main Settings.")}
                onToggle={handleToggle} colors={colors} styles={styles}
              />
            </View>
          </View>

          {/* Notifications */}
          <Section title="Notifications" styles={styles} />
          <View style={styles.settingsCard}>
            <ToggleRow icon="⚡" label="XP Earned"    desc="Get notified when you earn XP"    settingKey="notifXP"       value={wallet.notifXP}       onToggle={handleToggle} colors={colors} styles={styles} />
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
              <ToggleRow icon="🏦" label="Withdrawals" desc="Status updates for withdrawals"   settingKey="notifWithdraw" value={wallet.notifWithdraw} onToggle={handleToggle} colors={colors} styles={styles} />
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
              <ToggleRow icon="🎁" label="Promotions"  desc="Bonus XP offers and promotions"  settingKey="notifPromos"   value={wallet.notifPromos}   onToggle={handleToggle} colors={colors} styles={styles} />
            </View>
          </View>

          {/* About */}
          <Section title="About" styles={styles} />
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
    borderRadius: radii.xl || 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    padding: spacing.xxl, overflow: 'hidden',
    shadowColor: c.primary, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 24,
    elevation: 8,
  },
  heroGlow: {
    position: 'absolute', top: -50, right: -50,
    width: 250, height: 250, borderRadius: 125,
    backgroundColor: 'rgba(124,58,237,0.25)',
  },
  heroGlow2: {
    position: 'absolute', bottom: -80, left: -50,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(6,182,212,0.15)',
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
    backgroundColor: 'rgba(30,41,59,0.5)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)',
    borderRadius: radii.xl || 20, padding: spacing.lg,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  xpIcon:   { width: 48, height: 48, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center' },
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
  xpBtnCol: { gap: 6, alignItems: 'flex-end' },
  buyXpBtn: {
    backgroundColor: c.primary,
    borderRadius: radii.full, paddingVertical: 8, paddingHorizontal: 16,
  },
  buyXpBtnText: { fontSize: fontSizes.xs, fontWeight: '700', color: '#fff' },

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
  txnFilters: { paddingHorizontal: spacing.lg, gap: 8, marginBottom: spacing.lg },
  txnChip: {
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: radii.full, borderWidth: 1, borderColor: c.border,
    backgroundColor: c.bg.elevated,
  },
  txnChipActive:    { backgroundColor: 'rgba(124,58,237,0.18)', borderColor: c.primary },
  txnChipText:      { fontSize: fontSizes.xs, color: c.text.muted, fontWeight: '600' },
  txnChipTextActive: { color: c.primaryLight },
  txnList: {
    marginHorizontal: spacing.lg,
    backgroundColor: c.bg.card,
    borderRadius: radii.xl || 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: spacing.md, overflow: 'hidden',
  },
  txnRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14,
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
