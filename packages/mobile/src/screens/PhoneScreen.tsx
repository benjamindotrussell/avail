import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import auth from '@react-native-firebase/auth';
import type { AuthNavProp } from '../navigation/types';
import { setConfirmation } from '../services/phoneAuth';
import { colours } from '../constants/colours';

const PhoneScreen: React.FC = () => {
  const navigation = useNavigation<AuthNavProp<'Phone'>>();
  const [phone, setPhone]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const isValid = phone.replace(/\D/g, '').length >= 10;

  const handleSend = async () => {
    if (!isValid) return;
    setLoading(true);
    setError(null);
    try {
      const normalizedPhone = phone.replace(/\s/g, '');
      const confirmation = await auth().signInWithPhoneNumber(normalizedPhone);
      setConfirmation(confirmation);
      navigation.navigate('OTP', { phone: normalizedPhone });
    } catch (err: any) {
      if (err.code === 'auth/invalid-phone-number') {
        setError('Invalid number. Include country code e.g. +44 7700 000000');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>What's your{"\n"}number?</Text>
      <Text style={styles.hint}>We'll send you a one-time code</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="+44 7700 000000"
        placeholderTextColor={colours.stone}
        keyboardType="phone-pad"
        autoFocus
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity
        style={[styles.btn, !isValid && styles.btnDisabled]}
        onPress={handleSend}
        disabled={!isValid || loading}
      >
        {loading ? <ActivityIndicator color={colours.white} /> : <Text style={styles.btnText}>Send code</Text>}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colours.warmWhite, padding: 24, paddingTop: 60 },
  back:        { marginBottom: 32 },
  backText:    { fontSize: 10, color: colours.stone },
  title:       { fontSize: 28, fontWeight: '700', color: colours.darkText, marginBottom: 8, lineHeight: 34 },
  hint:        { fontSize: 13, color: colours.stone, marginBottom: 32 },
  input:       { fontSize: 20, fontWeight: '500', color: colours.darkText, borderBottomWidth: 1.5, borderBottomColor: colours.orange, paddingVertical: 12, marginBottom: 8 },
  error:       { fontSize: 12, color: '#CC0000', marginBottom: 16 },
  btn:         { backgroundColor: colours.plum, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 24 },
  btnDisabled: { opacity: 0.35 },
  btnText:     { fontSize: 15, fontWeight: '700', color: colours.white },
});

export default PhoneScreen;
