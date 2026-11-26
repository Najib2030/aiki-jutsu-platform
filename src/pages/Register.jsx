// src/pages/Register.jsx
import { useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { auth, db } from '../firebase/config';
import { createUserWithEmailAndPassword, sendEmailVerification, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import {
  User, Mail, Lock, ShieldCheck, Calendar, UserPlus, Eye, EyeOff,
  MailCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import styles from './Auth.module.css';
import dojoIcon from '../assets/dojo-icon.png';

const LANGUAGES = [
  { code: 'en', short: 'EN', label: 'English' },
  { code: 'fr', short: 'FR', label: 'Français' },
  { code: 'ar', short: 'AR', label: 'العربية' },
];

function calcAge(birthDateStr) {
  if (!birthDateStr) return null;
  const parts = birthDateStr.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--;
  return age >= 0 ? age : null;
}

export default function Register() {
  const { t, i18n } = useTranslation();
  const { beginRegistration, endRegistration } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const computedAge = calcAge(birthDate);

  async function handleSubmit(e) {
    e.preventDefault();

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!passwordRegex.test(password)) {
      return setError(t('register.errPasswordRules'));
    }
    if (password !== confirmPassword) {
      return setError(t('register.errPasswordMismatch'));
    }
    if (!birthDate) {
      return setError(t('register.errBirthDateRequired'));
    }
    const age = calcAge(birthDate);
    if (age === null || age < 5) {
      return setError(t('register.errBirthDateInvalid'));
    }

    setError('');
    setSubmitting(true);
    beginRegistration();

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await sendEmailVerification(user);

      const todayIso = new Date().toISOString().split('T')[0];
      await setDoc(doc(db, 'users', user.uid), {
        name: name,
        email: email,
        age: age,
        birthDate: birthDate,
        joinedDate: todayIso,
        role: 'student',
        belt: 'yellow',
        isApproved: false,
        emailVerified: false,
        createdAt: new Date(),
      });

      setRegisteredEmail(email);
      setRegistrationSuccess(true);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setError(t('register.errEmailInUse'));
      } else if (err.code === 'auth/invalid-email') {
        setError(t('register.errInvalidEmail'));
      } else if (err.code === 'auth/weak-password') {
        setError(t('register.errWeakPassword'));
      } else {
        setError(t('register.errCreateGeneric'));
      }
    } finally {
      try { await signOut(auth); } catch (_) { /* ignore */ }
      endRegistration();
      setSubmitting(false);
    }
  }

  // Language switcher block — reused in both views
  const renderLangSwitcher = () => (
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
  );

  if (registrationSuccess) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.card}>
          {renderLangSwitcher()}

          <Link to="/" className={styles.logoLink}>
            <img src={dojoIcon} alt="Aiki Jutsu Logo" className={styles.logoImg} />
          </Link>

          <h2 className={styles.title}>
            <MailCheck size={26} strokeWidth={2} className={styles.titleIcon} />
            {t('register.successTitle')}
          </h2>
          <p className={styles.subtitle}>{t('register.successSubtitle')}</p>

          <div className={styles.successScreen}>
            <div className={styles.successIcon}>
              <MailCheck size={40} strokeWidth={1.8} />
            </div>

            <p className={styles.successMessage}>
              {t('register.successSentTo')}
            </p>
            <div className={styles.successEmail}>{registeredEmail}</div>

            <div className={styles.successHint}>
              <Trans
                i18nKey="register.successHint"
                components={{ strong: <strong /> }}
              />
            </div>

            <p className={styles.successMessage}>
              {t('register.successMustVerify')}
            </p>

            <Link to="/login" className={styles.button}>
              <Mail size={18} strokeWidth={2} />
              {t('register.goToLogin')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.authContainer}>
      <div className={styles.card}>
        {renderLangSwitcher()}

        <Link to="/" className={styles.logoLink}>
          <img src={dojoIcon} alt="Aiki Jutsu Logo" className={styles.logoImg} />
        </Link>

        <h2 className={styles.title}>
          <UserPlus size={26} strokeWidth={2} className={styles.titleIcon} />
          {t('register.title')}
        </h2>
        <p className={styles.subtitle}>{t('register.subtitle')}</p>

        {error && <p className={styles.error}>{error}</p>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label>{t('register.fullName')}</label>
            <div className={styles.inputWrap}>
              <User size={16} strokeWidth={2} className={styles.inputIcon} />
              <input
                type="text"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('register.fullNamePlaceholder')}
                required
                disabled={submitting}
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>{t('register.emailLabel')}</label>
            <div className={styles.inputWrap}>
              <Mail size={16} strokeWidth={2} className={styles.inputIcon} />
              <input
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('register.emailPlaceholder')}
                required
                disabled={submitting}
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>{t('register.passwordLabel')}</label>
            <div className={styles.inputWrap}>
              <Lock size={16} strokeWidth={2} className={styles.inputIcon} />
              <input
                type={showPassword ? 'text' : 'password'}
                className={`${styles.input} ${styles.inputWithToggle}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('register.passwordPlaceholder')}
                required
                disabled={submitting}
              />
              <button
                type="button"
                className={styles.pwToggle}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('register.hidePassword') : t('register.showPassword')}
                title={showPassword ? t('register.hidePassword') : t('register.showPassword')}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
              </button>
            </div>
            <small className={styles.helperText}>
              {t('register.passwordHelper')}
            </small>
          </div>

          <div className={styles.inputGroup}>
            <label>{t('register.confirmPasswordLabel')}</label>
            <div className={styles.inputWrap}>
              <ShieldCheck size={16} strokeWidth={2} className={styles.inputIcon} />
              <input
                type={showConfirm ? 'text' : 'password'}
                className={`${styles.input} ${styles.inputWithToggle}`}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('register.confirmPasswordPlaceholder')}
                required
                disabled={submitting}
              />
              <button
                type="button"
                className={styles.pwToggle}
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? t('register.hidePassword') : t('register.showPassword')}
                title={showConfirm ? t('register.hidePassword') : t('register.showPassword')}
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
              </button>
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>{t('register.birthDate')}</label>
            <div className={styles.inputWrap}>
              <Calendar size={16} strokeWidth={2} className={styles.inputIcon} />
              <input
                type="date"
                className={styles.input}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                required
                disabled={submitting}
              />
            </div>
            {computedAge !== null && (
              <small className={styles.helperText}>
                {t('register.ageHelper', { age: computedAge })}
              </small>
            )}
          </div>

          <button type="submit" className={styles.button} disabled={submitting}>
            <UserPlus size={18} strokeWidth={2} />
            {submitting ? t('register.creating') : t('register.signUp')}
          </button>
        </form>

        <p className={styles.footerText}>
          {t('register.haveAccount')} <Link to="/login">{t('register.loginLink')}</Link>
        </p>
      </div>
    </div>
  );
}