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
 * Uploads to backend and shows results
 * Works with both local dev (localhost:3000) and Vercel (/api)
 */
function initPDFUpload() {
    const pdfUpload = document.getElementById('pdfUpload');

    // Detect environment - use relative /api for Vercel, localhost for local dev
    const isVercel = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    const API_BASE = isVercel ? '' : 'http://localhost:3000';

    if (!pdfUpload) return;

    pdfUpload.addEventListener('change', async function(e) {
        const file = e.target.files[0];

        if (!file) return;

        if (file.type !== 'application/pdf') {
            alert('Please upload a PDF file.');
            return;
        }

        console.log('PDF selected:', file.name);

        // Show loading state
        const uploadBtn = document.querySelector('.hero-cta .btn-primary');
        const originalHTML = uploadBtn.innerHTML;
        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
        uploadBtn.style.pointerEvents = 'none';

        try {
            // Read PDF as text (for Vercel serverless)
            const pdfText = await extractPdfText(file);

            // Send to API
            const response = await fetch(`${API_BASE}/api/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdfText, filename: file.name }),
            });

            if (!response.ok) {
                throw new Error('Analysis failed');
            }

            const result = await response.json();
            console.log('Analysis result:', result);

            // Show results in modal
            showDashboardModal(result.dashboard);

        } catch (error) {
            console.error('Upload error:', error);

            // If API not available, show demo
            if (error.message.includes('fetch') || error.message.includes('Failed')) {
                const useDemo = confirm(
                    'API not available. Would you like to see a demo dashboard?\n\n' +
                    'For local development:\n' +
                    '1. cd backend-simple && npm install && npm start\n\n' +
                    'For Vercel: Deploy with ANTHROPIC_API_KEY env var'
                );

                if (useDemo) {
                    loadDemoDashboard();
                }
            } else {
                alert('Error analyzing policy: ' + error.message);
            }
        } finally {
            uploadBtn.innerHTML = originalHTML;
            uploadBtn.style.pointerEvents = 'auto';
            pdfUpload.value = '';
        }
    });
}

/**
 * Extract text from PDF file (client-side)
 * Uses pdf.js library loaded from CDN
 */
async function extractPdfText(file) {
    // Load pdf.js if not already loaded
    if (!window.pdfjsLib) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += `\n--- Page ${i} ---\n${pageText}`;
    }

    return fullText;
}

/**
 * Load external script dynamically
 */
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * Load demo dashboard from backend
 */
async function loadDemoDashboard() {
    const isVercel = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    const demoUrl = isVercel ? '/api/demo' : 'http://localhost:3000/demo/dashboard';

    try {
        const response = await fetch(demoUrl);
        const data = await response.json();
        showDashboardModal(data.dashboard);
    } catch (error) {
        // Use hardcoded demo if backend not available
        showDashboardModal(getMockDashboard());
    }
}

/**
 * Get mock dashboard data
 */
function getMockDashboard() {
    return {
        summary: {
            insurer: 'Allianz Ireland',
            productName: 'Home Insurance Plus',
            policyNumber: 'HI-2025-78432',
            period: { start: '2025-01-01', end: '2026-01-01' },
            address: '42 Oakwood Drive, Blackrock, Co. Dublin',
            keyPoints: [
                'Buildings covered to €450,000 (rebuild cost)',
                'Contents limit €75,000 with €3,000 single article limit',
                'Public liability cover of €2.6 million included',
                'Flood damage is excluded - consider requesting cover',
                '60-day unoccupancy restriction applies'
            ]
        },
        coverageBreakdown: [
            { name: 'Buildings', type: 'buildings', limit: '€450,000', excess: '€250', included: true },
            { name: 'Contents', type: 'contents', limit: '€75,000', excess: '€250', included: true },
            { name: 'Public Liability', type: 'liability', limit: '€2,600,000', included: true },
        ],
        exclusions: [
            { title: 'Flood Damage', severity: 'high', description: 'Loss or damage caused by flood is excluded' },
            { title: 'Gradual Deterioration', severity: 'low', description: 'Wear and tear, rot, rust excluded' },
            { title: 'Unoccupancy over 60 days', severity: 'medium', description: 'Cover limited if unoccupied 60+ days' },
        ],
        riskRadar: [
            { riskType: 'flood', level: 'Medium', explanation: 'Property near River Liffey Basin' },
            { riskType: 'crime', level: 'Medium', explanation: 'Dublin South - Burglary rate: 185/100k' },
        ],
        gaps: [
            { severity: 'high', title: 'Flood Risk Without Coverage', description: 'Property in Medium flood zone but flood excluded' }
        ],
        actions: [
            { priority: 1, text: 'Request a flood cover quote from your insurer' },
            { priority: 2, text: 'Verify security requirements are met' },
            { priority: 3, text: 'Notify insurer if property will be unoccupied for extended periods' }
        ],
        questions: [
            { text: 'Is flood cover available as an optional endorsement?' },
            { text: 'Can the unoccupancy period be extended if needed?' },
            { text: 'Do you have items worth more than €3,000 single article limit?' }
        ]
    };
}

/**
 * Show dashboard in modal
 */
function showDashboardModal(dashboard) {
    // Remove existing dashboard modal if any
    const existing = document.getElementById('dashboardModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'dashboardModal';
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:3000;overflow-y:auto;padding:20px;';

    modal.innerHTML = `
        <div style="background:#fff;max-width:900px;margin:20px auto;border-radius:16px;overflow:hidden;">
            <!-- Header -->
            <div style="background:linear-gradient(135deg,#2563eb,#06b6d4);color:#fff;padding:24px;position:relative;">
                <button onclick="document.getElementById('dashboardModal').remove()"
                    style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.2);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:20px;cursor:pointer;">×</button>
                <h2 style="margin:0 0 8px;font-size:24px;">Policy Analysis Dashboard</h2>
                <p style="margin:0;opacity:0.9;">${dashboard.summary?.insurer || 'Unknown Insurer'} - ${dashboard.summary?.productName || 'Policy'}</p>
            </div>

            <!-- Summary -->
            <div style="padding:24px;border-bottom:1px solid #e5e7eb;">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:16px;">
                    <div><strong>Policy #:</strong> ${dashboard.summary?.policyNumber || 'N/A'}</div>
                    <div><strong>Period:</strong> ${dashboard.summary?.period?.start || 'N/A'} to ${dashboard.summary?.period?.end || 'N/A'}</div>
                    <div style="grid-column:1/-1;"><strong>Address:</strong> ${dashboard.summary?.address || 'N/A'}</div>
                </div>
                <div style="background:#f8fafc;padding:16px;border-radius:8px;">
                    <strong>Key Points:</strong>
                    <ul style="margin:8px 0 0;padding-left:20px;">
                        ${(dashboard.summary?.keyPoints || []).map(p => `<li style="margin:4px 0;">${p}</li>`).join('')}
                    </ul>
                </div>
            </div>

            <!-- Gaps & Actions -->
            ${dashboard.gaps?.length > 0 ? `
            <div style="padding:24px;border-bottom:1px solid #e5e7eb;">
                <h3 style="color:#dc2626;margin:0 0 16px;display:flex;align-items:center;gap:8px;">
                    <span style="background:#fef2f2;padding:8px;border-radius:8px;">⚠️</span>
                    Coverage Gaps Identified
                </h3>
                ${dashboard.gaps.map(gap => `
                    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin-bottom:8px;border-radius:0 8px 8px 0;">
                        <strong>${gap.title}</strong>
                        <p style="margin:4px 0 0;color:#666;">${gap.description}</p>
                    </div>
                `).join('')}
            </div>
            ` : ''}

            <!-- Risk Radar -->
            <div style="padding:24px;border-bottom:1px solid #e5e7eb;">
                <h3 style="margin:0 0 16px;">🎯 Risk Radar</h3>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
                    ${(dashboard.riskRadar || []).map(risk => `
                        <div style="background:#f8fafc;padding:16px;border-radius:8px;border-left:4px solid ${
                            risk.level === 'High' ? '#dc2626' : risk.level === 'Medium' ? '#f59e0b' : '#10b981'
                        };">
                            <div style="font-weight:600;text-transform:capitalize;">${risk.riskType}</div>
                            <div style="color:${risk.level === 'High' ? '#dc2626' : risk.level === 'Medium' ? '#f59e0b' : '#10b981'};font-weight:bold;">${risk.level}</div>
                            <div style="color:#666;font-size:14px;margin-top:4px;">${risk.explanation}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Coverage -->
            <div style="padding:24px;border-bottom:1px solid #e5e7eb;">
                <h3 style="margin:0 0 16px;">📋 Coverage Breakdown</h3>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:#f8fafc;">
                            <th style="text-align:left;padding:12px;">Coverage</th>
                            <th style="text-align:right;padding:12px;">Limit</th>
                            <th style="text-align:right;padding:12px;">Excess</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(dashboard.coverageBreakdown || []).map(c => `
                            <tr style="border-bottom:1px solid #e5e7eb;">
                                <td style="padding:12px;">${c.name}</td>
                                <td style="text-align:right;padding:12px;font-weight:600;">${c.limit || 'N/A'}</td>
                                <td style="text-align:right;padding:12px;">${c.excess || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Exclusions -->
            <div style="padding:24px;border-bottom:1px solid #e5e7eb;">
                <h3 style="margin:0 0 16px;">🚫 Exclusions</h3>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    ${(dashboard.exclusions || []).map(e => `
                        <div style="display:flex;align-items:start;gap:12px;padding:12px;background:#f8fafc;border-radius:8px;">
                            <span style="background:${e.severity === 'high' ? '#fef2f2' : e.severity === 'medium' ? '#fffbeb' : '#f0fdf4'};
                                color:${e.severity === 'high' ? '#dc2626' : e.severity === 'medium' ? '#f59e0b' : '#10b981'};
                                padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600;text-transform:uppercase;">
                                ${e.severity}
                            </span>
                            <div>
                                <strong>${e.title}</strong>
                                <p style="margin:4px 0 0;color:#666;font-size:14px;">${e.description}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Actions -->
            <div style="padding:24px;border-bottom:1px solid #e5e7eb;">
                <h3 style="margin:0 0 16px;">✅ Recommended Actions</h3>
                <ol style="margin:0;padding-left:20px;">
                    ${(dashboard.actions || []).map(a => `
                        <li style="margin:8px 0;padding:8px;background:#f0fdf4;border-radius:4px;">${a.text}</li>
                    `).join('')}
                </ol>
            </div>

            <!-- Questions -->
            <div style="padding:24px;">
                <h3 style="margin:0 0 16px;">❓ Questions to Ask Your Broker</h3>
                <ul style="margin:0;padding-left:20px;">
                    ${(dashboard.questions || []).map(q => `
                        <li style="margin:8px 0;">${q.text}</li>
                    `).join('')}
                </ul>
            </div>

            <!-- Footer -->
            <div style="background:#f8fafc;padding:16px 24px;text-align:center;color:#666;font-size:14px;">
                Analysis powered by PolicyPal AI | For informational purposes only
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Close on Escape
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
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
