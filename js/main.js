/**
 * PolicyPal - Main JavaScript
 * Handles all interactive functionality including:
 * - Header scroll effects
 * - Mobile navigation
 * - Contact modal
 * - Testimonial slider
 * - Animated counters
 * - FAQ accordion
 * - Smooth scrolling
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all components
    initHeader();
    initMobileNav();
    initModal();
    initSlider();
    initCounters();
    initFAQ();
    initSmoothScroll();
    initPDFUpload();
});

/**
 * Header - Scroll effect and active navigation
 */
function initHeader() {
    const header = document.getElementById('header');
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('section[id]');

    // Add scrolled class on scroll
    function handleScroll() {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }

        // Update active nav link based on scroll position
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 150;
            const sectionHeight = section.offsetHeight;
            if (window.scrollY >= sectionTop && window.scrollY < sectionTop + sectionHeight) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    }

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check
}

/**
 * Mobile Navigation
 */
function initMobileNav() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileNav = document.getElementById('mobileNav');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

    if (!mobileMenuBtn || !mobileNav) return;

    mobileMenuBtn.addEventListener('click', function() {
        this.classList.toggle('active');
        mobileNav.classList.toggle('active');
        document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
    });

    // Close mobile nav when clicking a link
    mobileNavLinks.forEach(link => {
        link.addEventListener('click', function() {
            mobileMenuBtn.classList.remove('active');
            mobileNav.classList.remove('active');
            document.body.style.overflow = '';
        });
    });

    // Close mobile nav on resize
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            mobileMenuBtn.classList.remove('active');
            mobileNav.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
}

/**
 * Contact Modal
 */
function initModal() {
    const modal = document.getElementById('contactModal');
    const modalClose = document.getElementById('modalClose');
    const getQuoteBtn = document.getElementById('getQuoteBtn');
    const mobileGetQuoteBtn = document.getElementById('mobileGetQuoteBtn');
    const ctaContactBtn = document.getElementById('ctaContactBtn');
    const contactForm = document.getElementById('contactForm');

    if (!modal) return;

    function openModal() {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Open modal buttons
    if (getQuoteBtn) getQuoteBtn.addEventListener('click', openModal);
    if (mobileGetQuoteBtn) mobileGetQuoteBtn.addEventListener('click', openModal);
    if (ctaContactBtn) ctaContactBtn.addEventListener('click', openModal);

    // Close modal
    if (modalClose) modalClose.addEventListener('click', closeModal);

    // Close on overlay click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });

    // Form submission
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();

            const formData = new FormData(contactForm);
            const data = {
                name: formData.get('name'),
                email: formData.get('email'),
                message: formData.get('message')
            };

            // Here you would typically send to your backend
            console.log('Form submitted:', data);

            // Show success message
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Message Sent!';
            submitBtn.disabled = true;

            setTimeout(() => {
                closeModal();
                contactForm.reset();
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }, 2000);
        });
    }
}

/**
 * Testimonial Slider
 */
function initSlider() {
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');
    const prevBtn = document.getElementById('sliderPrev');
    const nextBtn = document.getElementById('sliderNext');

    if (slides.length === 0) return;

    let currentSlide = 0;
    let autoSlideInterval;

    function showSlide(index) {
        // Wrap around
        if (index >= slides.length) index = 0;
        if (index < 0) index = slides.length - 1;

        // Update slides
        slides.forEach((slide, i) => {
            slide.classList.remove('active');
            if (i === index) {
                slide.classList.add('active');
            }
        });

        // Update dots
        dots.forEach((dot, i) => {
            dot.classList.remove('active');
            if (i === index) {
                dot.classList.add('active');
            }
        });

        currentSlide = index;
    }

    function nextSlide() {
        showSlide(currentSlide + 1);
    }

    function prevSlide() {
        showSlide(currentSlide - 1);
    }

    function startAutoSlide() {
        autoSlideInterval = setInterval(nextSlide, 5000);
    }

    function stopAutoSlide() {
        clearInterval(autoSlideInterval);
    }

    // Button controls
    if (prevBtn) {
        prevBtn.addEventListener('click', function() {
            prevSlide();
            stopAutoSlide();
            startAutoSlide();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', function() {
            nextSlide();
            stopAutoSlide();
            startAutoSlide();
        });
    }

    // Dot controls
    dots.forEach((dot, index) => {
        dot.addEventListener('click', function() {
            showSlide(index);
            stopAutoSlide();
            startAutoSlide();
        });
    });

    // Start auto-sliding
    startAutoSlide();

    // Pause on hover
    const slider = document.getElementById('testimonialSlider');
    if (slider) {
        slider.addEventListener('mouseenter', stopAutoSlide);
        slider.addEventListener('mouseleave', startAutoSlide);
    }
}

/**
 * Animated Counters
 */
function initCounters() {
    const counters = document.querySelectorAll('.counter');

    if (counters.length === 0) return;

    const observerOptions = {
        threshold: 0.5,
        rootMargin: '0px'
    };

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                counterObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    counters.forEach(counter => {
        counterObserver.observe(counter);
    });

    function animateCounter(counter) {
        const target = parseFloat(counter.getAttribute('data-target'));
        const duration = 2000; // 2 seconds
        const start = 0;
        const startTime = performance.now();

        function updateCounter(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function (ease-out-quad)
            const easeProgress = 1 - Math.pow(1 - progress, 3);

            const current = start + (target - start) * easeProgress;

            // Format based on target value
            if (target >= 1) {
                counter.textContent = current.toFixed(1);
            } else {
                counter.textContent = current.toFixed(2);
            }

            if (progress < 1) {
                requestAnimationFrame(updateCounter);
            } else {
                // Final value
                if (Number.isInteger(target)) {
                    counter.textContent = target;
                } else {
                    counter.textContent = target.toFixed(1);
                }
            }
        }

        requestAnimationFrame(updateCounter);
    }
}

/**
 * FAQ Accordion
 */
function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');

        question.addEventListener('click', function() {
            const isActive = item.classList.contains('active');

            // Close all other items (optional - remove for multi-open)
            faqItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                }
            });

            // Toggle current item
            item.classList.toggle('active');
        });
    });
}

/**
 * Smooth Scrolling for anchor links
 */
function initSmoothScroll() {
    const links = document.querySelectorAll('a[href^="#"]');

    links.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');

            if (href === '#') return;

            const target = document.querySelector(href);

            if (target) {
                e.preventDefault();

                const headerHeight = document.getElementById('header').offsetHeight;
                const targetPosition = target.offsetTop - headerHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * PDF Upload Handler
 */
function initPDFUpload() {
    const pdfUpload = document.getElementById('pdfUpload');

    if (!pdfUpload) return;

    pdfUpload.addEventListener('change', function(e) {
        const file = e.target.files[0];

        if (!file) return;

        if (file.type !== 'application/pdf') {
            alert('Please upload a PDF file.');
            return;
        }

        // For demo purposes, show an alert
        // In production, this would upload to your backend
        console.log('PDF selected:', file.name);

        // You could redirect to your app or show a modal
        const shouldRedirect = confirm(
            `File "${file.name}" selected!\n\n` +
            'Would you like to analyze this policy now?\n\n' +
            'Click OK to open the PolicyPal app.'
        );

        if (shouldRedirect) {
            // In production, you might upload the file first
            // then redirect with a token or file ID
            window.open('https://policypal-app.vercel.app', '_blank');
        }

        // Reset the input
        pdfUpload.value = '';
    });
}

/**
 * Utility: Debounce function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Utility: Throttle function
 */
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Add reveal animations on scroll
 */
function initScrollReveal() {
    const revealElements = document.querySelectorAll(
        '.feature-card, .solution-card, .stat-card, .faq-item'
    );

    const revealOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                revealObserver.unobserve(entry.target);
            }
        });
    }, revealOptions);

    revealElements.forEach(element => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(30px)';
        element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        revealObserver.observe(element);
    });
}

// Initialize scroll reveal after a short delay
setTimeout(initScrollReveal, 100);
