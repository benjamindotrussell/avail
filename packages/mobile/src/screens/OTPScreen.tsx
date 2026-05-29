import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import auth from '@react-native-firebase/auth';
import type { AuthNavProp, AuthRouteProp } from '../navigation/types';
import { getUser, upsertUser } from '../services/firestoreService';
import { getConfirmation, setConfirmation, clearConfirmation } from '../services/phoneAuth';
import { useAuthStore } from '../store/authStore';
import { colours } from '../constants/colours';

const OTPScreen: React.FC = () => {
  const navigation = useNavigation<AuthNavProp<'OTP'>>();
  const route      = useRoute<AuthRouteProp<'OTP'>>();
  const { phone }  = route.params;

  const [digits, setDigits]     = useState(['', '', '', '', '', '']);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(60);
  const inputRefs               = useRef<TextInput[]>([]);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const handleDigit = (value: string, index: number) => {
    const next = [...digits];
    next[index] = value.slice(-1);
    setDigits(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (next.every(Boolean)) submitOTP(next.join(''));
  };

  const submitOTP = async (otp: string) => {
    setLoading(true);
    setError(null);
    try {
      const confirmation = getConfirmation();
      if (!confirmation) throw new Error('Session expired. Go back and request a new code.');

      const { user: fbUser } = await confirmation.confirm(otp);
      clearConfirmation();

      const existingUser = await getUser(fbUser.uid);
      if (existingUser) {
        await upsertUser(fbUser.uid, { phone });
        useAuthStore.getState().setUser(existingUser);
      } else {
        navigation.navigate('DisplayName', { isNewUser: true, phone });
      }
    } catch (err: any) {
      const code: string = err?.code ?? '';
      if (code === 'auth/invalid-verification-code') {
        setError("That code didn't work. Try again.");
      } else if (code === 'auth/code-expired') {
        setError('Code expired. Tap resend to get a new one.');
      } else {
        setError(err?.message ?? "Something went wrong. Try again.");
      }
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendIn(60);
    try {
      const confirmation = await auth().signInWithPhoneNumber(phone);
      setConfirmation(confirmation);
    } catch {}
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← {phone}</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Enter your{"\n"}code</Text>
      <View style={styles.digitRow}>
        {digits.map((d, i) => (
          <TextInput
            key={i}
            ref={r => { if (r) inputRefs.current[i] = r; }}
            style={styles.digit}
            value={d}
            onChangeText={v => handleDigit(v, i)}
            keyboardType="number-pad"
            maxLength={1}
            autoFocus={i === 0}
          />
        ))}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color={colours.orange} style={{ marginTop: 16 }} />}
      <TouchableOpacity disabled={resendIn > 0} onPress={handleResend}>
        <Text style={[styles.resend, resendIn > 0 && styles.resendDisabled]}>
          {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colours.warmWhite, padding: 24, paddingTop: 60 },
  back:           { marginBottom: 32 },
  backText:       { fontSize: 10, color: colours.stone },
  title:          { fontSize: 28, fontWeight: '700', color: colours.darkText, marginBottom: 32, lineHeight: 34 },
  digitRow:       { flexDirection: 'row', gap: 10, marginBottom: 16 },
  digit:          { width: 44, height: 56, borderWidth: 1.5, borderColor: colours.orange, borderRadius: 10, textAlign: 'center', fontSize: 24, fontWeight: '700', color: colours.darkText },
  error:          { fontSize: 12, color: '#CC0000', marginBottom: 8 },
  resend:         { fontSize: 13, color: colours.orange, marginTop: 24 },
  resendDisabled: { color: colours.stone },
});

export default OTPScreen;
