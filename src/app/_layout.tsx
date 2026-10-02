import { Slot, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/features/registry';
import { CornerMenus } from '@/features/nav/CornerMenus';
import { ThemeProvider, useTheme } from '@/theme';

function Shell() {
  const { palette } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <StatusBar style={palette.scheme === 'dark' ? 'light' : 'dark'} />
      {/* Web: render only the current screen (the browser keeps the history). Native: a stack. */}
      {Platform.OS === 'web' ? (
        <Slot />
      ) : (
        <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: palette.bg } }} />
      )}
      <CornerMenus />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
