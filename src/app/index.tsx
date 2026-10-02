import { StyleSheet, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        OpenBerea
      </Text>
      <Text style={styles.body}>A free, open-source Bible study website.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFAE1', padding: 24 },
  title: { fontSize: 32, color: '#1C1A17', marginBottom: 8 },
  body: { fontSize: 18, color: '#1C1A17' },
});
