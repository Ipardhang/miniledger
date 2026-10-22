import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError } from '../api';
import Button from '../components/Button';
import { colors } from '../theme';

const PHONE_RE = /^\+?[1-9]\d{9,14}$/;
export default function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState(''); const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const cleanPhone = phone.replace(/[\s-]/g, '');
  async function run(fn: () => Promise<void>) { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong'); } finally { setBusy(false); } }
  function sendOtp() { if (!PHONE_RE.test(cleanPhone)) { setError('Enter a valid phone number (10–15 digits, optional +)'); return; } run(async () => { await api.requestOtp(cleanPhone); setOtp(''); setStep('otp'); }); }
  function verify() { if (!/^\d{6}$/.test(otp)) { setError('Enter the 6-digit OTP'); return; } run(async () => { await api.verifyOtp(cleanPhone, otp); onLoggedIn(); }); }
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.top}><View style={styles.brandMark}><Text style={styles.brandMarkText}>m</Text></View><Text style={styles.kicker}>PERSONAL LENDING, SIMPLIFIED</Text></View>
    <View style={styles.hero}><Text style={styles.title}>{step === 'phone' ? 'Money matters.\nKeep them clear.' : 'One quick check.\nThen you’re in.'}</Text><Text style={styles.subtitle}>{step === 'phone' ? 'A calmer way to track what you lend, what comes back, and what’s still due.' : 'Enter the verification code printed in your backend terminal to securely continue.'}</Text></View>
    <View style={styles.formCard}>
      {step === 'phone' ? <><Text style={styles.label}>PHONE NUMBER</Text><TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" placeholderTextColor="#9AA79F" keyboardType="phone-pad" autoFocus /><Text style={styles.helper}>We’ll send a demo verification code.</Text><Button title="Continue with phone  →" onPress={sendOtp} busy={busy} /></> : <><Text style={styles.label}>6-DIGIT VERIFICATION CODE</Text><Text style={styles.hint}>Demo mode: the OTP for {cleanPhone} is printed in the server log.</Text><TextInput style={[styles.input, styles.otp]} value={otp} onChangeText={t => setOtp(t.replace(/\D/g, '').slice(0, 6))} placeholder="• • • • • •" placeholderTextColor="#9AA79F" keyboardType="number-pad" maxLength={6} autoFocus /><Button title="Verify & open ledger  →" onPress={verify} busy={busy} /><Pressable onPress={() => { setError(''); setStep('phone'); }} style={styles.backBtn}><Text style={styles.backText}>Use a different number</Text></Pressable></>}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
    <View style={styles.footer}><View style={styles.footerLine} /><Text style={styles.footerText}>PRIVATE BY DESIGN · SIMPLE BY NATURE</Text><Text style={styles.footerNote}>Track it. Settle it. Move on.</Text></View>
  </KeyboardAvoidingView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg }, container: { flex: 1, justifyContent: 'center', paddingHorizontal: 25, paddingVertical: 28 },
  top: { alignItems: 'flex-start', marginBottom: 34 }, brandMark: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 15 }, brandMarkText: { color: '#FFF', fontSize: 36, fontWeight: '900', fontStyle: 'italic', marginTop: -4 }, kicker: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  hero: { marginBottom: 25 }, title: { color: colors.text, fontSize: 36, lineHeight: 41, fontWeight: '900', letterSpacing: -1.5 }, subtitle: { color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: 12, maxWidth: 330 },
  formCard: { backgroundColor: colors.card, borderRadius: 23, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 11, shadowColor: '#173B2A', shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 1.3, color: colors.text, marginBottom: 2 }, hint: { fontSize: 12, color: colors.muted, lineHeight: 18 }, input: { height: 54, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FAFCFA', paddingHorizontal: 15, fontSize: 17, color: colors.text }, otp: { letterSpacing: 6, textAlign: 'center', fontSize: 21 }, helper: { color: colors.muted, fontSize: 11, marginTop: -3, marginBottom: 4 }, error: { color: colors.danger, fontSize: 13, marginTop: 4 },
  backBtn: { alignItems: 'center', paddingVertical: 8 }, backText: { color: colors.primary, fontWeight: '700', fontSize: 13 }, footer: { alignItems: 'center', marginTop: 30 }, footerLine: { width: 34, height: 3, borderRadius: 3, backgroundColor: colors.gold, marginBottom: 12 }, footerText: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, footerNote: { color: colors.text, fontSize: 12, fontWeight: '600', marginTop: 7 },
});
