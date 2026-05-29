import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { AppNavProp } from '../navigation/types';
import { useAuthStore } from '../store/authStore';
import { createGroup } from '../services/firestoreService';
import { colours } from '../constants/colours';

const CreateGroupScreen: React.FC = () => {
  const navigation            = useNavigation<AppNavProp<'CreateGroup'>>();
  const { user }              = useAuthStore();
  const [name, setName]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const handleCreate = async () => {
    if (!name.trim() || !user) return;
    setLoading(true);
    setError(null);
    try {
      const trimmed = name.trim();
      const groupId = await createGroup(user.id, user.displayName, trimmed);
      navigation.replace('GroupDetail', { groupId, groupName: trimmed });
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Name your{'\n'}group</Text>

      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="The Lads, Work crew..."
        placeholderTextColor={colours.stone}
        maxLength={50}
        autoFocus
        onSubmitEditing={handleCreate}
      />
      <Text style={styles.counter}>{name.length}/50</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.btn, !name.trim() && styles.btnDisabled]}
        onPress={handleCreate}
        disabled={!name.trim() || loading}
      >
        {loading
          ? <ActivityIndicator color={colours.white} />
          : <Text style={styles.btnText}>Create group</Text>
        }
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colours.warmWhite, paddingHorizontal: 24, paddingTop: 64 },
  back:        { marginBottom: 36 },
  backText:    { fontSize: 14, color: colours.stone, fontWeight: '500' },
  title:       { fontSize: 32, fontWeight: '700', color: colours.darkText, marginBottom: 36, lineHeight: 38 },
  input:       { fontSize: 22, fontWeight: '500', color: colours.darkText, borderBottomWidth: 2, borderBottomColor: colours.orange, paddingVertical: 14 },
  counter:     { fontSize: 12, color: colours.stone, textAlign: 'right', marginTop: 6, marginBottom: 8 },
  error:       { fontSize: 14, color: '#CC0000', marginBottom: 8 },
  btn:         { backgroundColor: colours.plum, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 28 },
  btnDisabled: { opacity: 0.35 },
  btnText:     { fontSize: 16, fontWeight: '700', color: colours.white },
});

export default CreateGroupScreen;
