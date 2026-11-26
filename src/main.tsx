import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { LanguageProvider } from './context/LanguageContext';
import { SecurityProvider } from './context/SecurityContext';
import { SettingsProvider } from './context/SettingsContext';
import { NovaToastProvider } from './lib/ui';
import { registerForPush, isPushSupported } from './lib/notifications/push';
import { registerBackgroundFetch } from './lib/background/backgroundFetch';
import { isTauri } from './lib/utils/platform';
import { initAccessibility } from './lib/accessibility/a11y';
import './index.css';
import i18n, { loadLanguage } from './i18n';

// Service worker is production-only. In dev it caches Vite modules cache-first,
// so a reload can mix stale and fresh React copies and break the app with
// "Invalid hook call". Clear any worker left behind by an older dev session.
if ('serviceWorker' in navigator && !isTauri()) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration failed (e.g., offline), ignore
      });
    });
  } else {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) void registration.unregister();
    });
    if ('caches' in window) {
      void caches.keys().then((keys) => {
        for (const key of keys) void caches.delete(key);
      });
    }
  }
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

  // Initialize push notifications after first paint (non-blocking)
  if (isPushSupported()) {
    // Small delay to not block initial render
    setTimeout(() => {
      registerForPush().catch((err) => {
        console.warn('[Push] Auto-registration failed:', err);
      });
    }, 2000);
  }

  // Initialize background fetch
  if (isTauri() || 'BackgroundFetchManager' in window || 'periodicSync' in navigator.serviceWorker) {
    setTimeout(() => {
      registerBackgroundFetch().catch((err) => {
        console.warn('[BackgroundFetch] Registration failed:', err);
      });
    }, 3000);
  }

  // Initialize accessibility (reduced motion, skip link, focus styles)
  initAccessibility();

  const root = createRoot(document.getElementById('root')!, {
    onUncaughtError: (error, errorInfo) => {
      (window as unknown as { __novaErrs?: string[] }).__novaErrs?.push(
        'UNCAUGHT:' + String((error as Error)?.stack || error) + '|' + String(errorInfo?.componentStack || ''),
      );
    },
    onCaughtError: (error, errorInfo) => {
      (window as unknown as { __novaErrs?: string[] }).__novaErrs?.push(
        'CAUGHT:' + String((error as Error)?.stack || error) + '|' + String(errorInfo?.componentStack || ''),
      );
    },
  });
  root.render(
    <LanguageProvider>
      <SecurityProvider>
        <SettingsProvider>
          <NovaToastProvider>
            <App />
          </NovaToastProvider>
        </SettingsProvider>
      </SecurityProvider>
    </LanguageProvider>
  );
};

void bootstrap();
