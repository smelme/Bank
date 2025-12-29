// Shared header interactions (theme, language, mobile menu, plus landing-only niceties)
// Safe to include on any public page; it no-ops when elements aren't present.

// Import i18n for proper language switching coordination
import { setLanguage as i18nSetLanguage, getLanguage, applyTranslations } from './i18n.js';

// Cleanup functions array for SPA lifecycle
let cleanupFunctions = [];

// Language Switching Functionality
function applyLandingLang(lang) {
  const languageContents = document.querySelectorAll('.language-content');
  
  // Show/hide language content blocks (only on landing page)
  languageContents.forEach((content) => {
    content.classList.toggle('active', content.classList.contains(lang));
  });

  // Update navigation and button text with data attributes (works on all pages)
  document.querySelectorAll('[data-en]').forEach((element) => {
    const text = lang === 'en' ? element.getAttribute('data-en') : element.getAttribute('data-am');
    if (text && (element.tagName === 'BUTTON' || element.tagName === 'SPAN' || element.tagName === 'A' || element.tagName === 'DIV')) {
      element.textContent = text;
    }
  });
}

async function applyLang(lang) {
  // Update body lang attribute for CSS
  document.body.setAttribute('lang', lang);
  // Update document language attribute
  document.documentElement.lang = lang;
  // Save preference to localStorage
  localStorage.setItem('tamange.lang', lang);
  
  // Apply landing page specific language (bilingual blocks)
  applyLandingLang(lang);
  
  // Apply i18n system translations (data-i18n attributes)
  await i18nSetLanguage(lang);
}

// Export function for SPA to call when navigating between routes
export async function reapplyLanguage() {
  const lang = getLanguage();
  // Update body and document lang attributes
  document.body.setAttribute('lang', lang);
  document.documentElement.lang = lang;
  // Re-apply to all elements with data-en/data-am in header
  applyLandingLang(lang);
}

async function toggleLanguage() {
  const currentLang = getLanguage();
  const newLang = currentLang === 'en' ? 'am' : 'en';
  await applyLang(newLang);
}

function initLanguageToggle() {
  const languageToggle = document.getElementById('languageToggle');
  const languageToggleDrawer = document.getElementById('languageToggleDrawer');
  const langLabels = document.querySelectorAll('.lang-label');
  const toggles = [languageToggle, languageToggleDrawer].filter(Boolean);

  toggles.forEach((toggleEl) => {
    const clickHandler = async () => {
      await toggleLanguage();
    };
    const keydownHandler = async (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        await toggleLanguage();
      }
    };

    toggleEl.addEventListener('click', clickHandler);
    toggleEl.addEventListener('keydown', keydownHandler);

    cleanupFunctions.push(() => {
      toggleEl.removeEventListener('click', clickHandler);
      toggleEl.removeEventListener('keydown', keydownHandler);
    });
  });

  // Allow clicking on labels to toggle
  langLabels.forEach((label) => {
    const clickHandler = async () => {
      await toggleLanguage();
    };
    label.addEventListener('click', clickHandler);
    cleanupFunctions.push(() => {
      label.removeEventListener('click', clickHandler);
    });
  });
}

// Theme Toggle Functionality
function initThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  const themeToggleDrawer = document.getElementById('themeToggleDrawer');
  const body = document.body;

  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const savedTheme = localStorage.getItem('theme');

  if (savedTheme === 'light' || (!savedTheme && !prefersDarkScheme.matches)) {
    body.classList.add('light-theme');
  }

  const setTheme = (isLight) => {
    body.classList.toggle('light-theme', isLight);
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  };

  const handleToggle = () => {
    const nextIsLight = !body.classList.contains('light-theme');
    setTheme(nextIsLight);
  };

  [themeToggle, themeToggleDrawer].filter(Boolean).forEach((toggleEl) => {
    const clickHandler = () => handleToggle();
    const keydownHandler = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleToggle();
      }
    };

    toggleEl.addEventListener('click', clickHandler);
    toggleEl.addEventListener('keydown', keydownHandler);

    cleanupFunctions.push(() => {
      toggleEl.removeEventListener('click', clickHandler);
      toggleEl.removeEventListener('keydown', keydownHandler);
    });
  });
}

// Mobile Menu Toggle -> Drawer
function initMobileMenu() {
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const mobileDrawerOverlay = document.getElementById('mobileDrawerOverlay');
  const mobileDrawerClose = document.getElementById('mobileDrawerClose');
  const drawer = document.getElementById('mobileDrawer');
  const drawerLinks = drawer ? drawer.querySelectorAll('a') : [];

  if (!mobileMenuToggle || !mobileDrawerOverlay || !drawer) return;

  const icon = mobileMenuToggle.querySelector('i');

  const setIcon = (isOpen) => {
    if (!icon) return;
    icon.classList.toggle('fa-bars', !isOpen);
    icon.classList.toggle('fa-times', isOpen);
  };

  const openDrawer = () => {
    mobileDrawerOverlay.classList.add('open');
    document.body.classList.add('drawer-open');
    setIcon(true);
  };

  const closeDrawer = () => {
    mobileDrawerOverlay.classList.remove('open');
    document.body.classList.remove('drawer-open');
    setIcon(false);
  };

  const toggleHandler = () => {
    const isOpen = mobileDrawerOverlay.classList.contains('open');
    if (isOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  };

  const overlayClickHandler = (event) => {
    if (event.target === mobileDrawerOverlay) {
      closeDrawer();
    }
  };

  const escHandler = (event) => {
    if (event.key === 'Escape') {
      closeDrawer();
    }
  };

  const resizeHandler = () => {
    if (window.innerWidth > 992) {
      closeDrawer();
    }
  };

  const popstateHandler = () => closeDrawer();

  const closeDrawerLinksHandler = () => closeDrawer();

  mobileMenuToggle.addEventListener('click', toggleHandler);
  mobileDrawerOverlay.addEventListener('click', overlayClickHandler);
  if (mobileDrawerClose) {
    mobileDrawerClose.addEventListener('click', closeDrawer);
    cleanupFunctions.push(() => mobileDrawerClose.removeEventListener('click', closeDrawer));
  }
  window.addEventListener('keydown', escHandler);
  window.addEventListener('resize', resizeHandler);
  window.addEventListener('popstate', popstateHandler);
  drawerLinks.forEach((link) => link.addEventListener('click', closeDrawerLinksHandler));

  cleanupFunctions.push(() => {
    mobileMenuToggle.removeEventListener('click', toggleHandler);
    mobileDrawerOverlay.removeEventListener('click', overlayClickHandler);
    window.removeEventListener('keydown', escHandler);
    window.removeEventListener('resize', resizeHandler);
    window.removeEventListener('popstate', popstateHandler);
    drawerLinks.forEach((link) => link.removeEventListener('click', closeDrawerLinksHandler));
  });
}

// Wire CTAs to existing app routes
function wireCtas() {
  const ctaButtons = document.querySelectorAll('.cta-button, .cta-button-large');
  ctaButtons.forEach((btn) => {
    const clickHandler = (e) => {
      // Only intercept CTAs that would otherwise keep you on-page.
      // If it's a real link to another route, let it behave naturally.
      if (btn.tagName === 'A') {
        const href = btn.getAttribute('href') || '';
        if (href && href !== '#' && !href.startsWith('#')) return;
      }
      e.preventDefault();
      window.location.href = '/register';
    };

    btn.addEventListener('click', clickHandler);
    cleanupFunctions.push(() => {
      btn.removeEventListener('click', clickHandler);
    });
  });
}

// Check if user is signed in
function isSignedIn() {
  // Consider either legacy session token, OIDC tokens (from token-exchange), or passkeyAuth
  try {
    if (sessionStorage.getItem('sessionToken')) return true;
    if (sessionStorage.getItem('oidc_access_token') || localStorage.getItem('oidc_access_token')) return true;
  } catch (e) {
    // ignore
  }

  try {
    const raw = localStorage.getItem('passkeyAuth');
    if (!raw) return false;
    const info = JSON.parse(raw);
    return info && info.authenticated === true;
  } catch (e) {
    return false;
  }
}

// Update navigation based on auth state
function updateNavForAuthState() {
  const isAuthenticated = isSignedIn();
  
  // Hide/show auth-related menu items
  const signInLink = document.querySelector('nav a[href="/signin"]');
  const openAccountLink = document.querySelector('nav a[href="/register"]');
  
  if (signInLink) {
    signInLink.parentElement.style.display = isAuthenticated ? 'none' : '';
  }
  if (openAccountLink) {
    openAccountLink.parentElement.style.display = isAuthenticated ? 'none' : '';
  }
}

// Update logo click behavior based on auth state
function initLogoNavigation() {
  const logoContainer = document.querySelector('.logo-container');
  if (!logoContainer) return;

  const clickHandler = (e) => {
    e.preventDefault();
    const targetRoute = isSignedIn() ? '/home' : '/';
    window.history.pushState({}, '', targetRoute);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  logoContainer.addEventListener('click', clickHandler);
  logoContainer.style.cursor = 'pointer';

  cleanupFunctions.push(() => {
    logoContainer.removeEventListener('click', clickHandler);
  });
}

// Export function to update nav state (called after sign in/out)
export function refreshNavState() {
  updateNavForAuthState();
}

// Feature card animation
function initFeatureCardAnimation() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px',
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  document.querySelectorAll('.feature-card').forEach((card) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.5s, transform 0.5s';
    observer.observe(card);
  });

  cleanupFunctions.push(() => {
    observer.disconnect();
  });
}

// SPA mount function - called when landing page loads in SPA
export async function spaMount() {
  // Clear any previous cleanup functions
  cleanupFunctions.forEach(fn => fn());
  cleanupFunctions = [];

  // Initialize language with saved preference
  const savedLang = localStorage.getItem('tamange.lang') || getLanguage() || 'en';
  await applyLang(savedLang);

  // Initialize all interactive features
  initLanguageToggle();
  initThemeToggle();
  initMobileMenu();
  wireCtas();
  initFeatureCardAnimation();
  initLogoNavigation();
  updateNavForAuthState();

  // Return cleanup function for SPA teardown
  return () => {
    cleanupFunctions.forEach(fn => fn());
    cleanupFunctions = [];
  };
}

// For standalone page loads (non-SPA), always initialize
// When loaded via SPA router, spaMount() will be called explicitly by spa.js
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', spaMount);
} else {
  spaMount();
}
