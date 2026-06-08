import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { AppNavProp, AppRouteProp } from '../navigation/types';
import { useGroupsStore } from '../store/groupsStore';
import { useAuthStore } from '../store/authStore';
import { deleteGroup, leaveGroup } from '../services/firestoreService';
import { colours, statusColour } from '../constants/colours';
import { formatStatus, formatStatusDetail } from '../utils/statusHelpers';

const GroupDetailScreen: React.FC = () => {
  const navigation              = useNavigation<AppNavProp<'GroupDetail'>>();
  const route                   = useRoute<AppRouteProp<'GroupDetail'>>();
  const { groupId, groupName }  = route.params;
  const { groups }              = useGroupsStore();
  const { user }                = useAuthStore();
  const [deleting, setDeleting] = useState(false);

  const group = groups.find(g => g.id === groupId);
  const myMembership = group?.members.find(m => m.user.id === user?.id);
  const isAdmin = myMembership?.role === 'admin';

  const handleDelete = () => {
    Alert.alert(
      'Delete group',
      `Are you sure you want to delete "${group?.name ?? groupName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            if (!user?.id) return;
            setDeleting(true);
            try {
              await deleteGroup(groupId, user.id);
              navigation.navigate('Home');
            } catch {
              Alert.alert('Error', 'Could not delete the group. You may not be the admin.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleLeave = () => {
    Alert.alert(
      'Leave group',
      `Leave "${group?.name ?? groupName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave', style: 'destructive', onPress: async () => {
            if (!user?.id) return;
            setDeleting(true);
            try {
              await leaveGroup(groupId, user.id);
              navigation.navigate('Home');
            } catch {
              Alert.alert('Error', 'Could not leave the group.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const sortedMembers = group?.members.slice().sort((a, b) => {
    const order: Record<string, number> = { free: 0, maybe: 1, busy: 2 };
    return (order[a.status?.availability ?? 'z'] ?? 3) - (order[b.status?.availability ?? 'z'] ?? 3);
  }) ?? [];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} tintColor={colours.white} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerNav}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Home')}>
            <Text style={styles.back}>Home</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.groupName}>{group?.name ?? groupName}</Text>
        <Text style={styles.meta}>
          {group?.members.length ?? 0} {(group?.members.length ?? 0) === 1 ? 'member' : 'members'}
        </Text>
        {(group?.freeCount ?? 0) > 0 && (
          <View style={styles.freePill}>
            <Text style={styles.freePillText}>{group!.freeCount} free now</Text>
          </View>
        )}
      </View>

      {/* Members */}
      <View style={styles.memberList}>
        {sortedMembers.map(member => {
          const isGhost = !member.status || member.status.availability === 'busy';
          return (
            <View key={member.user.id} style={[styles.memberRow, isGhost && styles.memberRowGhost]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarInitial}>{member.user.displayName[0]?.toUpperCase() ?? '?'}</Text>
              </View>
              <View style={styles.memberBody}>
                <Text style={styles.memberName}>{member.user.displayName}</Text>
                {member.status?.availability === 'free' && (
                  <Text style={styles.memberSub}>{formatStatusDetail(member.status)}</Text>
                )}
              </View>
              <Text style={[styles.memberStatus, { color: statusColour(member.status?.availability ?? null) }]}>
                {formatStatus(member.status)}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.statusBtn}
          onPress={() => navigation.navigate('StatusPicker', { groupId, groupName: group?.name ?? groupName })}
        >
          <Text style={styles.statusBtnText}>Set my status</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.inviteBtn}
          onPress={() => navigation.navigate('Invite', { groupId, groupName: group?.name ?? groupName })}
        >
          <Text style={styles.inviteBtnText}>Invite friends</Text>
        </TouchableOpacity>
        {isAdmin ? (
          <TouchableOpacity
            style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
            onPress={handleDelete}
            disabled={deleting}
          >
            <Text style={styles.deleteBtnText}>{deleting ? 'Deleting…' : 'Delete group'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
            onPress={handleLeave}
            disabled={deleting}
          >
            <Text style={styles.deleteBtnText}>{deleting ? 'Leaving…' : 'Leave group'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: colours.warmWhite },
  header:          { backgroundColor: colours.orange, paddingHorizontal: 20, paddingTop: 64, paddingBottom: 24 },
  headerNav:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  back:            { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  groupName:       { fontSize: 28, fontWeight: '700', color: colours.white, marginBottom: 6 },
  meta:            { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 10 },
  freePill:        { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 99, paddingVertical: 6, paddingHorizontal: 14 },
  freePillText:    { fontSize: 12, fontWeight: '700', color: colours.white },

  memberList:      { paddingHorizontal: 20, paddingTop: 8 },
  memberRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colours.divider, gap: 14 },
  memberRowGhost:  { opacity: 0.4 },
  avatar:          { width: 44, height: 44, borderRadius: 22, backgroundColor: colours.plum, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarInitial:   { fontSize: 17, fontWeight: '700', color: colours.white },
  memberBody:      { flex: 1 },
  memberName:      { fontSize: 17, fontWeight: '600', color: colours.darkText },
  memberSub:       { fontSize: 13, color: colours.stone, marginTop: 3 },
  memberStatus:    { fontSize: 13, fontWeight: '700', flexShrink: 0 },

  actions:         { margin: 20, marginTop: 28, gap: 12 },
  statusBtn:       { backgroundColor: colours.orange, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  statusBtnText:   { fontSize: 16, fontWeight: '700', color: colours.white },
  inviteBtn:       { backgroundColor: colours.plum, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  inviteBtnText:   { fontSize: 16, fontWeight: '700', color: colours.white },
  deleteBtn:       { borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#E05555' },
  deleteBtnDisabled:{ opacity: 0.5 },
  deleteBtnText:   { fontSize: 16, fontWeight: '600', color: '#E05555' },
});

export default GroupDetailScreen;
