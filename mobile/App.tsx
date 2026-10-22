import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api, loadToken, setUnauthorizedHandler } from './src/api';
import AddEntryScreen from './src/screens/AddEntryScreen';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import { colors } from './src/theme';

export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    // If the API ever says our token is invalid, drop back to the login screen.
    setUnauthorizedHandler(() => {
      setAdding(false);
      setAuthed(false);
    });
    loadToken().then((t) => {
      setAuthed(!!t);
      setReady(true);
    });
  }, []);

  async function logout() {
    await api.logout();
    setAdding(false);
    setAuthed(false);
  }

  let content;
  if (!ready) {
    content = (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  } else if (!authed) {
    content = <LoginScreen onLoggedIn={() => setAuthed(true)} />;
  } else if (adding) {
    // HomeScreen re-fetches when it mounts again, so the new entry shows up.
    content = <AddEntryScreen onDone={() => setAdding(false)} />;
  } else {
    content = <HomeScreen onAdd={() => setAdding(true)} onLogout={logout} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {content}
    </SafeAreaProvider>
  );
}
