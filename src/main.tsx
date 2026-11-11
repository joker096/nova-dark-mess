import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { LanguageProvider } from './context/LanguageContext';
import { SecurityProvider } from './context/SecurityContext';
import './index.css';
import i18n, { loadLanguage } from './i18n';

const bootstrap = async () => {
  // The active locale may still be a lazy chunk; load it before the first paint
  // so the UI never flashes translation keys.
  await loadLanguage(i18n.language);

  createRoot(document.getElementById('root')!).render(
    <LanguageProvider>
      <SecurityProvider>
        <App />
      </SecurityProvider>
    </LanguageProvider>
  );
};

void bootstrap();
