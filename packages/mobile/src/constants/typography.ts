import { StyleSheet } from 'react-native';
import { colours } from './colours';

export const typography = StyleSheet.create({
  // App wordmark
  wordmark: {
    fontSize: 13,
    fontWeight: '700',
    color: colours.orange,
    letterSpacing: 0.5,
  },

  // Screen titles (Groups, The Lads, etc.)
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colours.darkText,
  },

  // Status picker question
  pickerQuestion: {
    fontSize: 22,
    fontWeight: '700',
    color: colours.white,
    lineHeight: 28,
  },

  // Your status — large display
  statusLarge: {
    fontSize: 28,
    fontWeight: '700',
    color: colours.darkText,
    lineHeight: 32,
  },

  // Member name in feed
  memberName: {
    fontSize: 13,
    fontWeight: '500',
    color: colours.darkText,
  },

  // Status text in feed (right side)
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: colours.orange,
  },

  // Section labels (uppercase, small)
  sectionLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colours.stone,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // Sub text / meta
  subText: {
    fontSize: 10,
    fontWeight: '400',
    color: colours.stone,
  },

  // Body text
  body: {
    fontSize: 14,
    fontWeight: '400',
    color: colours.darkText,
    lineHeight: 20,
  },

  // Back navigation
  backText: {
    fontSize: 10,
    fontWeight: '400',
    color: colours.stone,
  },
});
