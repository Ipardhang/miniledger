import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../theme';

type Props = {
  title: string;
  onPress: () => void;
  busy?: boolean;
  variant?: 'primary' | 'ghost';
};

export default function Button({ title, onPress, busy, variant = 'primary' }: Props) {
  const ghost = variant === 'ghost';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.btn, ghost ? styles.ghost : styles.primary, busy && { opacity: 0.7 }]}
    >
      {busy ? (
        <ActivityIndicator color={ghost ? colors.primary : '#fff'} />
      ) : (
        <Text style={[styles.text, ghost && { color: colors.primary }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.primary },
  ghost: { backgroundColor: 'transparent' },
  text: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
