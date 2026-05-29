import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import type { AuthRouteProp } from '../navigation/types';
import { useAuthStore } from '../store/authStore';
import { firebaseAuth } from '../lib/firebase';
import { upsertUser } from '../services/firestoreService';
import { colours } from '../constants/colours';

const DisplayNameScreen: React.FC = () => {
  const route               = useRoute<AuthRouteProp<'DisplayName'>>();
  const phone               = route.params?.phone ?? null;
  const [name, setName]     = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser }         = useAuthStore();
  const insets = useSafeAreaInsets();

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) return;
      await upsertUser(uid, { displayName: name.trim(), phone });
      setUser({
        id: uid,
        displayName: name.trim(),
        avatarUrl: null,
        createdAt: new Date().toISOString(),
        notifyOnlyWhenActive: false,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
      <Text style={styles.title}>What should{"\n"}we call you?</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={colours.stone}
        maxLength={50}
        autoFocus
      />
      <TouchableOpacity
        style={[styles.btn, !name.trim() && styles.btnDisabled]}
        onPress={handleSave}
        disabled={!name.trim() || loading}
      >
        {loading ? <ActivityIndicator color={colours.white} /> : <Text style={styles.btnText}>Continue</Text>}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colours.warmWhite, padding: 24, paddingTop: 80 },
  title:       { fontSize: 28, fontWeight: '700', color: colours.darkText, marginBottom: 32, lineHeight: 34 },
  input:       { fontSize: 20, fontWeight: '500', color: colours.darkText, borderBottomWidth: 1.5, borderBottomColor: colours.orange, paddingVertical: 12, marginBottom: 8 },
  btn:         { backgroundColor: colours.plum, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 24 },
  btnDisabled: { opacity: 0.35 },
  btnText:     { fontSize: 15, fontWeight: '700', color: colours.white },
});

export default DisplayNameScreen;
