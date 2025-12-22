// Language Switching Functionality
const langButtons = document.querySelectorAll('.lang-btn');
const languageContents = document.querySelectorAll('.language-content');

langButtons.forEach(button => {
    button.addEventListener('click', function() {
        const lang = this.getAttribute('data-lang');
        
        // Update active language button
        langButtons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
        
        // Show/hide language content
        languageContents.forEach(content => {
            content.classList.remove('active');
            if (content.classList.contains(lang)) {
                content.classList.add('active');
            }
        });
        
        // Update navigation and button text with data attributes
        document.querySelectorAll('[data-en]').forEach(element => {
            if (lang === 'en') {
                if (element.tagName === 'BUTTON' || element.tagName === 'SPAN' || element.tagName === 'A') {
                    element.textContent = element.getAttribute('data-en');
                }
            } else if (lang === 'am') {
                if (element.tagName === 'BUTTON' || element.tagName === 'SPAN' || element.tagName === 'A') {
                    element.textContent = element.getAttribute('data-am');
                }
            }
        });
        
        // Update document language attribute
        document.documentElement.lang = lang;
        
        // Update page title based on language
        if (lang === 'en') {
            document.title = 'Tamange Bank | Secure Digital Banking';
        } else {
            document.title = 'ታማኝ ባንክ | ደህንነቱ የተጠበቀ ዲጂታል ባንኪንግ';
        }
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

themeToggle.addEventListener('click', function() {
    body.classList.toggle('light-theme');
    
    // Save theme preference
    const isLightTheme = body.classList.contains('light-theme');
    localStorage.setItem('theme', isLightTheme ? 'light' : 'dark');
});

// Mobile Menu Toggle
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const mainNav = document.getElementById('mainNav');

mobileMenuToggle.addEventListener('click', function() {
    mainNav.classList.toggle('active');
    
    // Change icon
    const icon = mobileMenuToggle.querySelector('i');
    if (mainNav.classList.contains('active')) {
        icon.classList.remove('fa-bars');
        icon.classList.add('fa-times');
    } else {
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
    }
});

// Close mobile menu when clicking outside
document.addEventListener('click', function(event) {
    if (!mainNav.contains(event.target) && !mobileMenuToggle.contains(event.target) && window.innerWidth <= 992) {
        mainNav.classList.remove('active');
        const icon = mobileMenuToggle.querySelector('i');
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
    }
});

// Interactive buttons
document.querySelectorAll('.cta-button, .cta-button-large').forEach(button => {
    button.addEventListener('click', function() {
        const currentLang = document.querySelector('.lang-btn.active').getAttribute('data-lang');
        
        if (currentLang === 'en') {
            alert('Thank you for your interest in Tamange Bank! The account opening process would begin here.');
        } else {
            alert('ታማኝ ባንክን ስለተጠቀሱ እናመሰግናለን! የአካውንት መክፈቻ ሂደቱ እዚህ ይጀመራል።');
        }
    });
});

// Add a simple animation to feature cards when they come into view
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe feature cards
document.querySelectorAll('.feature-card').forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.5s, transform 0.5s';
    observer.observe(card);
});

// Window resize handler to handle menu on resize
window.addEventListener('resize', function() {
    if (window.innerWidth > 992) {
        mainNav.classList.remove('active');
        const icon = mobileMenuToggle.querySelector('i');
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
    }
});

// Initialize page with proper language
document.addEventListener('DOMContentLoaded', function() {
    // Set initial language based on browser preference or saved setting
    const savedLang = localStorage.getItem('preferredLanguage') || 'en';
    const initialLangBtn = document.querySelector(`.lang-btn[data-lang="${savedLang}"]`);
    
    if (initialLangBtn) {
        initialLangBtn.click();
    }
    
    // Save language preference when changed
    langButtons.forEach(button => {
        button.addEventListener('click', function() {
            localStorage.setItem('preferredLanguage', this.getAttribute('data-lang'));
        });
    });
});