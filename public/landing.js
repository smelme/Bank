// Shared header interactions (theme, language, mobile menu, plus landing-only niceties)
// Safe to include on any public page; it no-ops when elements aren't present.

// Import i18n for proper language switching coordination
import { setLanguage as i18nSetLanguage, getLanguage, applyTranslations } from './i18n.js';

// Cleanup functions array for SPA lifecycle
let cleanupFunctions = [];

// Language Switching Functionality
function applyLandingLang(lang) {
  const languageContents = document.querySelectorAll('.language-content');
  
  if (!languageContents.length) {
    // Page doesn't use the landing bilingual blocks
    return;
  }

  // Show/hide language content
  languageContents.forEach((content) => {
    content.classList.toggle('active', content.classList.contains(lang));
  });

  // Update navigation and button text with data attributes
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
  const langLabels = document.querySelectorAll('.lang-label');

  console.log('[DEBUG] initLanguageToggle called, toggle:', languageToggle, 'labels:', langLabels.length);

  if (languageToggle) {
    const clickHandler = async () => {
      console.log('[DEBUG] Language toggle clicked!');
      await toggleLanguage();
    };
    const keydownHandler = async (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        await toggleLanguage();
      }
    };

    languageToggle.addEventListener('click', clickHandler);
    languageToggle.addEventListener('keydown', keydownHandler);

    cleanupFunctions.push(() => {
      languageToggle.removeEventListener('click', clickHandler);
      languageToggle.removeEventListener('keydown', keydownHandler);
    });
  }

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
  const body = document.body;

  // Check for saved theme or prefer-color-scheme
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const savedTheme = localStorage.getItem('theme');

  if (savedTheme === 'light' || (!savedTheme && !prefersDarkScheme.matches)) {
    body.classList.add('light-theme');
  }

  function toggleTheme() {
    body.classList.toggle('light-theme');
    const isLightTheme = body.classList.contains('light-theme');
    localStorage.setItem('theme', isLightTheme ? 'light' : 'dark');
  }

  if (themeToggle) {
    const clickHandler = () => toggleTheme();
    const keydownHandler = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleTheme();
      }
    };

    themeToggle.addEventListener('click', clickHandler);
    themeToggle.addEventListener('keydown', keydownHandler);

    cleanupFunctions.push(() => {
      themeToggle.removeEventListener('click', clickHandler);
      themeToggle.removeEventListener('keydown', keydownHandler);
    });
  }
}

// Mobile Menu Toggle
function initMobileMenu() {
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const mainNav = document.getElementById('mainNav');

  if (!mobileMenuToggle || !mainNav) return;

  const toggleHandler = function () {
    mainNav.classList.toggle('active');

    // Change icon
    const icon = mobileMenuToggle.querySelector('i');
    if (!icon) return;

    if (mainNav.classList.contains('active')) {
      icon.classList.remove('fa-bars');
      icon.classList.add('fa-times');
    } else {
      icon.classList.remove('fa-times');
      icon.classList.add('fa-bars');
    }
  };

  mobileMenuToggle.addEventListener('click', toggleHandler);

  // Close mobile menu when clicking outside
  const outsideClickHandler = function (event) {
    if (!mainNav.contains(event.target) && !mobileMenuToggle.contains(event.target) && window.innerWidth <= 992) {
      mainNav.classList.remove('active');
      const icon = mobileMenuToggle.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
      }
    }
  };

  document.addEventListener('click', outsideClickHandler);

  // Window resize handler
  const resizeHandler = function () {
    if (window.innerWidth > 992) {
      mainNav.classList.remove('active');
      const icon = mobileMenuToggle.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
      }
    }
  };

  window.addEventListener('resize', resizeHandler);

  cleanupFunctions.push(() => {
    mobileMenuToggle.removeEventListener('click', toggleHandler);
    document.removeEventListener('click', outsideClickHandler);
    window.removeEventListener('resize', resizeHandler);
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
