import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, User as UserIcon, Copy, Check, RotateCcw, ExternalLink } from 'lucide-react';
import styles from '../../pages/AIAgent.module.css';

function renderInline(text) {
  // Very small markdown subset: **bold**, `code`, and bare URLs in [label](url) form.
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0, m, key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) parts.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) parts.push(<code key={key++} className={styles.inlineCode}>{tok.slice(1, -1)}</code>);
    else {
      const mm = tok.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (mm) parts.push(<a key={key++} href={mm[2]} className={styles.inlineLink}>{mm[1]}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

export default function ChatMessage({ message, isLast, onRegenerate }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className={`${styles.msgRow} ${isUser ? styles.msgRowUser : styles.msgRowAI}`}>
      <div className={styles.msgAvatar} aria-hidden="true">
        {isUser ? <UserIcon size={15} strokeWidth={2} /> : <Sparkles size={15} strokeWidth={2} />}
      </div>

      <div className={styles.msgCol}>
        <div className={styles.msgBubble}>
          <div className={styles.msgText}>
            {(message.content || '').split('\n').map((line, i) => (
              <p key={i}>{line ? renderInline(line) : '\u00A0'}</p>
            ))}
          </div>
        </div>

        {!isUser && message.content && (
          <div className={styles.msgActions}>
            <button type="button" onClick={copy} className={styles.msgActionBtn} title={t('common.copy', 'Copy')}>
              {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2} />}
            </button>
            {isLast && onRegenerate && (
              <button type="button" onClick={onRegenerate} className={styles.msgActionBtn} title={t('aiAgent.regenerate')}>
                <RotateCcw size={13} strokeWidth={2} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}