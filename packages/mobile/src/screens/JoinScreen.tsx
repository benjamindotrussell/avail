import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { AppNavProp, AppRouteProp } from '../navigation/types';
import { useAuthStore } from '../store/authStore';
import { useGroupsStore } from '../store/groupsStore';
import { joinGroupByCode, saveGroupAlias } from '../services/firestoreService';
import { colours } from '../constants/colours';

type JoinStatus = 'joining' | 'needs_alias' | 'error';

const JoinScreen: React.FC = () => {
  const navigation      = useNavigation<AppNavProp<'JoinGroup'>>();
  const route           = useRoute<AppRouteProp<'JoinGroup'>>();
  const { code }        = route.params;
  const { user }        = useAuthStore();

  const [status, setStatus]             = useState<JoinStatus>('joining');
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const [retriable, setRetriable]       = useState(false);
  const [attempt, setAttempt]           = useState(0);

  // Set when a name conflict is detected
  const [joinedGroupId, setJoinedGroupId]     = useState('');
  const [joinedGroupName, setJoinedGroupName] = useState('');
  const [alias, setAlias]                     = useState('');

  useEffect(() => {
    if (!user) return;
    setStatus('joining');

    joinGroupByCode(code, user.id, user.displayName, user.avatarUrl ?? null)
      .then(({ groupId, groupName }) => {
        const conflict = useGroupsStore.getState().groups.some(
          g => g.id !== groupId && g.name.toLowerCase() === groupName.toLowerCase()
        );

        if (conflict) {
          const suffix = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
          setJoinedGroupId(groupId);
          setJoinedGroupName(groupName);
          setAlias(`${groupName} ${suffix}`);
          setStatus('needs_alias');
          return;
        }

        navigation.reset({
          index: 1,
          routes: [
            { name: 'Home' },
            { name: 'GroupDetail', params: { groupId, groupName } },
          ],
        });
      })
      .catch(err => {
        const msg: string = err?.message ?? '';
        setStatus('error');
        if (msg.includes('expired')) {
          setErrorMsg('This invite link has expired. Ask for a new one.');
          setRetriable(false);
        } else if (msg.includes('Invalid')) {
          setErrorMsg('This invite link is invalid or has been removed.');
          setRetriable(false);
        } else {
          setErrorMsg("Something went wrong. Check your connection and try again.");
          setRetriable(true);
        }
      });
  }, [code, user?.id, attempt]);

  const goHome = () =>
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });

  const handleSaveAlias = async () => {
    const trimmed = alias.trim();
    if (!trimmed || !user) return;
    if (trimmed !== joinedGroupName) {
      await saveGroupAlias(user.id, joinedGroupId, trimmed);
    }
    navigation.reset({
      index: 1,
      routes: [
        { name: 'Home' },
        { name: 'GroupDetail', params: { groupId: joinedGroupId, groupName: trimmed } },
      ],
    });
  };

  const handleSkipAlias = () => {
    navigation.reset({
      index: 1,
      routes: [
        { name: 'Home' },
        { name: 'GroupDetail', params: { groupId: joinedGroupId, groupName: joinedGroupName } },
      ],
    });
  };

  // ── Alias step ─────────────────────────────────────────────────────────────
  if (status === 'needs_alias') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>One more thing</Text>
        <Text style={styles.sub}>
          You already have a group called "{joinedGroupName}". Give this one a nickname so you can tell them apart.
        </Text>
        <TextInput
          style={styles.aliasInput}
          value={alias}
          onChangeText={setAlias}
          maxLength={50}
          autoFocus
          selectTextOnFocus
          onSubmitEditing={handleSaveAlias}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.primaryBtn, !alias.trim() && styles.primaryBtnDisabled]}
          onPress={handleSaveAlias}
          disabled={!alias.trim()}
        >
          <Text style={styles.primaryBtnText}>Save nickname</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={handleSkipAlias}>
          <Text style={styles.secondaryBtnText}>Keep original name</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <View style={styles.container}>
        <View style={styles.iconRing}>
          <Text style={styles.iconX}>✕</Text>
        </View>
        <Text style={styles.title}>Couldn't join</Text>
        <Text style={styles.sub}>{errorMsg}</Text>
        {retriable && (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setAttempt(a => a + 1)}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.secondaryBtn} onPress={goHome}>
          <Text style={styles.secondaryBtnText}>Go home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colours.orange} style={styles.spinner} />
      <Text style={styles.joiningTitle}>Joining…</Text>
      <Text style={styles.joiningSub}>Getting you set up with the group</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: colours.warmWhite, alignItems: 'center', justifyContent: 'center', padding: 32 },

  // Loading
  spinner:            { marginBottom: 20 },
  joiningTitle:       { fontSize: 24, fontWeight: '700', color: colours.darkText, marginBottom: 8 },
  joiningSub:         { fontSize: 15, color: colours.stone, textAlign: 'center' },

  // Alias
  aliasInput:         { width: '100%', fontSize: 20, fontWeight: '500', color: colours.darkText, borderBottomWidth: 2, borderBottomColor: colours.orange, paddingVertical: 12, marginBottom: 28, textAlign: 'center' },

  // Error
  iconRing:           { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(224,85,85,0.1)', borderWidth: 2, borderColor: '#E05555', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  iconX:              { fontSize: 26, color: '#E05555', fontWeight: '700', lineHeight: 30 },
  title:              { fontSize: 24, fontWeight: '700', color: colours.darkText, marginBottom: 10 },
  sub:                { fontSize: 15, color: colours.stone, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  primaryBtn:         { backgroundColor: colours.orange, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, marginBottom: 12, width: '100%', alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.35 },
  primaryBtnText:     { fontSize: 16, fontWeight: '700', color: colours.white },
  secondaryBtn:       { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, width: '100%', alignItems: 'center' },
  secondaryBtnText:   { fontSize: 16, fontWeight: '600', color: colours.stone },
});

export default JoinScreen;
