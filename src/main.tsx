import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { LanguageProvider } from './context/LanguageContext';
import { SecurityProvider } from './context/SecurityContext';
import { NovaToastProvider } from './lib/ui';
import './index.css';
import i18n, { loadLanguage } from './i18n';

// Register service worker for offline caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failed (e.g., offline), ignore
    });
  });
}

const bootstrap = async () => {
  // The Android Tauri shell applies window insets as native padding, so stop
  // CSS env() from adding the same status/navigation bar space a second time.
  if (
    /Android/i.test(navigator.userAgent) &&
    '__TAURI_INTERNALS__' in window
  ) {
    document.documentElement.classList.add('native-safe-insets');
  }

  // The active locale may still be a lazy chunk; kick off loading in parallel
  // with the first paint so the shell renders immediately. Non-English locales
  // load in the background; English is bundled up front and is a no-op here.
  // A locale load failure is non-fatal: the UI falls back to English.
  void loadLanguage(i18n.language).catch(() => {
    /* locale load failure is non-fatal */
  });

  createRoot(document.getElementById('root')!).render(
    <LanguageProvider>
      <SecurityProvider>
        <NovaToastProvider>
          <App />
        </NovaToastProvider>
      </SecurityProvider>
    </LanguageProvider>
  );
};

void bootstrap();
