import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { AppNavProp, AppRouteProp } from '../navigation/types';
import { useAuthStore } from '../store/authStore';
import { useGroupsStore } from '../store/groupsStore';
import { joinGroupByCode } from '../services/firestoreService';
import { colours } from '../constants/colours';

const JoinScreen: React.FC = () => {
  const navigation        = useNavigation<AppNavProp<'JoinGroup'>>();
  const route             = useRoute<AppRouteProp<'JoinGroup'>>();
  const { code }          = route.params;
  const { user }          = useAuthStore();
  const { groups }        = useGroupsStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    joinGroupByCode(code, user.id, user.displayName, user.avatarUrl ?? null)
      .then(groupId => {
        // Find group name from store (may already be there if we were a member,
        // or arrive shortly via the Firestore subscription after joining)
        const groupName = groups.find(g => g.id === groupId)?.name ?? 'Group';
        navigation.replace('GroupDetail', { groupId, groupName });
      })
      .catch(err => {
        const msg: string = err?.message ?? '';
        if (msg.includes('expired')) {
          setError('This invite link has expired. Ask for a new one.');
        } else if (msg.includes('Invalid')) {
          setError('This invite link is invalid.');
        } else {
          setError(`Something went wrong: ${msg || 'unknown error'}`);
        }
      });
  }, [code, user?.id]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Couldn't join</Text>
        <Text style={styles.sub}>{error}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.replace('Home')}>
          <Text style={styles.btnText}>Go home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colours.orange} />
      <Text style={styles.joining}>Joining group…</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colours.warmWhite, alignItems: 'center', justifyContent: 'center', padding: 32 },
  joining:   { fontSize: 15, color: colours.stone, marginTop: 16 },
  title:     { fontSize: 22, fontWeight: '700', color: colours.darkText, marginBottom: 12 },
  sub:       { fontSize: 15, color: colours.stone, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  btn:       { backgroundColor: colours.orange, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  btnText:   { fontSize: 16, fontWeight: '700', color: colours.white },
});

export default JoinScreen;
