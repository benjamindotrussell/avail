import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colours } from '../constants/colours';
import { signInWithApple, signInWithGoogle } from '../services/socialAuth';

const OnboardingScreen: React.FC = () => {
  const [loading, setLoading] = useState<'apple' | 'google' | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const handleSocial = async (provider: 'apple' | 'google') => {
    setError(null);
    setLoading(provider);
    try {
      if (provider === 'apple') await signInWithApple();
      else await signInWithGoogle();
    } catch (err: unknown) {
      const code = (err as any)?.code;
      if (code === 'ERR_REQUEST_CANCELED') return;
      setError(`Sign in failed: ${(err as Error)?.message ?? String(err)}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
      <Image source={require('../../assets/icon.png')} style={styles.icon} />
      <Text style={styles.wordmark}>avail</Text>
      <Text style={styles.tagline}>know who's free, before you even ask.</Text>

      {Platform.OS === 'ios' && (
        <TouchableOpacity
          style={styles.appleBtn}
          onPress={() => handleSocial('apple')}
          disabled={loading !== null}
        >
          {loading === 'apple'
            ? <ActivityIndicator color={colours.white} />
            : <Text style={styles.appleBtnText}> Continue with Apple</Text>}
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.googleBtn}
        onPress={() => handleSocial('google')}
        disabled={loading !== null}
      >
        {loading === 'google'
          ? <ActivityIndicator color={colours.darkText} />
          : <Text style={styles.googleBtnText}>G  Continue with Google</Text>}
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colours.plum, alignItems: 'center', justifyContent: 'center', padding: 24 },
  icon:           { width: 120, height: 120, borderRadius: 24, marginBottom: 24 },
  wordmark:       { fontSize: 32, fontWeight: '700', color: colours.orange, marginBottom: 8 },
  tagline:        { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 40, textAlign: 'center' },
  appleBtn:       { width: '100%', backgroundColor: '#000', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 12 },
  appleBtnText:   { fontSize: 16, fontWeight: '600', color: colours.white },
  googleBtn:      { width: '100%', backgroundColor: colours.white, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 12 },
  googleBtnText:  { fontSize: 16, fontWeight: '600', color: colours.darkText },
  error:          { fontSize: 12, color: '#FF6B6B', marginTop: 12 },
});

export default OnboardingScreen;
