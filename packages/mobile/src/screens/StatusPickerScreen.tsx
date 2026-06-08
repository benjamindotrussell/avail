import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { AppNavProp, AppRouteProp } from '../navigation/types';
import { useAuthStore } from '../store/authStore';
import { setStatus } from '../services/firestoreService';
import { useStatusStore } from '../store/statusStore';
import { colours } from '../constants/colours';
import { formatLocation, formatVibe } from '../utils/statusHelpers';
import type { Availability, Location, Vibe } from '@avail/shared';

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = 'availability' | 'location' | 'vibe' | 'expiry' | 'confirm';

interface PickerState {
  availability: Availability | null;
  location: Location | null;
  locationNote: string;
  vibe: Vibe | null;
  vibeNote: string;
  expiryHours: number;
}

interface Option {
  value: string;
  label: string;
  sub: string;
  dotColour: string;
}

// ─── Option data ──────────────────────────────────────────────────────────────
const AVAILABILITY_OPTS: Option[] = [
  { value: 'free',  label: 'Free',  sub: 'Up for it right now',   dotColour: colours.orange },
  { value: 'maybe', label: 'Maybe', sub: 'Could be persuaded',    dotColour: colours.yellow },
  { value: 'busy',  label: 'Busy',  sub: 'Not right now',         dotColour: colours.stone  },
];

const LOCATION_OPTS: Option[] = [
  { value: 'my_place',       label: 'My place',         sub: 'Come to my place',            dotColour: colours.orange },
  { value: 'pub',            label: 'The pub',           sub: "Let's go out",                dotColour: colours.coral  },
  { value: 'out',            label: 'Out and about',     sub: "Let's see where we end up",   dotColour: colours.yellow },
  { value: 'someones_place', label: "Someone's place",  sub: 'Happy to come to your place', dotColour: colours.orange },
  { value: 'other',          label: 'Other…',            sub: 'Type your own location',      dotColour: colours.stone  },
];

const VIBE_OPTS: Option[] = [
  { value: 'im_paying',  label: "I'm paying",            sub: "It's on me this time",          dotColour: colours.yellow },
  { value: 'buying_own', label: 'Buying my own',         sub: 'Trying to stay in budget',      dotColour: colours.coral  },
  { value: 'free_cheap', label: 'Something free/cheap',  sub: "I'm broke but want to hang out", dotColour: colours.stone  },
  { value: 'suggest',    label: 'Suggest something',     sub: 'No preference',                 dotColour: colours.stone  },
  { value: 'other',      label: 'Other…',                sub: 'Type your own vibe',            dotColour: colours.stone  },
];

const EXPIRY_OPTS: Option[] = [
  { value: '1', label: '1 hour',   sub: 'Just for now',         dotColour: colours.yellow },
  { value: '2', label: '2 hours',  sub: 'A couple of hours',    dotColour: colours.yellow },
  { value: '4', label: '4 hours',  sub: 'Most of the evening',  dotColour: colours.coral  },
  { value: '8', label: '8 hours',  sub: 'All night',            dotColour: colours.orange },
];

const STEPS: Record<string, { question: string; hint: string; opts: Option[]; skippable: boolean }> = {
  availability: { question: 'How free\nare you?', hint: 'Your crew sees this instantly if you are free', opts: AVAILABILITY_OPTS, skippable: false },
  location:     { question: 'Where to?', hint: "Optional — skip if you're flexible", opts: LOCATION_OPTS, skippable: true },
  vibe:         { question: "What's the vibe?", hint: "Optional — skip if you're easy either way", opts: VIBE_OPTS, skippable: true },
  expiry:       { question: 'How long\nare you free?', hint: 'Skip to use the default of 8 hours', opts: EXPIRY_OPTS, skippable: true },
};

// ─── Option row component ─────────────────────────────────────────────────────
const OptionRow: React.FC<{
  option: Option;
  selected: boolean;
  onPress: () => void;
}> = ({ option, selected, onPress }) => (
  <TouchableOpacity
    style={[styles.optRow, selected ? styles.optRowSel : styles.optRowUnsel]}
    onPress={onPress}
    accessibilityRole="radio"
    accessibilityState={{ checked: selected }}
  >
    <View style={styles.optLeft}>
      <View style={[styles.optDot, { backgroundColor: selected ? option.dotColour : 'rgba(255,255,255,0.15)' }]} />
      <View>
        <Text style={[styles.optLabel, selected ? styles.optLabelSel : styles.optLabelUnsel]}>{option.label}</Text>
        <Text style={[styles.optSub, selected ? styles.optSubSel : styles.optSubUnsel]}>{option.sub}</Text>
      </View>
    </View>
    <View style={[styles.check, selected && styles.checkSel]}>
      {selected && <Text style={styles.checkMark}>✓</Text>}
    </View>
  </TouchableOpacity>
);

// ─── Main component ───────────────────────────────────────────────────────────
const StatusPickerScreen: React.FC = () => {
  const navigation = useNavigation<AppNavProp<'StatusPicker'>>();
  const route = useRoute<AppRouteProp<'StatusPicker'>>();
  const { groupId, groupName } = route.params;
  const { setMyStatus } = useStatusStore();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();

  const [state, setState]       = useState<PickerState>({ availability: null, location: null, locationNote: '', vibe: null, vibeNote: '', expiryHours: user?.defaultExpiryHours ?? 8 });
  const [stepIdx, setStepIdx]   = useState(0);
  const [loading, setLoading]   = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const getActiveSteps = (): Step[] => {
    if (!state.availability || state.availability === 'busy') return ['availability', 'confirm'];
    if (state.availability === 'maybe') return ['availability', 'expiry', 'confirm'];
    return ['availability', 'location', 'vibe', 'expiry', 'confirm'];
  };

  const activeSteps = getActiveSteps();
  const currentStep = activeSteps[stepIdx] as Step;
  const isLastStep  = stepIdx === activeSteps.length - 2; // last before confirm
  const stepConfig  = currentStep !== 'confirm' ? STEPS[currentStep] : null;

  const getSelection = (): string | null => {
    if (currentStep === 'availability') return state.availability;
    if (currentStep === 'location')     return state.location;
    if (currentStep === 'vibe')         return state.vibe;
    if (currentStep === 'expiry')       return String(state.expiryHours);
    return null;
  };

  const setSelection = (value: string) => {
    if (currentStep === 'availability') setState((s) => ({ ...s, availability: value as Availability }));
    if (currentStep === 'location')     setState((s) => ({ ...s, location: value as Location }));
    if (currentStep === 'vibe')         setState((s) => ({ ...s, vibe: value as Vibe }));
    if (currentStep === 'expiry')       setState((s) => ({ ...s, expiryHours: Number(value) }));
  };

  const handleNext = () => {
    const nextSteps = getActiveSteps();
    if (stepIdx < nextSteps.length - 2) {
      setStepIdx((i) => i + 1);
    } else {
      handleBroadcast();
    }
  };

  const handleSkip = () => {
    const nextSteps = getActiveSteps();
    if (stepIdx < nextSteps.length - 2) {
      setStepIdx((i) => i + 1);
    } else {
      handleBroadcast();
    }
  };

  const handleBroadcast = async () => {
    setLoading(true);
    try {
      const status = await setStatus(groupId, user!.id, {
        availability: state.availability!,
        location: state.location,
        locationNote: state.location === 'other' ? state.locationNote.trim() : null,
        vibe: state.vibe,
        vibeNote: state.vibe === 'other' ? state.vibeNote.trim() : null,
        expiryHours: state.expiryHours,
      });
      setMyStatus(groupId, status);
      if (state.availability === 'busy') {
        navigation.navigate('Home');
      } else {
        setConfirmed(true);
      }
    } catch (err: any) {
      console.error('[Picker] Broadcast failed:', err);
      Alert.alert('Could not set status', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const statusPillText = (): string => {
    const parts: string[] = [];
    if (state.availability) parts.push(state.availability.charAt(0).toUpperCase() + state.availability.slice(1));
    if (state.location)     parts.push(state.location === 'other' ? state.locationNote : formatLocation(state.location));
    if (state.vibe)         parts.push(state.vibe === 'other' ? state.vibeNote : formatVibe(state.vibe));
    return parts.join(' · ');
  };

  const confirmCopy = state.availability === 'busy'
    ? `Your status in ${groupName} is updated.`
    : `Your crew in ${groupName} has been notified.`;

  // ─── Confirmation screen ────────────────────────────────────────────────────
  if (confirmed) {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <View style={styles.confirmScreen}>
          <View style={styles.tickRing}>
            <View style={styles.tickInner}>
              <Text style={styles.tick}>✓</Text>
            </View>
          </View>
          <Text style={styles.confirmTitle}>{confirmCopy}</Text>
          <View style={styles.statusPill}>
            <View style={styles.pillDot} />
            <Text style={styles.pillText}>{statusPillText()}</Text>
          </View>
          <Text style={styles.confirmSub}>Status expires in {state.expiryHours === 1 ? '1 hour' : `${state.expiryHours} hours`}.</Text>
          <TouchableOpacity style={styles.homeBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.homeBtnText}>Update status</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Picker steps ───────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.statusBarSpacer} />

      {/* Progress dots */}
      <View style={styles.dotsRow}>
        {getActiveSteps().filter((s) => s !== 'confirm').map((step, i) => (
          <View
            key={step}
            style={[
              styles.dot,
              i < stepIdx  && styles.dotDone,
              i === stepIdx && styles.dotActive,
              i > stepIdx  && styles.dotTodo,
            ]}
          />
        ))}
      </View>

      {/* Question */}
      <Text style={styles.question}>{stepConfig?.question}</Text>
      <Text style={styles.hint}>{stepConfig?.hint}</Text>

      {/* Options */}
      <ScrollView style={styles.opts} showsVerticalScrollIndicator={false}>
        {stepConfig?.opts.map((opt) => (
          <OptionRow
            key={opt.value}
            option={opt}
            selected={getSelection() === opt.value}
            onPress={() => setSelection(opt.value)}
          />
        ))}
      </ScrollView>

      {/* Other — inline note input */}
      {currentStep === 'location' && state.location === 'other' && (
        <TextInput
          style={styles.noteInput}
          value={state.locationNote}
          onChangeText={(t) => setState((s) => ({ ...s, locationNote: t }))}
          placeholder="Where are you thinking?"
          placeholderTextColor="rgba(255,255,255,0.3)"
          maxLength={100}
          autoFocus
        />
      )}
      {currentStep === 'vibe' && state.vibe === 'other' && (
        <TextInput
          style={styles.noteInput}
          value={state.vibeNote}
          onChangeText={(t) => setState((s) => ({ ...s, vibeNote: t }))}
          placeholder="What's the vibe?"
          placeholderTextColor="rgba(255,255,255,0.3)"
          maxLength={100}
          autoFocus
        />
      )}

      {/* Skip */}
      {stepConfig?.skippable && (
        <TouchableOpacity style={styles.skipRow} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip this</Text>
        </TouchableOpacity>
      )}

      {/* CTA */}
      <TouchableOpacity
        style={[styles.cta,
          ((!getSelection() && !stepConfig?.skippable) ||
           (currentStep === 'location' && state.location === 'other' && !state.locationNote.trim()) ||
           (currentStep === 'vibe'     && state.vibe     === 'other' && !state.vibeNote.trim()))
          && styles.ctaDisabled,
          { marginBottom: insets.bottom + 16 }]}
        onPress={handleNext}
        disabled={
          (!getSelection() && !stepConfig?.skippable) ||
          (currentStep === 'location' && state.location === 'other' && !state.locationNote.trim()) ||
          (currentStep === 'vibe'     && state.vibe     === 'other' && !state.vibeNote.trim()) ||
          loading
        }
      >
        {loading
          ? <ActivityIndicator color={colours.plum} />
          : <Text style={styles.ctaText}>{isLastStep ? (state.availability === 'busy' ? 'Submit' : 'Let everyone know') : 'Next'}</Text>
        }
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: colours.plum },
  statusBarSpacer: { height: 52 },
  dotsRow:         { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 20 },
  dot:             { width: 6, height: 6, borderRadius: 3 },
  dotActive:       { backgroundColor: colours.orange, transform: [{ scale: 1.2 }] },
  dotDone:         { backgroundColor: colours.orange, opacity: 0.4 },
  dotTodo:         { backgroundColor: 'rgba(255,255,255,0.15)' },
  question:        { fontSize: 22, fontWeight: '700', color: colours.white, lineHeight: 28, paddingHorizontal: 20, marginBottom: 6 },
  hint:            { fontSize: 11, color: 'rgba(255,255,255,0.35)', paddingHorizontal: 20, marginBottom: 18 },
  opts:            { flex: 1, paddingHorizontal: 16 },
  noteInput:       { marginHorizontal: 16, marginTop: 4, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colours.white, borderWidth: 1, borderColor: 'rgba(255,107,53,0.4)' },
  optRow:          { borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optRowSel:       { backgroundColor: 'rgba(255,107,53,0.18)', borderWidth: 1, borderColor: 'rgba(255,107,53,0.4)' },
  optRowUnsel:     { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'transparent' },
  optLeft:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optDot:          { width: 10, height: 10, borderRadius: 5 },
  optLabel:        { fontSize: 15, fontWeight: '600' },
  optLabelSel:     { color: colours.white },
  optLabelUnsel:   { color: 'rgba(255,255,255,0.5)' },
  optSub:          { fontSize: 11, marginTop: 2 },
  optSubSel:       { color: 'rgba(255,255,255,0.55)' },
  optSubUnsel:     { color: 'rgba(255,255,255,0.25)' },
  check:           { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  checkSel:        { backgroundColor: colours.orange, borderColor: colours.orange },
  checkMark:       { color: colours.white, fontSize: 11, fontWeight: '700' },
  skipRow:         { alignItems: 'flex-end', paddingHorizontal: 20, paddingVertical: 8 },
  skipText:        { fontSize: 11, color: 'rgba(255,255,255,0.3)' },
  cta:             { margin: 16, backgroundColor: colours.yellow, borderRadius: 14, padding: 16, alignItems: 'center' },
  ctaDisabled:     { opacity: 0.35 },
  ctaText:         { fontSize: 15, fontWeight: '700', color: colours.plum },
  confirmScreen:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  tickRing:        { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,107,53,0.15)', borderWidth: 2, borderColor: colours.orange, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  tickInner:       { width: 44, height: 44, borderRadius: 22, backgroundColor: colours.orange, alignItems: 'center', justifyContent: 'center' },
  tick:            { color: colours.white, fontSize: 20, fontWeight: '700' },
  confirmTitle:    { fontSize: 20, fontWeight: '700', color: colours.white, textAlign: 'center', marginBottom: 16 },
  statusPill:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,107,53,0.2)', borderWidth: 1, borderColor: 'rgba(255,107,53,0.4)', borderRadius: 99, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 16 },
  pillDot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: colours.orange },
  pillText:        { fontSize: 13, fontWeight: '600', color: colours.orange },
  confirmSub:      { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 28 },
  homeBtn:         { backgroundColor: colours.orange, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48 },
  homeBtnText:     { fontSize: 16, fontWeight: '700', color: colours.white },
});

export default StatusPickerScreen;
