import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { AppNavProp } from '../navigation/types';
import { useAuthStore } from '../store/authStore';
import { useStatusStore } from '../store/statusStore';
import { useGroupsStore } from '../store/groupsStore';
import { subscribeToGroups, setStatus, updateUser } from '../services/firestoreService';
import { colours, dotColour, statusColour } from '../constants/colours';
import { formatStatus, formatStatusDetail } from '../utils/statusHelpers';

const HomeScreen: React.FC = () => {
  const navigation                        = useNavigation<AppNavProp<'Home'>>();
  const { user, setNotifyOnlyWhenActive } = useAuthStore();
  const { myStatuses, setMyStatus }       = useStatusStore();
  const { groups, setGroups }             = useGroupsStore();
  const [settingBusy, setSettingBusy]     = useState(false);

  const availableMode = user?.notifyOnlyWhenActive ?? false;

  // Real-time Firestore subscription for all groups
  useEffect(() => {
    if (!user?.id) return;
    const unsubscribe = subscribeToGroups(user.id, setGroups);
    return unsubscribe;
  }, [user?.id]);

  const setBusyEverywhere = async () => {
    if (!groups.length || !user?.id) return;
    setSettingBusy(true);
    try {
      await Promise.all(groups.map(async group => {
        const status = await setStatus(group.id, user.id, { availability: 'busy', location: null, vibe: null });
        setMyStatus(group.id, status);
      }));
    } catch (err) {
      console.error('[Home] Set busy everywhere failed:', err);
    } finally {
      setSettingBusy(false);
    }
  };

  const toggleAvailableMode = async (value: boolean) => {
    setNotifyOnlyWhenActive(value);
    try {
      await updateUser(user!.id, { notifyOnlyWhenActive: value });
    } catch {
      setNotifyOnlyWhenActive(!value);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, groups.length === 0 && styles.contentEmpty]}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.wordmark}>avail</Text>
            <Text style={styles.tagline}>who's free right now</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.groupsBtn} onPress={() => navigation.navigate('GroupsList')}>
              <Text style={styles.groupsBtnText}>Groups</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.avatarCircle} onPress={() => navigation.navigate('Profile')}>
              <Text style={styles.avatarInitial}>{user?.displayName?.[0]?.toUpperCase() ?? '?'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {groups.length > 0 && (
          <TouchableOpacity
            style={[styles.busyBtn, settingBusy && styles.busyBtnDisabled]}
            onPress={setBusyEverywhere}
            disabled={settingBusy}
          >
            {!settingBusy && <View style={styles.busyDot} />}
            <Text style={styles.busyBtnText}>{settingBusy ? 'Setting busy…' : 'Set busy everywhere'}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.availableModeRow}>
          <View style={styles.availableModeText}>
            <Text style={styles.availableModeLabel}>Available mode</Text>
            <Text style={styles.availableModeSub}>Only notify me when I'm free or maybe</Text>
          </View>
          <Switch
            value={availableMode}
            onValueChange={toggleAvailableMode}
            trackColor={{ false: 'rgba(255,255,255,0.15)', true: colours.orange }}
            thumbColor={colours.white}
            ios_backgroundColor="rgba(255,255,255,0.15)"
          />
        </View>
      </View>

      {/* ── Group cards ───────────────────────────────────────────── */}
      {groups.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No groups yet</Text>
          <Text style={styles.emptyHint}>Create one or ask a friend for an invite link</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => navigation.navigate('CreateGroup')}>
            <Text style={styles.createBtnText}>Create a group</Text>
          </TouchableOpacity>
        </View>
      ) : (
        groups.map(group => {
          const myGroupStatus = myStatuses[group.id] ??
            group.members.find(m => m.user.id === user?.id)?.status ?? null;
          const myAvail      = myGroupStatus?.availability ?? null;
          const iAmActive    = myAvail === 'free' || myAvail === 'maybe';
          const othersActive = group.members.some(
            m => m.user.id !== user?.id &&
                 (m.status?.availability === 'free' || m.status?.availability === 'maybe')
          );
          const bandColour = othersActive ? colours.orange : iAmActive ? colours.yellow : colours.stone;
          const bandDark   = !othersActive && !iAmActive;

          return (
            <View key={group.id} style={styles.card}>
              <View style={[styles.cardBand, { backgroundColor: bandColour }]}>
                <TouchableOpacity
                  style={styles.cardTitleRow}
                  onPress={() => navigation.navigate('GroupDetail', { groupId: group.id, groupName: group.name })}
                >
                  <Text style={styles.cardTitle}>{group.name}</Text>
                  {group.freeCount > 0 && (
                    <View style={styles.freeBadge}><Text style={styles.freeBadgeText}>{group.freeCount} free</Text></View>
                  )}
                  {group.freeCount === 0 && group.maybeCount > 0 && (
                    <View style={styles.freeBadge}><Text style={styles.freeBadgeText}>{group.maybeCount} maybe</Text></View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusBtn, bandDark && styles.statusBtnOnDark]}
                  onPress={() => navigation.navigate('StatusPicker', { groupId: group.id, groupName: group.name })}
                >
                  <Text style={[styles.statusBtnText, bandDark && styles.statusBtnTextDark]}>
                    {myGroupStatus ? 'Update' : "I'm free"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.memberList}>
                {group.members
                  .slice()
                  .sort((a, b) => {
                    if (a.user.id === user?.id) return -1;
                    if (b.user.id === user?.id) return 1;
                    const order = { free: 0, maybe: 1, busy: 2 };
                    return (order[a.status?.availability as keyof typeof order] ?? 3) -
                           (order[b.status?.availability as keyof typeof order] ?? 3);
                  })
                  .map((member, i, arr) => {
                    const isMe          = member.user.id === user?.id;
                    const displayStatus = isMe ? myGroupStatus : member.status;
                    const isLast        = i === arr.length - 1;
                    return (
                      <View
                        key={member.user.id}
                        style={[styles.memberRow, !displayStatus && styles.memberRowGhost, isLast && styles.memberRowLast]}
                      >
                        <View style={styles.avatarWrap}>
                          <View style={styles.memberAvatar}>
                            <Text style={styles.memberAvatarText}>
                              {(isMe ? user?.displayName : member.user.displayName)?.[0]?.toUpperCase() ?? '?'}
                            </Text>
                          </View>
                          <View style={[styles.statusDot, { backgroundColor: dotColour(displayStatus?.availability ?? null) }]} />
                        </View>
                        <View style={styles.memberInfo}>
                          <Text style={[styles.memberName, isMe && styles.memberNameMe]}>
                            {isMe ? 'You' : member.user.displayName}
                          </Text>
                          {!!formatStatusDetail(displayStatus) && (
                            <Text style={styles.memberDetail} numberOfLines={1}>
                              {formatStatusDetail(displayStatus)}
                            </Text>
                          )}
                        </View>
                        <Text style={[styles.memberStatus, { color: statusColour(displayStatus?.availability ?? null) }]}>
                          {formatStatus(displayStatus)}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colours.warmWhite },
  content:      { paddingBottom: 48 },
  contentEmpty: { flex: 1 },

  header:        { backgroundColor: colours.plum, paddingTop: 60, paddingBottom: 28, paddingHorizontal: 20 },
  headerTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  wordmark:      { fontSize: 42, fontWeight: '800', color: colours.orange, letterSpacing: -1, lineHeight: 46 },
  tagline:       { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2, fontWeight: '500' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6 },
  groupsBtn:     { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1.5, borderColor: 'rgba(255,107,53,0.5)' },
  groupsBtnText: { fontSize: 13, fontWeight: '600', color: colours.orange },
  avatarCircle:  { width: 40, height: 40, borderRadius: 20, backgroundColor: colours.orange, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 16, fontWeight: '700', color: colours.white },

  busyBtn:         { marginTop: 30, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  busyBtnDisabled: { opacity: 0.5 },
  busyDot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E05555' },
  busyBtnText:     { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },

  availableModeRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 12 },
  availableModeText:  { flex: 1 },
  availableModeLabel: { fontSize: 14, fontWeight: '600', color: colours.white },
  availableModeSub:   { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 },

  card:        { backgroundColor: colours.white, borderRadius: 16, marginHorizontal: 16, marginTop: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4, overflow: 'hidden' },
  cardBand:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  cardTitleRow:{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle:   { fontSize: 17, fontWeight: '700', color: colours.white },
  freeBadge:   { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9 },
  freeBadgeText:{ fontSize: 11, fontWeight: '700', color: colours.white },
  statusBtn:   { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99, paddingVertical: 7, paddingHorizontal: 14 },
  statusBtnOnDark:  { backgroundColor: colours.plum },
  statusBtnText:    { fontSize: 12, fontWeight: '700', color: colours.white },
  statusBtnTextDark:{ color: colours.white },

  memberList:     { paddingHorizontal: 16 },
  memberRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colours.divider, gap: 12 },
  memberRowGhost: { opacity: 0.38 },
  memberRowLast:  { borderBottomWidth: 0 },

  avatarWrap:      { position: 'relative', width: 32, height: 32 },
  memberAvatar:    { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EDE9F8', alignItems: 'center', justifyContent: 'center' },
  memberAvatarText:{ fontSize: 13, fontWeight: '700', color: colours.plum },
  statusDot:       { position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: colours.white },

  memberInfo:   { flex: 1, flexShrink: 1, overflow: 'hidden' },
  memberName:   { fontSize: 15, fontWeight: '500', color: colours.darkText },
  memberNameMe: { fontWeight: '700' },
  memberDetail: { fontSize: 12, color: colours.stone, marginTop: 1 },
  memberStatus: { fontSize: 13, fontWeight: '600' },

  emptyState:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle:  { fontSize: 22, fontWeight: '700', color: colours.darkText, marginBottom: 10 },
  emptyHint:   { fontSize: 15, color: colours.stone, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  createBtn:   { backgroundColor: colours.orange, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
  createBtnText:{ fontSize: 16, fontWeight: '700', color: colours.white },
});

export default HomeScreen;
