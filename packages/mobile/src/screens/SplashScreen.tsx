import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import LottieView from 'lottie-react-native';
import { colours } from '../constants/colours';

const { width } = Dimensions.get('window');

interface Props {
  onFinish: () => void;
}

const SplashScreen: React.FC<Props> = ({ onFinish }) => (
  <View style={styles.container}>
    <LottieView
      source={require('../../assets/avail-animated-icon.json')}
      autoPlay
      loop={false}
      onAnimationFinish={onFinish}
      style={styles.lottie}
    />
    <Text style={styles.wordmark}>avail</Text>
    <Text style={styles.tagline}>who's free right now</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colours.plum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lottie: {
    width: width * 0.5,
    height: width * 0.5,
  },
  wordmark: {
    fontSize: 42,
    fontWeight: '800',
    color: colours.orange,
    letterSpacing: -1.5,
    marginTop: 20,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.2,
    marginTop: 6,
  },
});

export default SplashScreen;
