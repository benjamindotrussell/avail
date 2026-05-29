import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { AppNavProp, AppRouteProp } from '../navigation/types';
import { useAuthStore } from '../store/authStore';
import { createInviteCode } from '../services/firestoreService';
import { colours } from '../constants/colours';

const InviteScreen: React.FC = () => {
  const navigation = useNavigation<AppNavProp<'Invite'>>();
  const route      = useRoute<AppRouteProp<'Invite'>>();
  const { groupId, groupName } = route.params;
  const { user }   = useAuthStore();

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const generate = async () => {
      try {
        const url = await createInviteCode(groupId, user!.id);
        setInviteUrl(url);
      } catch {} finally { setLoading(false); }
    };
    generate();
  }, [groupId]);

  const handleShare = async () => {
    if (!inviteUrl) return;
    await Share.share({
      message: `Join ${groupName} on Avail: ${inviteUrl}`,
      url: inviteUrl,
    });
  };

  return (
    <View style={styles.container}>
      {/* Orange header */}
      <View style={styles.top}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.iconBox}>
          <View style={styles.iconComposite}>
            <Ionicons name="person-outline" size={22} color={colours.orange} />
            <Text style={styles.iconPlus}>+</Text>
          </View>
        </View>
        <Text style={styles.title}>Invite to{'\n'}{groupName}</Text>
        <Text style={styles.sub}>Anyone with the link can join</Text>
      </View>

      {/* Body */}
      <View style={[styles.body, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.urlLabel}>INVITE LINK</Text>
        {loading
          ? <ActivityIndicator color={colours.orange} style={styles.loader} />
          : <Text style={styles.urlBox} numberOfLines={1}>{inviteUrl}</Text>
        }
        <TouchableOpacity style={styles.primaryBtn} onPress={handleShare} disabled={!inviteUrl}>
          <Text style={styles.primaryBtnText}>Share link</Text>
        </TouchableOpacity>
        <Text style={styles.note}>Link expires in 7 days</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colours.warmWhite },
  top:          { backgroundColor: colours.orange, paddingHorizontal: 20, paddingTop: 64, paddingBottom: 32 },
  backBtn:      { marginBottom: 24 },
  backText:     { fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  iconBox:         { width: 52, height: 52, borderRadius: 14, backgroundColor: colours.plum, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  iconComposite:   { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  iconPlus:        { fontSize: 16, fontWeight: '700', color: colours.orange, lineHeight: 18, marginBottom: 1 },
  title:        { fontSize: 26, fontWeight: '700', color: colours.white, lineHeight: 32, marginBottom: 8 },
  sub:          { fontSize: 14, color: 'rgba(255,255,255,0.7)' },

  body:         { padding: 20 },
  urlLabel:     { fontSize: 11, fontWeight: '700', color: colours.stone, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  loader:       { marginVertical: 20 },
  urlBox:       { backgroundColor: colours.white, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, fontSize: 14, color: colours.stone, marginBottom: 16, fontFamily: 'monospace' },
  primaryBtn:   { backgroundColor: colours.plum, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: colours.white },
  note:         { fontSize: 13, color: colours.stone, textAlign: 'center', marginTop: 4 },
});

export default InviteScreen;
