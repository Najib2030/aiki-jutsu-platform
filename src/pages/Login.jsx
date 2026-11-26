// src/pages/Login.jsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mail, Lock, LogIn, KeyRound, Eye, EyeOff,
} from 'lucide-react';
import styles from './Auth.module.css';
import { notifyMainAdminsOfAuthEvent } from '../utils/adminAuthNotifications';
import dojoIcon from '../assets/dojo-icon.png';

// Inline language switcher (compact codes for the auth cards)
const LANGUAGES = [
  { code: 'en', short: 'EN', label: 'English' },
  { code: 'fr', short: 'FR', label: 'Français' },
  { code: 'ar', short: 'AR', label: 'العربية' },
];

export default function Login() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));

      if (userDoc.exists()) {
        const data = userDoc.data();

        if (data.isDisabled) {
          try { await signOut(auth); } catch (_) { /* ignore */ }
          setError(t('login.errDisabled'));
          return;
        }

        const isVerified =
          userCredential.user.emailVerified || data.adminVerified === true;
        if (!isVerified) {
          try { await signOut(auth); } catch (_) { /* ignore */ }
          setError(t('login.errUnverified'));
          return;
        }

        notifyMainAdminsOfAuthEvent({
          actor: {
            uid: userCredential.user.uid,
            name: data.name,
            email: data.email || email,
            role: data.role,
            isMainAdmin: data.isMainAdmin === true,
          },
          action: 'login',
        });
      }

      navigate('/');
    } catch (err) {
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/user-not-found'
      ) {
        setError(t('login.errInvalidCredentials'));
      } else if (err.code === 'auth/too-many-requests') {
        setError(t('login.errTooManyRequests'));
      } else if (err.code === 'auth/user-disabled') {
        setError(t('login.errUserDisabled'));
      } else {
        setError(t('login.errLoginFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    if (!email) return setError(t('login.errEmailRequired'));

    try {
      setError('');
      setMessage(t('login.sendingReset'));
      await sendPasswordResetEmail(auth, email);
      setMessage(t('login.resetSent'));
    } catch (err) {
      setError(t('login.errResetFailed'));
      setMessage('');
    }
  }

  return (
    <div className={styles.authContainer}>
      <div className={styles.card}>
        {/* Language switcher */}
        <div className={styles.langSwitcher}>
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              type="button"
              className={`${styles.langBtn} ${
                i18n.language === lang.code ? styles.langBtnActive : ''
              }`}
              onClick={() => i18n.changeLanguage(lang.code)}
              title={lang.label}
              aria-label={`Switch to ${lang.label}`}
            >
              {lang.short}
            </button>
          ))}
        </div>
        
        <Link to="/" className={styles.logoLink}>
          <img src={dojoIcon} alt="Aiki Jutsu Logo" className={styles.logoImg} />
        </Link>

        <h2 className={styles.title}>
          {isResetting ? (
            <KeyRound size={26} strokeWidth={2} className={styles.titleIcon} />
          ) : (
            <LogIn size={26} strokeWidth={2} className={styles.titleIcon} />
          )}
          {isResetting ? t('login.resetTitle') : t('login.title')}
        </h2>
        <p className={styles.subtitle}>
          {isResetting ? t('login.resetSubtitle') : t('login.subtitle')}
        </p>

        {error && <p className={styles.error}>{error}</p>}
        {message && <p className={styles.success}>{message}</p>}

        {isResetting ? (
          <form onSubmit={handleResetPassword} className={styles.form}>
            <div className={styles.inputGroup}>
              <label>{t('login.emailLabel')}</label>
              <div className={styles.inputWrap}>
                <Mail size={16} strokeWidth={2} className={styles.inputIcon} />
                <input
                  type="email"
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('login.emailPlaceholder')}
                  required
                />
              </div>
            </div>
            <button type="submit" className={styles.button}>
              <Mail size={18} strokeWidth={2} />
              {t('login.sendResetLink')}
            </button>
            <button
              type="button"
              onClick={() => { setIsResetting(false); setError(''); setMessage(''); }}
              className={styles.textButton}
            >
              {t('login.backToLogin')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <label>{t('login.emailLabel')}</label>
              <div className={styles.inputWrap}>
                <Mail size={16} strokeWidth={2} className={styles.inputIcon} />
                <input
                  type="email"
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('login.emailPlaceholder')}
                  required
                  disabled={submitting}
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label>{t('login.passwordLabel')}</label>
              <div className={styles.inputWrap}>
                <Lock size={16} strokeWidth={2} className={styles.inputIcon} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className={`${styles.input} ${styles.inputWithToggle}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder')}
                  required
                  disabled={submitting}
                />
                <button
                  type="button"
                  className={styles.pwToggle}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  title={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                </button>
              </div>
            </div>

            <button type="submit" className={styles.button} disabled={submitting}>
              <LogIn size={18} strokeWidth={2} />
              {submitting ? t('login.loggingIn') : t('login.login')}
            </button>

            <button
              type="button"
              onClick={() => { setIsResetting(true); setError(''); setMessage(''); }}
              className={styles.textButton}
            >
              {t('login.forgotPassword')}
            </button>
          </form>
        )}

        <p className={styles.footerText}>
          {t('login.noAccount')} <Link to="/register">{t('login.signUp')}</Link>
        </p>
      </div>
    </div>
  );
}