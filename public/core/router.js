// Simple SPA router for Tamange Bank
// - Uses History API paths like /signin, /register, /home
// - Loads HTML partials into #app
// - Dynamically imports the controller module per route
// - Provides best-effort teardown on route changes

const outlet = document.getElementById('app');

// Track controller cleanup between navigations
let currentTeardown = null;
let currentController = null;

const routes = {
  '/': { view: '/views/landing.partial.html', title: 'Tamange Bank', controller: null },
  '/digitalid-signin': { view: '/views/signin.partial.html', title: 'Tamange Bank - Digital ID Sign In', controller: '/pages/signin.js' },
  '/register': { view: '/views/register.partial.html', title: 'Tamange Bank - Register', controller: '/pages/register.js' },
  '/home': { view: '/views/home.partial.html', title: 'Tamange Bank - Home', controller: '/pages/home.js' },
  '/callback': { view: null, title: 'Tamange Bank - Signing In...', controller: '/pages/callback.js' },
};

function normalizePath(pathname) {
  // Strip trailing slashes except root
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

function matchRoute(pathname) {
  const path = normalizePath(pathname);
  if (routes[path]) return { path, ...routes[path] };
  // Support legacy *.html paths and map them to routes.
  if (path === '/index.html') return { path: '/', ...routes['/'] };
  if (path === '/signin.html' || path === '/signin') return { path: '/digitalid-signin', ...routes['/digitalid-signin'] };
  if (path === '/register.html') return { path: '/register', ...routes['/register'] };
  if (path === '/home.html') return { path: '/home', ...routes['/home'] };
  return null;
}

function setActiveNav(path) {
  // Highlight active nav item if present
  document.querySelectorAll('nav a[aria-current="page"]').forEach((a) => a.removeAttribute('aria-current'));
  const link = document.querySelector(`nav a[href="${path}"]`);
  if (link) link.setAttribute('aria-current', 'page');
}

async function fetchView(url) {
  const res = await fetch(url, { headers: { 'X-Requested-With': 'spa' } });
  if (!res.ok) throw new Error(`Failed to load view: ${url}`);
  return res.text();
}

async function teardownCurrent() {
  if (typeof currentTeardown === 'function') {
    try {
      await currentTeardown();
    } catch (e) {
      console.warn('SPA teardown error:', e);
    }
  }
  currentTeardown = null;
  currentController = null;
}

async function loadController(modulePath) {
  if (!modulePath) return;

  // Importing the same module multiple times returns the same module instance.
  // Our existing controllers are page-oriented and attach DOM listeners on import.
  // To avoid duplicate listeners, we require a teardown hook.
  const mod = await import(modulePath);
  currentController = mod;

  // Optional lifecycle hook we can add over time.
  if (typeof mod?.spaMount === 'function') {
    const teardown = await mod.spaMount();
    if (typeof teardown === 'function') currentTeardown = teardown;
  }
}

async function applyI18nAndLandingLang() {
  // header.js listens for DOMContentLoaded only when loaded as script;
  // in SPA we need to re-apply language after swapping content.
  try {
    const i18n = await import('/core/i18n.js');
    i18n.applyTranslations(i18n.getLanguage());
  } catch {
    // ignore
  }

  // Re-apply language to header elements (logo, nav)
  try {
    const header = await import('/core/header.js');
    if (typeof header.reapplyLanguage === 'function') {
      await header.reapplyLanguage();
    }
    // Refresh nav state based on auth
    if (typeof header.refreshNavState === 'function') {
      header.refreshNavState();
    }
  } catch {
    // ignore
  }

  // header.js exposes no API; but it updates language on button click and on DOMContentLoaded.
  // Here we mimic its landing-page behavior for bilingual blocks by toggling based on storage.
  const lang = localStorage.getItem('tamange.lang') || localStorage.getItem('preferredLanguage') || 'en';
  document.querySelectorAll('.language-content').forEach((el) => {
    el.classList.toggle('active', el.classList.contains(lang));
  });
  document.querySelectorAll('[data-en]').forEach((el) => {
    const text = lang === 'en' ? el.getAttribute('data-en') : el.getAttribute('data-am');
    if (text && (el.tagName === 'BUTTON' || el.tagName === 'SPAN' || el.tagName === 'A' || el.tagName === 'DIV')) el.textContent = text;
  });
}

async function navigate(to, { replace = false } = {}) {
  const url = new URL(to, window.location.origin);
  const route = matchRoute(url.pathname);

  if (!route) {
    // Fallback to landing
    return navigate('/', { replace: true });
  }

  if (replace) window.history.replaceState({}, '', route.path);
  else window.history.pushState({}, '', route.path);

  await render(route.path);
}

async function render(pathname = window.location.pathname) {
  const route = matchRoute(pathname);
  if (!route) return;

  // Redirect signed-in users from landing page to home
  // Check for OIDC token instead of old sessionToken
  const hasOidcToken = sessionStorage.getItem('oidc_access_token');
  if (route.path === '/' && hasOidcToken) {
    return navigate('/home', { replace: true });
  }

  await teardownCurrent();

  document.title = route.title;
  setActiveNav(route.path);

  outlet.innerHTML = `<div class="container" style="padding: 24px 0;"><div class="loading">Loading...</div></div>`;

  try {
    // Special handling for callback route (no view to fetch)
    if (route.path === '/callback') {
      outlet.innerHTML = `<div class="container" style="padding: 24px 0;"><div class="loading">Completing sign in...</div></div>`;
    } else {
      const html = await fetchView(route.view);
      outlet.innerHTML = html;
    }
    const html = route.view ? await fetchView(route.view) : '';
    if (html) outlet.innerHTML = html;

    // Minor view-specific wiring
    if (route.path === '/home') {
      const btn = document.getElementById('goSignInBtn');
      if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); navigate('/signin'); });
    }
    if (route.path === '/signin') {
      const btn = document.getElementById('tryAgainBtn');
      if (btn) btn.addEventListener('click', () => window.location.reload());
    }

    await applyI18nAndLandingLang();

    // Load controller last so the DOM ids exist
    await loadController(route.controller);
  } catch (e) {
    console.error(e);
    outlet.innerHTML = `<div class="container" style="padding: 24px 0;"><div class="error-box">${String(e?.message || e)}</div></div>`;
  }
}

function isSameOriginLink(a) {
  try {
    const url = new URL(a.href, window.location.origin);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

function wireLinkInterception() {
  document.addEventListener('click', (e) => {
    const a = e.target?.closest?.('a');
    if (!a) return;

    // Opt out conditions
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    if (!isSameOriginLink(a)) return;

    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return;

    const url = new URL(a.href, window.location.origin);

    // Only intercept app routes
    const route = matchRoute(url.pathname);
    if (!route) return;

    e.preventDefault();
    navigate(route.path);
  });

  // Make the logo clickable without forcing anchor markup
  document.addEventListener('click', (e) => {
    const logo = e.target?.closest?.('[data-link="/"]');
    if (!logo) return;
    e.preventDefault();
    navigate('/');
  });
}

window.addEventListener('popstate', () => {
  render(window.location.pathname);
});

wireLinkInterception();
render(window.location.pathname);

// Expose navigate for other modules if needed
window.__spaNavigate = navigate;
