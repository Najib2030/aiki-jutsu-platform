import { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, PanelLeft, Settings2, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAIAgent } from '../hooks/useAIAgent';
import ChatMessage from '../components/ai/ChatMessage';
import ChatInput from '../components/ai/ChatInput';
import SuggestionCards from '../components/ai/SuggestionCards';
import ToolConfirmCard from '../components/ai/ToolConfirmCard';
import ConversationList from '../components/ai/ConversationList';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import styles from './AIAgent.module.css';

const MODELS = [
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B (Smart)' },
  { id: 'openai/gpt-oss-20b',  label: 'GPT-OSS 20B (Fast)' },
];
const TONES = ['concise', 'balanced', 'detailed'];

export default function AIAgent() {
  const { t, i18n } = useTranslation();
  const { userData } = useAuth();
  const navigate = useNavigate();
  const { setMobileMenuOpen } = useOutletContext() || {};
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const settingsRef = useRef(null);
  
  // Default open on desktop (>600px), closed on mobile
  const [sideOpen, setSideOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth > 600 : true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const agent = useAIAgent({ userData, navigate, t, i18n });
  const {
    conversations, activeId, messages, loading, streamingText, error, pendingTool,
    model, setModel, tone, setTone,
    sendMessage, stopGeneration, regenerate,
    confirmPendingTool, cancelPendingTool,
    openConversation, startNewConversation, removeConversation,
  } = agent;

  // Scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, streamingText, pendingTool]);

  // Global Typing Auto-Focus
  useEffect(() => {
    const handleGlobalKeydown = (e) => {
      // Ignore modifiers, arrows, and non-printable keys
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length > 1) return;
      
      const target = e.target;
      // Ignore if already typing in an input/textarea
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // Focus the chat input and type the character
      if (inputRef.current) {
        inputRef.current.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, []);

  // Ctrl+K for new chat
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        startNewConversation();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startNewConversation]);

  // Settings click-away
  useEffect(() => {
    if (!settingsOpen) return;
    const handleClick = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [settingsOpen]);

  const empty = messages.length === 0 && !streamingText;
  const visible = messages.filter(m => m.role === 'user' || (m.role === 'assistant' && m.content));

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await removeConversation(deleteTarget);
    setDeleteTarget(null);
  };

  return (
    <div className={styles.page}>
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        open={sideOpen}
        onClose={() => setSideOpen(false)}
        onSelect={openConversation}
        onNew={startNewConversation}
        onDelete={(id) => setDeleteTarget(id)}
      />

      <div className={styles.main}>
        {/* ── Header ── */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            {/* Mobile Burger Menu */}
            <button
              type="button"
              className={`${styles.iconGhost} ${styles.mobileBurger}`}
              onClick={() => setMobileMenuOpen && setMobileMenuOpen(true)}
              aria-label="Open Main Menu"
            >
              <Menu size={20} strokeWidth={2} />
            </button>
            
            {/* Desktop Toggle Sidebar */}
            <button
              type="button"
              className={`${styles.iconGhost} ${styles.desktopToggle}`}
              onClick={() => setSideOpen(o => !o)}
              aria-label="Toggle History"
            >
              <PanelLeft size={18} strokeWidth={2} />
            </button>

            <div className={styles.brand}>
              <Sparkles size={19} strokeWidth={2} />
              <span>{t('aiAgent.pageTitle')}</span>
            </div>

            <span className={styles.status}>
              <span className={styles.statusDot} />
              {t('aiAgent.online')}
            </span>
          </div>

          <div className={styles.headerRight}>
            <div className={styles.settingsWrap} ref={settingsRef}>
              <button
                type="button"
                className={styles.iconGhost}
                onClick={() => setSettingsOpen(o => !o)}
                aria-label={t('aiAgent.settings')}
                title={t('aiAgent.settings')}
              >
                <Settings2 size={17} strokeWidth={2} />
              </button>

              {settingsOpen && (
                <div className={styles.settingsPop}>
                  <label className={styles.settingsLabel}>{t('aiAgent.model')}</label>
                  <select
                    className={styles.settingsSelect}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>

                  <label className={styles.settingsLabel}>{t('aiAgent.tone')}</label>
                  <div className={styles.toneGroup}>
                    {TONES.map(tn => (
                      <button
                        key={tn}
                        type="button"
                        className={`${styles.toneBtn} ${tone === tn ? styles.toneBtnActive : ''}`}
                        onClick={() => setTone(tn)}
                      >
                        {t(`aiAgent.tones.${tn}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Body ── */}
        <main className={styles.body}>
          {empty ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyGlyph} aria-hidden="true">合</div>
              <h1 className={styles.emptyTitle}>{t('aiAgent.greeting')}</h1>
              <p className={styles.emptySub}>{t('aiAgent.greetingSub')}</p>
              <SuggestionCards onPick={sendMessage} />
            </div>
          ) : (
            <div className={styles.messagesList}>
              {visible.map((m, i) => (
                <ChatMessage
                  key={i}
                  message={m}
                  isLast={i === visible.length - 1 && !loading && !pendingTool}
                  onRegenerate={regenerate}
                />
              ))}

              {streamingText && (
                <ChatMessage message={{ role: 'assistant', content: streamingText }} />
              )}

              {loading && !streamingText && !pendingTool && (
                <div className={styles.typingRow} aria-live="polite">
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                </div>
              )}

              {pendingTool && (
                <ToolConfirmCard
                  tool={pendingTool}
                  onConfirm={confirmPendingTool}
                  onCancel={cancelPendingTool}
                  disabled={loading}
                />
              )}

              {error && <div className={styles.errorBubble}>{error}</div>}
              <div ref={endRef} />
            </div>
          )}
        </main>

        {/* ── Footer ── */}
        <footer className={styles.footer}>
          <ChatInput
            ref={inputRef}
            onSend={sendMessage}
            onStop={stopGeneration}
            disabled={loading || !!pendingTool}
            generating={loading}
          />
        </footer>
      </div>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        title={t('aiAgent.deleteTitle')}
        message={t('aiAgent.deleteMessage')}
        confirmLabel={t('common.delete', 'Delete')}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}