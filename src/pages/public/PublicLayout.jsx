import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import {
  Download, Menu, X, Home, Info, DollarSign, Mail, Users, LogIn, LayoutDashboard, Check
} from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import dojoIcon from '../../assets/dojo-icon.png';
import styles from './Public.module.css';

export default function PublicLayout() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { canInstall, isInstalled, isIos, install } = useInstallPrompt();

  const navItems = [
    { path: '/', label: t('public.nav.home'), Icon: Home },
    { path: '/how-it-works', label: t('public.nav.how'), Icon: Info },
    { path: '/prices', label: t('public.nav.pricing'), Icon: DollarSign },
    { path: '/about', label: t('public.nav.about'), Icon: Users },
    { path: '/contact', label: t('public.nav.contact'), Icon: Mail },
  ];

  const toggleMenu = () => setMobileOpen(!mobileOpen);

  const handleInstall = () => {
    if (isInstalled) return;
    if (canInstall) {
      install();
    } else if (isIos) {
      alert(t('offline.installIosHint', { defaultValue: 'Tap Share → Add to Home Screen' }));
    } else {
      alert(t('offline.installUnavailable', { defaultValue: 'Installation is not available. This can happen if the app is already installed, or your browser has blocked the prompt. Please use your browser menu to install the app.' }));
    }
  };

  return (
    <div className={styles.publicApp}>
      <header className={styles.header}>
        <Link to="/" className={styles.logoArea} onClick={() => setMobileOpen(false)}>
          <img src={dojoIcon} alt="Dojo" className={styles.logoImg} />
          <span className={styles.logoText}>Aiki Jutsu</span>
        </Link>

        <nav className={`${styles.navLinks} ${mobileOpen ? styles.open : ''}`}>
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            const Icon = item.Icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
              >
                <Icon size={18} className={styles.navIcon} />
                <span className={styles.navText}>{item.label}</span>
              </Link>
            );
          })}

          <div className={styles.mobileAuthSection}>
            {currentUser ? (
              <Link to="/dashboard" className={styles.mobileBtn} onClick={() => setMobileOpen(false)}>
                <LayoutDashboard size={18} /> {t('public.nav.dashboard')}
              </Link>
            ) : (
              <Link to="/login" className={styles.mobileBtn} onClick={() => setMobileOpen(false)}>
                <LogIn size={18} /> {t('public.nav.login')}
              </Link>
            )}
            <button
              className={styles.mobileBtn}
              onClick={() => { handleInstall(); setMobileOpen(false); }}
              disabled={isInstalled}
              style={{ opacity: isInstalled ? 0.6 : 1 }}
            >
              {isInstalled ? <Check size={18} /> : <Download size={18} />}
              {isInstalled ? t('offline.installed', { defaultValue: 'Installed' }) : t('public.nav.download')}
            </button>
          </div>
        </nav>

        <div className={styles.headerActions}>
          <LanguageSwitcher />

          <div className={styles.actionBtnWrap}>
            {currentUser ? (
              <Link to="/dashboard" className={styles.btnLogin}>
                <LayoutDashboard size={16} />
                <span className={styles.btnText}>{t('public.nav.dashboard')}</span>
              </Link>
            ) : (
              <Link to="/login" className={styles.btnLogin}>
                <LogIn size={16} />
                <span className={styles.btnText}>{t('public.nav.login')}</span>
              </Link>
            )}
            <span className={styles.tooltip}>{currentUser ? 'Dashboard' : 'Login'}</span>
          </div>

          <div className={styles.actionBtnWrap}>
            <button
              className={styles.btnDownload}
              onClick={handleInstall}
              disabled={isInstalled}
              style={{
                cursor: isInstalled ? 'default' : 'pointer',
                opacity: isInstalled ? 0.7 : 1,
              }}
            >
              {isInstalled ? <Check size={16} /> : <Download size={16} />}
              <span className={styles.btnText}>
                {isInstalled
                  ? t('offline.installed', { defaultValue: 'Installed' })
                  : t('public.nav.download')}
              </span>
            </button>
            <span className={styles.tooltip}>
              {isInstalled ? 'Already installed' : 'Install App'}
            </span>
          </div>
        </div>

        <button className={styles.mobileToggle} onClick={toggleMenu}>
          {mobileOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerGrid}>
          <div>
            <div className={styles.footerLogo}>合気術 Aiki Jutsu</div>
            <p className={styles.footerDesc}>{t('public.footer.desc')}</p>
          </div>
          <div>
            <h4 className={styles.footerHeading}>{t('public.footer.platform')}</h4>
            <div className={styles.footerLinks}>
              <Link to="/how-it-works" className={styles.footerLink}>{t('public.nav.how')}</Link>
              <Link to="/prices" className={styles.footerLink}>{t('public.nav.pricing')}</Link>
              <Link to="/register" className={styles.footerLink}>{t('public.footer.createAccount')}</Link>
            </div>
          </div>
          <div>
            <h4 className={styles.footerHeading}>{t('public.footer.company')}</h4>
            <div className={styles.footerLinks}>
              <Link to="/about" className={styles.footerLink}>{t('public.nav.about')}</Link>
              <Link to="/contact" className={styles.footerLink}>{t('public.nav.contact')}</Link>
            </div>
          </div>
          <div>
            <h4 className={styles.footerHeading}>{t('public.footer.support')}</h4>
            <div className={styles.footerLinks}>
              <a href="https://wa.me/212767331419" target="_blank" rel="noreferrer" className={styles.footerLink}>
                {t('public.footer.whatsAppUs')}
              </a>
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          &copy; 2026 Abdelilah Najib. {t('public.footer.rights')}
        </div>
      </footer>
    </div>
  );
}