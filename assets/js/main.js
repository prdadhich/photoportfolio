// The Fluid Archive — Main Controller

class AppController {
    constructor() {
        // Detect touch early so engine can skip raycasting
        window._isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        this.initSmoothScroll();
        this.initCursor();
        this.initThree();
        this.initReveal();

        this.scrollVelocity = 0;
        this.time = 0;
        this._lastFrameTime = 0;
        this._hidden = false;

        // Pause render loop when tab is hidden
        document.addEventListener('visibilitychange', () => {
            this._hidden = document.hidden;
        });

        requestAnimationFrame(this.render.bind(this));
    }

    initSmoothScroll() {
        this.lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            direction: 'vertical',
            gestureDirection: 'vertical',
            smooth: true,
            mouseMultiplier: 1,
            smoothTouch: true,
            touchMultiplier: 3.5,
            infinite: false,
        });

        const heroOverlay  = document.querySelector('.hero-overlay');
        const endOverlay   = document.querySelector('.end-overlay');
        const scrollPrompt = document.querySelector('.scroll-prompt'); // only this fades with hero

        this.lenis.on('scroll', (e) => {
            this.scrollVelocity = e.velocity;
            if (window.engine) {
                window.engine.onScroll(e.scroll, e.limit || 1);
            }

            if (e.limit) {
                // Top of page — fade hero overlay and the DESCENT indicator together
                if (heroOverlay) {
                    const topOpacity = Math.max(0, Math.min(1, 1 - (e.scroll / 450)));
                    heroOverlay.style.opacity = topOpacity;
                    heroOverlay.style.pointerEvents = topOpacity > 0.5 ? 'auto' : 'none';
                    // Only fade the scroll-prompt (DESCENT arrow), NOT the whole footer
                    // so the frame counter / vol info remains visible throughout
                    if (scrollPrompt) scrollPrompt.style.opacity = topOpacity;
                }

                // Fade end overlay in when near bottom
                if (endOverlay) {
                    const bottomOpacity = Math.max(0, Math.min(1, 1 - ((e.limit - e.scroll) / 800)));
                    endOverlay.style.opacity = bottomOpacity;
                    endOverlay.style.pointerEvents = bottomOpacity > 0.5 ? 'auto' : 'none';
                }

                // Scroll progress bar
                const bar = document.getElementById('scroll-progress');
                if (bar) bar.style.transform = `scaleX(${e.scroll / e.limit})`;
            }
        });

        // Scroll proxy height will be set by PortfolioScene once layout is computed
        window.maxScrollLength = 10000;
        const proxy = document.getElementById('scroll-proxy');
        if (proxy) proxy.style.height = window.maxScrollLength + 'px';
    }

    initCursor() {
        this.cursorDot  = document.querySelector('.cursor-dot');
        this.cursorRing = document.querySelector('.cursor-ring');

        this.mouseX = window.innerWidth  / 2;
        this.mouseY = window.innerHeight / 2;
        this.cursorX = this.mouseX;
        this.cursorY = this.mouseY;

        // Always track mouse — CSS handles hiding on touch
        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
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
        gsap.fromTo('.hero-title',
            { opacity: 0, y: 50, filter: "blur(10px)", scale: 0.95 },
            { opacity: 1, y: 0, filter: "blur(0px)", scale: 1,
              duration: 2.5, ease: 'power4.out', delay: 0.5 }
        );
        gsap.fromTo('.hero-subtitle',
            { opacity: 0, letterSpacing: "1em" },
            { opacity: 0.6, letterSpacing: "0.4em",
              duration: 2, ease: 'power3.out', delay: 1.5 }
        );
        gsap.fromTo('.hud-header, .hud-footer',
            { opacity: 0 },
            { opacity: 1, duration: 2, ease: 'power2.inOut', delay: 2 }
        );
    }

    render(time) {
        // Skip frame entirely when tab is hidden
        if (this._hidden) {
            requestAnimationFrame(this.render.bind(this));
            return;
        }

        this.time = time;
        this.lenis.raf(time);

        // Always lerp cursor — CSS hides elements on touch so no visual cost
        this.cursorX += (this.mouseX - this.cursorX) * 0.2;
        this.cursorY += (this.mouseY - this.cursorY) * 0.2;

        if (this.cursorDot) {
            this.cursorDot.style.transform =
                `translate(${this.cursorX}px, ${this.cursorY}px) translate(-50%, -50%)`;
        }
        if (this.cursorRing) {
            const ringX = parseFloat(this.cursorRing.dataset.x) || this.mouseX;
            const ringY = parseFloat(this.cursorRing.dataset.y) || this.mouseY;
            const newRingX = ringX + (this.mouseX - ringX) * 0.1;
            const newRingY = ringY + (this.mouseY - ringY) * 0.1;
            this.cursorRing.dataset.x = newRingX;
            this.cursorRing.dataset.y = newRingY;
            this.cursorRing.style.transform =
                `translate(${newRingX}px, ${newRingY}px) translate(-50%, -50%)`;
        }

        if (window.engine) {
            window.engine.update(this.scrollVelocity, this.time, this.mouseX, this.mouseY);
            this.scrollVelocity *= 0.9;
        }

        requestAnimationFrame(this.render.bind(this));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new AppController();
});
