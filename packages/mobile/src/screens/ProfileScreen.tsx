import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { AppNavProp } from '../navigation/types';
import { signOut } from 'firebase/auth';
import { useAuthStore } from '../store/authStore';
import { useStatusStore } from '../store/statusStore';
import { useGroupsStore } from '../store/groupsStore';
import { firebaseAuth } from '../lib/firebase';
import { colours } from '../constants/colours';

const ProfileScreen: React.FC = () => {
  const navigation            = useNavigation<AppNavProp<'Profile'>>();
  const { user, clearAuth }   = useAuthStore();
  const { clearAll: clearStatus } = useStatusStore();
  const { clearGroups }       = useGroupsStore();
  const [notifEnabled, setNotifEnabled] = useState(true);

  const handleSignOut = () => {
    clearAuth();
    clearStatus();
    clearGroups();
    signOut(firebaseAuth).catch(() => {});
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account and remove you from all groups. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            clearAuth();
            clearStatus();
            clearGroups();
            firebaseAuth.currentUser?.delete().catch(() => {});
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{user?.displayName?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <Text style={styles.name}>{user?.displayName}</Text>
        <Text style={styles.subLine}>Set your status in each group</Text>
      </View>

      {/* Settings rows */}
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Notifications</Text>
          <Switch
            value={notifEnabled}
            onValueChange={setNotifEnabled}
            trackColor={{ true: colours.orange, false: colours.stone }}
            thumbColor={colours.white}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Status expires</Text>
          <Text style={styles.rowValue}>8 hours</Text>
        </View>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('EditProfile')}>
          <Text style={[styles.rowLabel, { color: colours.orange }]}>Edit profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={handleSignOut}>
          <Text style={[styles.rowLabel, styles.rowLabelMuted]}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Danger zone */}
      <TouchableOpacity style={styles.deleteRow} onPress={handleDeleteAccount}>
        <Text style={styles.deleteText}>Delete account</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colours.warmWhite },
  header:         { backgroundColor: colours.plum, paddingTop: 64, paddingBottom: 32, paddingHorizontal: 20, alignItems: 'center' },
  avatar:         { width: 72, height: 72, borderRadius: 36, backgroundColor: colours.orange, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarInitial:  { fontSize: 28, fontWeight: '700', color: colours.white },
  name:           { fontSize: 24, fontWeight: '700', color: colours.white, marginBottom: 6 },
  subLine:        { fontSize: 14, color: 'rgba(255,255,255,0.55)' },

  body:           { paddingHorizontal: 20, paddingTop: 8 },
  row:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colours.divider },
  rowLast:        { borderBottomWidth: 0 },
  rowLabel:       { fontSize: 16, fontWeight: '500', color: colours.darkText },
  rowLabelMuted:  { color: colours.stone, fontWeight: '400' },
  rowValue:       { fontSize: 15, color: colours.stone },

  deleteRow:      { paddingVertical: 24, alignItems: 'center' },
  deleteText:     { fontSize: 14, color: colours.stone },
});

export default ProfileScreen;
