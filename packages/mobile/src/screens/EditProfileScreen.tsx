import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { AppNavProp } from '../navigation/types';
import { useAuthStore } from '../store/authStore';
import { updateUser } from '../services/firestoreService';
import { colours } from '../constants/colours';

const EXPIRY_OPTIONS = [
  { value: 1, label: '1 hour' },
  { value: 2, label: '2 hours' },
  { value: 4, label: '4 hours' },
  { value: 8, label: '8 hours' },
];

const EditProfileScreen: React.FC = () => {
  const navigation            = useNavigation<AppNavProp<'EditProfile'>>();
  const { user, updateUser: updateUserStore } = useAuthStore();
  const [name, setName]       = useState(user?.displayName ?? '');
  const [expiry, setExpiry]   = useState(user?.defaultExpiryHours ?? 8);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const handleSave = async () => {
    if (!name.trim() || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      await updateUser(user.id, { displayName: name.trim(), defaultExpiryHours: expiry });
      updateUserStore({ displayName: name.trim(), defaultExpiryHours: expiry });
      navigation.goBack();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Edit profile</Text>

      <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        maxLength={50}
        autoFocus
        onSubmitEditing={handleSave}
      />

      <Text style={[styles.fieldLabel, { marginTop: 32 }]}>DEFAULT STATUS EXPIRY</Text>
      <View style={styles.expiryRow}>
        {EXPIRY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.expiryChip, expiry === opt.value && styles.expiryChipSel]}
            onPress={() => setExpiry(opt.value)}
          >
            <Text style={[styles.expiryChipText, expiry === opt.value && styles.expiryChipTextSel]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.btn, !name.trim() && styles.btnDisabled]}
        onPress={handleSave}
        disabled={!name.trim() || loading}
      >
        {loading
          ? <ActivityIndicator color={colours.white} />
          : <Text style={styles.btnText}>Save changes</Text>
        }
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: colours.warmWhite, paddingHorizontal: 24, paddingTop: 64 },
  back:               { marginBottom: 36 },
  backText:           { fontSize: 14, color: colours.stone, fontWeight: '500' },
  title:              { fontSize: 28, fontWeight: '700', color: colours.darkText, marginBottom: 36 },
  fieldLabel:         { fontSize: 11, fontWeight: '700', color: colours.stone, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  input:              { fontSize: 22, fontWeight: '500', color: colours.darkText, borderBottomWidth: 2, borderBottomColor: colours.orange, paddingVertical: 14 },
  expiryRow:          { flexDirection: 'row', gap: 8 },
  expiryChip:         { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: colours.stone, alignItems: 'center' },
  expiryChipSel:      { borderColor: colours.orange, backgroundColor: 'rgba(255,107,53,0.08)' },
  expiryChipText:     { fontSize: 13, fontWeight: '600', color: colours.stone },
  expiryChipTextSel:  { color: colours.orange },
  error:              { fontSize: 12, color: '#CC0000', marginTop: 8 },
  btn:                { backgroundColor: colours.plum, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 36 },
  btnDisabled:        { opacity: 0.35 },
  btnText:            { fontSize: 16, fontWeight: '700', color: colours.white },
});

export default EditProfileScreen;
