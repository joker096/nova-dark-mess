import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { LanguageProvider } from './context/LanguageContext';
import { SecurityProvider } from './context/SecurityContext';
import { NovaToastProvider } from './lib/ui';
import './index.css';
import i18n, { loadLanguage } from './i18n';

const bootstrap = async () => {
  // The Android Tauri shell applies window insets as native padding, so stop
  // CSS env() from adding the same status/navigation bar space a second time.
  if (
    /Android/i.test(navigator.userAgent) &&
    '__TAURI_INTERNALS__' in window
  ) {
    document.documentElement.classList.add('native-safe-insets');
  }

  // The active locale may still be a lazy chunk; load it before the first paint
  // so the UI never flashes translation keys.
  await loadLanguage(i18n.language);

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
