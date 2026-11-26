import { useState, useRef, useEffect, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Square, Mic, MicOff } from 'lucide-react';
import styles from '../../pages/AIAgent.module.css';

const ChatInput = forwardRef(function ChatInput({ onSend, onStop, disabled, generating }, ref) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [listening, setListening] = useState(false);
  const internalRef = useRef(null);
  const recRef = useRef(null);

  // Merge internal ref with forwarded ref
  useEffect(() => {
    if (typeof ref === 'function') ref(internalRef.current);
    else if (ref) ref.current = internalRef.current;
  }, [ref]);

  useEffect(() => {
    const ta = internalRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
  }, [value]);

  const submit = () => {
    const v = value.trim();
    if (!v || disabled) return;
    onSend(v);
    setValue('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    if (e.key === 'Escape' && generating)  { e.preventDefault(); onStop?.(); }
  };

  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = document.documentElement.lang || 'en-US';
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setValue(v => (v ? v + ' ' : '') + transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  };

  const voiceSupported = typeof window !== 'undefined'
    && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  return (
    <div className={styles.inputWrap}>
      <div className={styles.inputBar}>
        <textarea
          ref={internalRef}
          className={styles.textarea}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('aiAgent.inputPlaceholder')}
          rows={1}
          disabled={disabled}
          aria-label={t('aiAgent.inputPlaceholder')}
        />

        {voiceSupported && (
          <button
            type="button"
            className={`${styles.iconBtn} ${listening ? styles.iconBtnActive : ''}`}
            onClick={toggleVoice}
            title={listening ? t('aiAgent.stopVoice') : t('aiAgent.startVoice')}
            disabled={disabled}
          >
            {listening ? <MicOff size={17} strokeWidth={2} /> : <Mic size={17} strokeWidth={2} />}
          </button>
        )}

        {generating ? (
          <button
            type="button"
            className={styles.stopBtn}
            onClick={onStop}
            title={t('aiAgent.stop')}
            aria-label={t('aiAgent.stop')}
          >
            <Square size={15} strokeWidth={2.5} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            className={styles.sendBtn}
            onClick={submit}
            disabled={disabled || !value.trim()}
            aria-label={t('aiAgent.send')}
          >
            <Send size={17} strokeWidth={2} />
          </button>
        )}
      </div>

      <p className={styles.disclaimer}>{t('aiAgent.disclaimer')}</p>
    </div>
  );
});

export default ChatInput;