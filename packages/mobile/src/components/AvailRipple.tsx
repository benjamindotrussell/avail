import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, StyleSheet } from 'react-native';

const ORANGE = '#FF6B35';
const CORAL  = '#FF9A6C';
const YELLOW = '#FFD166';

const NODES = [
  { angle: -55,  colour: YELLOW },
  { angle: 200,  colour: CORAL  },
  { angle: 310,  colour: ORANGE },
];

function useRippleLoop(delay: number) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return anim;
}

interface Props { size?: number }

const AvailRipple: React.FC<Props> = ({ size = 120 }) => {
  const primaryRipple = useRippleLoop(0);
  const nodeRipple0   = useRippleLoop(700);
  const nodeRipple1   = useRippleLoop(820);
  const nodeRipple2   = useRippleLoop(760);
  const nodeRipples   = [nodeRipple0, nodeRipple1, nodeRipple2];

  const centreScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(centreScale, { toValue: 1.18, duration: 700, easing: Easing.inOut(Easing.sine), useNativeDriver: true }),
        Animated.timing(centreScale, { toValue: 1,    duration: 700, easing: Easing.inOut(Easing.sine), useNativeDriver: true }),
        Animated.delay(600),
      ])
    ).start();
  }, []);

  const orbit  = size * 0.36;
  const centreR = size * 0.1;
  const innerR  = size * 0.05;
  const dotR    = size * 0.075;
  const maxRing = size * 0.88;

  const primaryScale   = primaryRipple.interpolate({ inputRange: [0, 1], outputRange: [0.05, 1] });
  const primaryOpacity = primaryRipple.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.55, 0.15, 0] });

  return (
    <View style={{ width: size, height: size }}>
      {/* Primary expanding ring */}
      <Animated.View style={[
        styles.ring,
        {
          width: maxRing, height: maxRing,
          borderRadius: maxRing / 2,
          borderColor: ORANGE,
          borderWidth: Math.max(1.5, size * 0.014),
          left: (size - maxRing) / 2,
          top:  (size - maxRing) / 2,
          opacity: primaryOpacity,
          transform: [{ scale: primaryScale }],
        },
      ]} />

      {/* Nodes */}
      {NODES.map((node, i) => {
        const rad = (node.angle * Math.PI) / 180;
        const nx  = size / 2 + Math.cos(rad) * orbit - dotR;
        const ny  = size / 2 + Math.sin(rad) * orbit - dotR;
        const rippleScale   = nodeRipples[i].interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
        const rippleOpacity = nodeRipples[i].interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 0.4, 0] });
        return (
          <View key={i} style={{ position: 'absolute', left: nx, top: ny, width: dotR * 2, height: dotR * 2 }}>
            <Animated.View style={[
              styles.ring,
              {
                width: dotR * 2, height: dotR * 2, borderRadius: dotR,
                borderColor: node.colour, borderWidth: Math.max(1, size * 0.012),
                opacity: rippleOpacity,
                transform: [{ scale: rippleScale }],
              },
            ]} />
            <View style={[styles.dot, { width: dotR * 2, height: dotR * 2, borderRadius: dotR, backgroundColor: node.colour }]} />
          </View>
        );
      })}

      {/* Centre orange dot */}
      <Animated.View style={[
        styles.dot,
        {
          width: centreR * 2, height: centreR * 2, borderRadius: centreR,
          backgroundColor: ORANGE,
          left: size / 2 - centreR, top: size / 2 - centreR,
          transform: [{ scale: centreScale }],
        },
      ]} />
      {/* Inner yellow dot */}
      <View style={[
        styles.dot,
        {
          width: innerR * 2, height: innerR * 2, borderRadius: innerR,
          backgroundColor: YELLOW,
          left: size / 2 - innerR, top: size / 2 - innerR,
        },
      ]} />
    </View>
  );
};

const styles = StyleSheet.create({
  ring: { position: 'absolute', backgroundColor: 'transparent' },
  dot:  { position: 'absolute' },
});

export default AvailRipple;
