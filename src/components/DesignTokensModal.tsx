import React, { useState } from 'react';
import { Copy, Check, Palette, GitBranch, Terminal, FileCode2, Sparkles } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { sanitizeHtml } from '../lib/security/sanitize';
import { useWheelScroll } from '../lib/ui/useWheelScroll';

export const DesignTokensModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'repo' | 'tokens' | 'patch'>('repo');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const tokensTabRef = useWheelScroll();

  if (!isOpen) return null;

  const copyCode = (code: string, key: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const tokens = [
    { label: 'Primary Brand Accent', hex: '#ff4e18', role: 'Active tabs, outgoing bubbles, unread count badges, active icon glow' },
    { label: 'Deep Space Canvas', hex: '#0b0c10', role: 'Main background beneath messages and cards' },
    { label: 'Surface Card Dark', hex: '#171820', role: 'Chat cards, incoming bubbles, timeline posts, info card' },
    { label: 'Elevated Glass Dock', hex: '#181921', role: 'Bottom floating dock, floating header pills (with backdrop-blur-xl)' },
    { label: 'Border Hairline', hex: 'rgba(255, 255, 255, 0.06)', role: 'Subtle translucent borders giving depth without harsh lines' },
    { label: 'Muted Typography', hex: '#8c919d', role: 'Last seen, timestamps, message snippets, subtitles' },
  ];

  // Specific replacement for joker096/neumorphic-ui/src/styles/messenger.css
  const repoMessengerCssReplacement = `/* ==========================================================================
   Nova Dark & Neon Orange Theme Override for joker096/neumorphic-ui
   File: src/styles/messenger.css
   ========================================================================== */

/* 1. Обновите блок переменных в начале src/styles/messenger.css: */
[data-theme="dark"] {
  --msg-bg-main: #0b0c10;
  --msg-bg-secondary: #121319;
  --msg-bg-panel: rgba(23, 24, 32, 0.94);
  --msg-bg-panel-hover: rgba(32, 34, 44, 0.95);
  --msg-bg-input: #181920;
  --msg-bg-composer: rgba(24, 25, 33, 0.94);
  --msg-glass-blur: 24px;
  --msg-glass-saturate: 160%;
  --msg-border: rgba(255, 255, 255, 0.07);
  --msg-border-soft: rgba(255, 255, 255, 0.04);
  --msg-border-hover: rgba(255, 255, 255, 0.16);
  --msg-ring: rgba(255, 78, 24, 0.3);
  --msg-text-primary: #ffffff;
  --msg-text-secondary: #8c919d;
  --msg-text-muted: #656975;
  --msg-accent: #ff4e18;
  --msg-accent-dark: #ff3b00;
  --msg-accent-soft: rgba(255, 78, 24, 0.16);
  --msg-on-accent: #ffffff;
  --msg-unread: #ff4e18;
  --msg-radius-sm: 14px;
  --msg-radius-md: 18px;
  --msg-radius-lg: 24px;
  --msg-radius-xl: 32px;
  --msg-radius-msg: 22px;
  --msg-radius-msg-tail-out: 4px;
  --msg-radius-msg-tail-in: 4px;
}

/* 2. Замените стили .message и .message.outgoing: */
.message {
  align-self: flex-start;
  max-width: 82%;
  box-sizing: border-box;
  padding: 12px 16px;
  font-size: 14.5px;
  line-height: 1.45;
  color: #e5e7eb;
  background: #181921;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 22px 22px 22px 4px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}

.message.outgoing {
  align-self: flex-end;
  background: linear-gradient(135deg, #ff521a 0%, #ff3b00 100%);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 22px 22px 4px 22px;
  color: #ffffff;
  box-shadow: 0 6px 20px rgba(255, 78, 24, 0.28);
}

.message.outgoing .message-meta {
  color: rgba(255, 255, 255, 0.85);
}`;

  // Specific replacement for joker096/neumorphic-ui/src/styles/tokens.css
  const repoTokensReplacement = `/* ==========================================================================
   Nova Typography & Palette Overrides for joker096/neumorphic-ui
   File: src/styles/tokens.css
   ========================================================================== */

:root {
  /* Замена устаревших шрифтов Libre Caslon / Karla на современный гротеск */
  --font-family-display: "Plus Jakarta Sans", -apple-system, sans-serif;
  --font-family-body: "Plus Jakarta Sans", -apple-system, sans-serif;
  --font-weight-display: 700;
  --font-weight-body-regular: 400;
  --font-weight-body-medium: 500;
  --font-weight-body-semibold: 600;

  /* Убираем тяжелые неоморфные тени */
  --neo-shadow-out: 0 4px 16px rgba(0, 0, 0, 0.4);
  --neo-shadow-in: none;
  --neo-shadow-inset: none;
}

[data-theme="dark"] {
  --bg-primary: #0b0c10;
  --bg-secondary: #171820;
  --bg-tertiary: #1f2029;
  --bg-elevated: #181921;
  --text-primary: #ffffff;
  --text-secondary: #8c919d;
  --text-tertiary: #6b707d;
  --border-color: rgba(255, 255, 255, 0.06);
  --accent: #ff4e18;
  --accent-rgb: 255, 78, 24;
  --accent-soft: rgba(255, 78, 24, 0.15);
  --accent2: #ff6b3d;
  --story-ring-unseen: #ff4e18;
  --story-ring-seen: #30333d;
}`;

  const gitPatchSnippet = `diff --git a/src/styles/tokens.css b/src/styles/tokens.css
--- a/src/styles/tokens.css
+++ b/src/styles/tokens.css
@@ -2,4 +2,4 @@
-:root {
-  --font-family-display: "Libre Caslon Text", serif;
-  --font-family-body: "Karla", sans-serif;
+:root {
+  --font-family-display: "Plus Jakarta Sans", -apple-system, sans-serif;
+  --font-family-body: "Plus Jakarta Sans", -apple-system, sans-serif;
@@ -182,10 +182,10 @@
 [data-theme="dark"] {
-  --bg-primary: #1a1a1a;
-  --bg-secondary: #222222;
-  --accent: #f97316;
+  --bg-primary: #0b0c10;
+  --bg-secondary: #171820;
+  --bg-elevated: #181921;
+  --accent: #ff4e18;
   --border-color: rgba(255, 255, 255, 0.06);
 }
diff --git a/src/styles/messenger.css b/src/styles/messenger.css
--- a/src/styles/messenger.css
+++ b/src/styles/messenger.css
@@ -22,8 +22,8 @@
 [data-theme="dark"] {
-  --msg-bg-main: #1a1a1a;
-  --msg-bg-input: rgba(255, 255, 255, 0.08);
-  --msg-accent: #f97316;
+  --msg-bg-main: #0b0c10;
+  --msg-bg-input: #181920;
+  --msg-accent: #ff4e18;
   --msg-radius-msg: 22px;
 }`;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-in fade-in">
      <div className="bg-[#121319] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#15161f]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--nova-accent-color)] flex items-center justify-center text-white shadow-lg shadow-[var(--nova-accent-color)]/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
                <span>{t('designTokens.subtitle')}</span>
                <span className="text-[10px] font-mono bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)] px-2 py-0.5 rounded-full border border-[var(--nova-accent-color)]/40">
                  {t('designTokens.readyToApply')}
                </span>
              </h2>
              <p className="text-xs text-[#8c919d]">
                {t('designTokens.description')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center text-sm transition"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div ref={tokensTabRef} className="px-5 pt-3 pb-2 border-b border-white/5 bg-[#14151c] flex items-center gap-2 overflow-x-auto scrollbar-x">
          <button
            onClick={() => setActiveTab('repo')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'repo'
                ? 'bg-[var(--nova-accent-color)] text-white shadow-md shadow-[var(--nova-accent-color)]/25'
                : 'text-[#8c919d] hover:text-white bg-white/5'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>{t('designTokens.tabRepo')}</span>
          </button>

          <button
            onClick={() => setActiveTab('patch')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'patch'
                ? 'bg-[var(--nova-accent-color)] text-white shadow-md shadow-[var(--nova-accent-color)]/25'
                : 'text-[#8c919d] hover:text-white bg-white/5'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{t('designTokens.tabPatch')}</span>
          </button>

          <button
            onClick={() => setActiveTab('tokens')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'tokens'
                ? 'bg-[var(--nova-accent-color)] text-white shadow-md shadow-[var(--nova-accent-color)]/25'
                : 'text-[#8c919d] hover:text-white bg-white/5'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>{t('designTokens.tabTokens')}</span>
          </button>
        </div>

        {/* Scrollable Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
          {activeTab === 'repo' && (
            <div className="space-y-6">
              <div className="p-4 bg-[#181922] border border-white/10 rounded-2xl flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)] flex items-center justify-center shrink-0 mt-0.5">
                  <FileCode2 className="w-4 h-4" />
                </div>
                <div className="text-xs text-[#a0a5b2] space-y-1">
                  <p className="font-semibold text-white text-sm">{t('designTokens.architectureTitle')}</p>
                  <p dangerouslySetInnerHTML={{ __html: sanitizeHtml(t('designTokens.architectureDesc'), { allowTags: true }) }} />
                  <p>{t('designTokens.architectureDesc2')}</p>
                </div>
              </div>

              {/* Step 1: src/styles/messenger.css */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[var(--nova-accent-color)] text-white text-[11px] flex items-center justify-center">1</span>
                    <span>{t('designTokens.step1Title')}</span>
                  </h3>
                  <button
                    onClick={() => copyCode(repoMessengerCssReplacement, 'msg-css')}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 text-xs text-white rounded-lg transition"
                  >
                    {copiedKey === 'msg-css' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'msg-css' ? t('designTokens.copied') : t('designTokens.copyCode')}</span>
                  </button>
                </div>
                <pre className="bg-[#090a0e] p-4 rounded-2xl border border-white/5 text-[11px] text-[#a0a5b2] overflow-x-auto font-mono">
                  <code>{repoMessengerCssReplacement}</code>
                </pre>
              </div>

              {/* Step 2: src/styles/tokens.css */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[var(--nova-accent-color)] text-white text-[11px] flex items-center justify-center">2</span>
                    <span>{t('designTokens.step2Title')}</span>
                  </h3>
                  <button
                    onClick={() => copyCode(repoTokensReplacement, 'tokens-css')}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 text-xs text-white rounded-lg transition"
                  >
                    {copiedKey === 'tokens-css' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'tokens-css' ? t('designTokens.copied') : t('designTokens.copyCode')}</span>
                  </button>
                </div>
                <pre className="bg-[#090a0e] p-4 rounded-2xl border border-white/5 text-[11px] text-[#a0a5b2] overflow-x-auto font-mono">
                  <code>{repoTokensReplacement}</code>
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'patch' && (
            <div className="space-y-4">
              <div className="text-xs text-[#a0a5b2]">
                <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(t('designTokens.patchInstruction'), { allowTags: true }) }} />
                <div className="my-2 p-2.5 bg-[#090a0e] rounded-xl font-mono text-white flex items-center justify-between border border-white/10">
                  <code>git apply nova.patch</code>
                  <button
                    onClick={() => copyCode('git apply nova.patch', 'cmd')}
                    className="text-xs text-[var(--nova-accent-color)] hover:underline"
                  >
                    {copiedKey === 'cmd' ? t('designTokens.copied') : t('designTokens.copy')}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white">{t('designTokens.patchContent')}</span>
                <button
                  onClick={() => copyCode(gitPatchSnippet, 'patch-file')}
                  className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 text-xs text-white rounded-lg transition"
                >
                    {copiedKey === 'patch-file' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'patch-file' ? t('designTokens.copied') : t('designTokens.copyPatch')}</span>
                </button>
              </div>
              <pre className="bg-[#090a0e] p-4 rounded-2xl border border-white/5 text-[11px] text-[#a0a5b2] overflow-x-auto font-mono">
                <code>{gitPatchSnippet}</code>
              </pre>
            </div>
          )}

          {activeTab === 'tokens' && (
            <div className="space-y-6">
              {/* Color Palette */}
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
                  {t('designTokens.tokensTitle')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {tokens.map((tok, i) => (
                    <div
                      key={i}
                      className="bg-[#181920] border border-white/5 p-3 rounded-2xl flex flex-col justify-between"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className="w-8 h-8 rounded-xl border border-white/10 shadow-sm shrink-0"
                          style={{ backgroundColor: tok.hex }}
                        />
                        <div>
                          <div className="text-xs font-semibold text-white">{tok.label}</div>
                          <div className="text-[11px] font-mono text-[var(--nova-accent-color)]">{tok.hex}</div>
                        </div>
                      </div>
                      <p className="text-[11px] text-[#787d8a] leading-tight">{tok.role}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between bg-[#101117]">
          <span className="text-xs text-[#8c919d]">
            {t('designTokens.footerNote')}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color, ff5f2e)] text-white font-semibold text-xs transition cursor-pointer"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
