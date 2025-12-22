// Shared header interactions (theme, language, mobile menu, plus landing-only niceties)
// Safe to include on any public page; it no-ops when elements aren't present.

// Language Switching Functionality
const langButtons = document.querySelectorAll('.lang-btn');
const languageContents = document.querySelectorAll('.language-content');

function applyLang(lang) {
  if (!langButtons.length && !languageContents.length) {
    // Page doesn't use the landing bilingual blocks. Still persist preference.
    localStorage.setItem('preferredLanguage', lang);
    document.documentElement.lang = lang;
    return;
  }
  // Update active language button
  langButtons.forEach((btn) => btn.classList.toggle('active', btn.getAttribute('data-lang') === lang));

  // Show/hide language content
  languageContents.forEach((content) => {
    content.classList.toggle('active', content.classList.contains(lang));
  });

  // Update navigation and button text with data attributes
  document.querySelectorAll('[data-en]').forEach((element) => {
    const text = lang === 'en' ? element.getAttribute('data-en') : element.getAttribute('data-am');
    if (text && (element.tagName === 'BUTTON' || element.tagName === 'SPAN' || element.tagName === 'A')) {
      element.textContent = text;
    }
  });

  // Update document language attribute
  document.documentElement.lang = lang;

  // Save preference
  localStorage.setItem('preferredLanguage', lang);
}

langButtons.forEach((button) => {
  button.addEventListener('click', function () {
    const lang = this.getAttribute('data-lang');
    applyLang(lang);
  });
});

// Theme Toggle Functionality
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

themeToggle?.addEventListener('click', toggleTheme);
themeToggle?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    toggleTheme();
  }
});

// Mobile Menu Toggle
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const mainNav = document.getElementById('mainNav');

mobileMenuToggle?.addEventListener('click', function () {
  mainNav?.classList.toggle('active');

  // Change icon
  const icon = mobileMenuToggle.querySelector('i');
  if (!icon) return;

  if (mainNav?.classList.contains('active')) {
    icon.classList.remove('fa-bars');
    icon.classList.add('fa-times');
  } else {
    icon.classList.remove('fa-times');
    icon.classList.add('fa-bars');
  }
});

// Close mobile menu when clicking outside
document.addEventListener('click', function (event) {
  if (!mainNav || !mobileMenuToggle) return;
  if (!mainNav.contains(event.target) && !mobileMenuToggle.contains(event.target) && window.innerWidth <= 992) {
    mainNav.classList.remove('active');
    const icon = mobileMenuToggle.querySelector('i');
    if (icon) {
      icon.classList.remove('fa-times');
      icon.classList.add('fa-bars');
    }
  }
});

// Wire CTAs to existing app routes
function wireCtas() {
  const ctaButtons = document.querySelectorAll('.cta-button, .cta-button-large');
  ctaButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      // Only intercept CTAs that would otherwise keep you on-page.
      // If it's a real link to another route, let it behave naturally.
      if (btn.tagName === 'A') {
        const href = btn.getAttribute('href') || '';
        if (href && href !== '#' && !href.startsWith('#')) return;
      }
      e.preventDefault();
      window.location.href = '/register.html';
    });
  });
}

// Feature card animation
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

// Window resize handler to handle menu on resize
window.addEventListener('resize', function () {
  if (!mainNav || !mobileMenuToggle) return;
  if (window.innerWidth > 992) {
    mainNav.classList.remove('active');
    const icon = mobileMenuToggle.querySelector('i');
    if (icon) {
      icon.classList.remove('fa-times');
      icon.classList.add('fa-bars');
    }
  }
});

// Initialize page with proper language
document.addEventListener('DOMContentLoaded', function () {
  const savedLang = localStorage.getItem('preferredLanguage') || 'en';
  applyLang(savedLang);
  wireCtas();
});
