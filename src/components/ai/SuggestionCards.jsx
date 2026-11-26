import { useTranslation } from 'react-i18next';
import { BookOpen, TrendingUp, BrainCircuit, Compass, Award, Settings } from 'lucide-react';
import styles from '../../pages/AIAgent.module.css';

const ITEMS = [
  { key: 'learn',    Icon: BookOpen,     prompt: 'What techniques can I learn at my current belt? Start with the next three.' },
  { key: 'progress', Icon: TrendingUp,   prompt: 'How is my progress overall, and what should I focus on next?' },
  { key: 'quizzes',  Icon: BrainCircuit, prompt: 'How have my recent quiz attempts been? What should I improve?' },
  { key: 'explore',  Icon: Compass,      prompt: 'What can you help me with in this app?' },
  { key: 'belt',     Icon: Award,        prompt: 'How close am I to my next belt?' },
  { key: 'profile',  Icon: Settings,     prompt: 'What does my profile look like right now?' },
];

export default function SuggestionCards({ onPick }) {
  const { t } = useTranslation();
  return (
    <div className={styles.suggestionsWrap}>
      <p className={styles.suggestionsIntro}>{t('aiAgent.suggestionsIntro')}</p>
      <div className={styles.suggestionGrid}>
        {ITEMS.map(({ key, Icon, prompt }) => (
          <button key={key} type="button" className={styles.suggestionCard} onClick={() => onPick(prompt)}>
            <Icon size={19} strokeWidth={1.8} className={styles.suggestionIcon} />
            <div>
              <div className={styles.suggestionTitle}>{t(`aiAgent.suggestions.${key}.title`)}</div>
              <div className={styles.suggestionDesc}>{t(`aiAgent.suggestions.${key}.desc`)}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}