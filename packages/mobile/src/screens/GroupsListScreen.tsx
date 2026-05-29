import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { AppNavProp } from '../navigation/types';
import { useGroupsStore } from '../store/groupsStore';
import { colours } from '../constants/colours';

const GroupsListScreen: React.FC = () => {
  const navigation   = useNavigation<AppNavProp<'GroupsList'>>();
  const { groups }   = useGroupsStore();

  const getBadge = (group: typeof groups[0]) => {
    if (group.freeCount > 0) return { text: `${group.freeCount} free`, variant: 'free' as const };
    if (group.maybeCount > 0) return { text: `${group.maybeCount} maybe`, variant: 'maybe' as const };
    return null;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={groups.length === 0 ? styles.emptyContainer : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Groups</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('CreateGroup')}>
          <Text style={styles.newBtnText}>+ New group</Text>
        </TouchableOpacity>
      </View>

      {/* Empty state */}
      {groups.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No groups yet</Text>
          <Text style={styles.emptyHint}>Create one or ask a friend for an invite link</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('CreateGroup')}>
            <Text style={styles.emptyBtnText}>Create a group</Text>
          </TouchableOpacity>
        </View>
      ) : (
        groups.map((group) => {
          const badge   = getBadge(group);
          const isQuiet = !badge;
          return (
            <TouchableOpacity
              key={group.id}
              style={[styles.row, isQuiet && styles.rowQuiet]}
              onPress={() => navigation.navigate('GroupDetail', { groupId: group.id, groupName: group.name })}
              activeOpacity={0.7}
            >
              {/* Group avatar */}
              <View style={styles.avatar}>
                <Text style={styles.avatarInitial}>{group.name[0]?.toUpperCase() ?? '?'}</Text>
              </View>

              {/* Name + meta */}
              <View style={styles.rowBody}>
                <Text style={styles.groupName}>{group.name}</Text>
                <Text style={styles.meta}>{group.members.length} {group.members.length === 1 ? 'member' : 'members'}</Text>
              </View>

              {/* Status badge */}
              {badge ? (
                <View style={[styles.badge, badge.variant === 'free' ? styles.badgeFree : styles.badgeMaybe]}>
                  <Text style={[styles.badgeText, badge.variant === 'free' ? styles.badgeTextFree : styles.badgeTextMaybe]}>
                    {badge.text}
                  </Text>
                </View>
              ) : (
                <View style={styles.badgeQuiet}>
                  <Text style={styles.badgeTextQuiet}>quiet</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: colours.warmWhite },
  emptyContainer:  { flex: 1 },

  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 64, paddingBottom: 20 },
  title:           { fontSize: 28, fontWeight: '700', color: colours.darkText },
  newBtn:          { backgroundColor: colours.orange, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 16 },
  newBtnText:      { fontSize: 13, fontWeight: '700', color: colours.white },

  row:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colours.divider, gap: 14 },
  rowQuiet:        { opacity: 0.45 },

  avatar:          { width: 48, height: 48, borderRadius: 24, backgroundColor: colours.plum, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarInitial:   { fontSize: 18, fontWeight: '700', color: colours.white },

  rowBody:         { flex: 1 },
  groupName:       { fontSize: 17, fontWeight: '600', color: colours.darkText, marginBottom: 3 },
  meta:            { fontSize: 13, color: colours.stone },

  badge:           { borderRadius: 99, paddingVertical: 5, paddingHorizontal: 12, flexShrink: 0 },
  badgeFree:       { backgroundColor: '#FFF0EB' },
  badgeMaybe:      { backgroundColor: '#FFF8DC' },
  badgeQuiet:      { borderRadius: 99, paddingVertical: 5, paddingHorizontal: 12, backgroundColor: '#F1EFE8', flexShrink: 0 },
  badgeText:       { fontSize: 12, fontWeight: '700' },
  badgeTextFree:   { color: '#CC4400' },
  badgeTextMaybe:  { color: '#8B6200' },
  badgeTextQuiet:  { fontSize: 12, fontWeight: '600', color: colours.stone },

  empty:           { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle:      { fontSize: 20, fontWeight: '700', color: colours.darkText, marginBottom: 10 },
  emptyHint:       { fontSize: 14, color: colours.stone, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  emptyBtn:        { backgroundColor: colours.orange, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
  emptyBtnText:    { fontSize: 15, fontWeight: '700', color: colours.white },
});

export default GroupsListScreen;
