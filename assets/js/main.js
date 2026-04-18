// The Fluid Archive - Main Controller

class AppController {
    constructor() {
        this.initSmoothScroll();
        this.initCursor();
        this.initThree();
        this.initReveal();

        this.scrollVelocity = 0;
        this.time = 0;

        // Start render loop
        requestAnimationFrame(this.render.bind(this));
    }

    initSmoothScroll() {
        this.lenis = new Lenis({
            duration: 1.5,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            direction: 'vertical',
            gestureDirection: 'vertical',
            smooth: true,
            mouseMultiplier: 1,
            smoothTouch: false,
            touchMultiplier: 2,
            infinite: false,
        });

        const heroOverlay = document.querySelector('.hero-overlay');
        const endOverlay = document.querySelector('.end-overlay');
        const hudFooter = document.querySelector('.hud-footer');

        this.lenis.on('scroll', (e) => {
            this.scrollVelocity = e.velocity;
            if (window.engine) {
                window.engine.onScroll(e.scroll, e.limit || 1); 
            }
            
            if (e.limit) {
                // Top of page mapping (effects heroOverlay)
                if (heroOverlay) {
                    let topOpacity = 1;
                    if (e.scroll > 0) {
                        topOpacity = 1 - (e.scroll / 500);
                    }
                    topOpacity = Math.max(0, Math.min(1, topOpacity));
                    heroOverlay.style.opacity = topOpacity;
                    heroOverlay.style.pointerEvents = topOpacity > 0.5 ? 'auto' : 'none';
                    
                    if (hudFooter) {
                        hudFooter.style.opacity = topOpacity; // fade out footer at same time
                    }
                }
                
                // Bottom of page mapping (effects endOverlay)
                if (endOverlay) {
                    let bottomOpacity = 0;
                    if (e.scroll > e.limit - 800) {
                        bottomOpacity = 1 - ((e.limit - e.scroll) / 800);
                    }
                    bottomOpacity = Math.max(0, Math.min(1, bottomOpacity));
                    endOverlay.style.opacity = bottomOpacity;
                    endOverlay.style.pointerEvents = bottomOpacity > 0.5 ? 'auto' : 'none';
                }
            }
        });
        
        // This variable will be set by three-scene based on layout height
        window.maxScrollLength = 10000;
        document.getElementById('scroll-proxy').style.height = window.maxScrollLength + 'px';
    }

    initCursor() {
        this.cursorDot = document.querySelector('.cursor-dot');
        this.cursorRing = document.querySelector('.cursor-ring');

        this.mouseX = window.innerWidth / 2;
        this.mouseY = window.innerHeight / 2;
        this.cursorX = this.mouseX;
        this.cursorY = this.mouseY;

        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;

            // Optional: detect hover on specific elements to expand cursor
            // Usually done via passing it down to engine, but we can do it globally here
            // if we intersect images in 3D later, we can toggle `document.body.classList.add('hovering')`
        });
    }

    initThree() {
        try {
            window.engine = new window.PortfolioScene();
        } catch (e) {
            console.error('Spatial Engine failed:', e);
        }
    }

    initReveal() {
        // High-end cinematic reveal
        gsap.fromTo('.hero-title', 
            { opacity: 0, y: 50, filter: "blur(10px)", scale: 0.95 },
            { opacity: 1, y: 0, filter: "blur(0px)", scale: 1, duration: 2.5, ease: 'power4.out', delay: 0.5 }
        );

        gsap.fromTo('.hero-subtitle', 
            { opacity: 0, letterSpacing: "1em" },
            { opacity: 0.6, letterSpacing: "0.4em", duration: 2, ease: 'power3.out', delay: 1.5 }
        );

        gsap.fromTo('.hud-header, .hud-footer', 
            { opacity: 0 },
            { opacity: 1, duration: 2, ease: 'power2.inOut', delay: 2 }
        );
    }

    render(time) {
        this.time = time;
        
        // Update Lenis
        this.lenis.raf(time);

        // Lerp Cursor
        this.cursorX += (this.mouseX - this.cursorX) * 0.2;
        this.cursorY += (this.mouseY - this.cursorY) * 0.2;

        if (this.cursorDot) {
            this.cursorDot.style.transform = `translate(${this.cursorX}px, ${this.cursorY}px) translate(-50%, -50%)`;
        }
        if (this.cursorRing) {
            // slightly slower trailing ring
            const ringX = parseFloat(this.cursorRing.dataset.x) || this.mouseX;
            const ringY = parseFloat(this.cursorRing.dataset.y) || this.mouseY;
            const newRingX = ringX + (this.mouseX - ringX) * 0.1;
            const newRingY = ringY + (this.mouseY - ringY) * 0.1;
            
            this.cursorRing.dataset.x = newRingX;
            this.cursorRing.dataset.y = newRingY;
            this.cursorRing.style.transform = `translate(${newRingX}px, ${newRingY}px) translate(-50%, -50%)`;
        }

        // Update ThreeJS Engine
        if (window.engine) {
            // Provide velocity to engine for distortion effects
            window.engine.update(this.scrollVelocity, this.time, this.mouseX, this.mouseY);
            
            // Damping the velocity so we don't get stuck distorted if scroll stops abruptly
            this.scrollVelocity *= 0.9;
        }

        requestAnimationFrame(this.render.bind(this));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new AppController();
});
