window.PortfolioScene = class PortfolioScene {
    constructor() {
        this.canvas = document.getElementById('spatial-canvas');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.scene.fog = new THREE.FogExp2(0x000000, 0.012);

        // Perspective Camera
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
        this.camera.position.z = 50;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.textureLoader = new THREE.TextureLoader();
        this.textureLoader.setCrossOrigin('anonymous');

        this.meshes = [];       // Archive image meshes
        this.heroMesh = null;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.currentScroll = 0;
        this._lastHoveredMesh = null; // track hover changes to avoid DOM updates every frame

        // --- Performance: Lazy loading ---
        this._pendingImages = [];
        this._frustum = new THREE.Frustum();
        this._frustumMatrix = new THREE.Matrix4();

        // Shared shader programs (one per type, not per mesh)
        this.initShaders();
        this.initGallery();

        window.addEventListener('resize', this.onResize.bind(this));
    }

    initShaders() {
        // --- Archive image shader ---
        this.scrollVertexShader = `
            uniform float uVelocity;
            uniform float uTime;
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vec3 pos = position;
                float bend = uVelocity * 0.05 * sin(uv.y * 3.14);
                float organicMorph = sin(pos.x * 0.5 + uTime * 2.0) * cos(pos.y * 0.5 + uTime) * uVelocity * 0.05;
                pos.z -= bend + organicMorph;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `;

        this.scrollFragmentShader = `
            uniform sampler2D uTexture;
            uniform float uVelocity;
            uniform float uTime;
            uniform float uHoverState;
            uniform float uOpacity;
            varying vec2 vUv;

            void main() {
                vec2 uv = vUv;

                // Liquid distortion on hover
                if (uHoverState > 0.0) {
                    float waveX = sin(uv.y * 12.0 + uTime * 3.0);
                    float waveY = cos(uv.x * 10.0 + uTime * 2.0);
                    uv.x += waveX * 0.015 * uHoverState;
                    uv.y += waveY * 0.015 * uHoverState;
                }

                // Velocity Chromatic Aberration + Hover Blur
                vec2 rOffset = vec2(0.0, uVelocity * 0.0008);
                vec2 bOffset = vec2(0.0, -uVelocity * 0.0008);
                if (uHoverState > 0.0) {
                    rOffset += vec2(0.003 * uHoverState, 0.001 * uHoverState);
                    bOffset += vec2(-0.003 * uHoverState, -0.001 * uHoverState);
                }

                float r = texture2D(uTexture, uv + rOffset).r;
                float g = texture2D(uTexture, uv).g;
                float b = texture2D(uTexture, uv + bOffset).b;

                vec4 finalColor = vec4(r, g, b, 1.0);
                finalColor.rgb += vec3(0.05 * uHoverState);
                gl_FragColor = vec4(finalColor.rgb, uOpacity);
            }
        `;

        // --- Hero shader ---
        this.heroVertexShader = `
            varying vec2 vUv;
            uniform float uTime;
            void main() {
                vUv = uv;
                vec3 pos = position;
                pos.z += sin(pos.x * 0.1 + uTime) * 0.8;
                pos.z += cos(pos.y * 0.1 + uTime) * 0.8;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `;

        this.heroFragmentShader = `
            uniform sampler2D uTexture;
            uniform float uTime;
            uniform vec2 uMouse;
            uniform float uOpacity;
            varying vec2 vUv;

            void main() {
                vec2 p = vUv;
                float dist = distance(p, uMouse);
                vec2 offset = vec2(0.0);
                if (dist < 0.4) {
                    float amplitude = (0.4 - dist) * 0.1;
                    float wave = sin(-dist * 30.0 + uTime * 3.0);
                    offset = vec2(wave * amplitude);
                }
                vec4 color = texture2D(uTexture, p + offset);
                gl_FragColor = vec4(color.rgb, color.a * uOpacity);
            }
        `;

        // --- Shared placeholder (grey) for unloaded images ---
        this.placeholderFragmentShader = `
            uniform float uOpacity;
            varying vec2 vUv;
            void main() {
                float v = 0.08 + sin(vUv.x * 3.14) * sin(vUv.y * 3.14) * 0.04;
                gl_FragColor = vec4(v, v, v, uOpacity);
            }
        `;
        this.placeholderVertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
    }

    initGallery() {
        // ─────────────────────────────────────────────────────────────────────
        // IMAGE ARRAY
        // • index 0 = hero (always shown full-screen on entry, DO NOT move it)
        // • section: tag images with a series name; images with the same section
        //   get a floating label before the first image of that section.
        //   Use "Placeholder" until you're ready to tag — labels are skipped for it.
        // ─────────────────────────────────────────────────────────────────────
        const images = [
            // ── HERO (index 0 — never change position) ──────────────────────
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_1798_Lq9jriEIq.JPG?updatedAt=1749805117554", section: "Placeholder" },

            // ── Archive images ───────────────────────────────────────────────
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2747%20(7)_FGtI_KVgr.JPG?updatedAt=1749800987624", section: "Portrait", location: "Trento, Italy", year: "2025" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2743%20(4)_2X_i5EcCa.JPG?updatedAt=1749800987675", section: "Portrait", location: "Trento, Italy", year: "2025" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2741%20(5)_Dr4sjJERtE.JPG?updatedAt=1749800987619", section: "Portrait", location: "Trento, Italy", year: "2025" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2614-Enhanced-NR_U80RKhtFi.jpg?updatedAt=1749765888119", section: "Portrait", location: "Milan, Italy", year: "2023" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2611-Enhanced-NR_r2dn4xZbQ.jpg?updatedAt=1749765888670", section: "Portrait", location: "Milan, Italy", year: "2023" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2596-Enhanced-NR_VKy1Bqqmx.jpg?updatedAt=1749765892757", section: "Portrait", location: "Milan, Italy", year: "2023" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_4577_sqDKt80-3.jpg?updatedAt=1773961966167", section: "Birds", location: "Trento, Italy", year: "2026" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_2464_RKjXy7HoE.jpg?updatedAt=1773962587823", section: "Birds", location: "Trento, Italy", year: "2025" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_4835_sQRc-ARvL.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_4716_bBfga8ZVG.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_4661_gGtFv5Rl5.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_4789_EzevERgVj.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_4765_R7hY2a7YW.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_5036%20(1)_R2tMntxos.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_0886_BtzxX-_qU.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_3570_BuzfbhWtx.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_3575_6wfUEDtbG.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2665_tLp9E6ldA.jpg?updatedAt=1749765899443", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_4424%20(1)_pIvxGwj7MQ.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2372_8NlQJbouMj.jpg?updatedAt=1749765894296", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2668_ncE2RG3ZV.jpg?updatedAt=1749765902921", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_4420_x9KfCMZweQ.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_3519_FKjO9AgJt.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2647_Nu3h1YlOPQ.jpg?updatedAt=1749765904154", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_1644_azflEJwra.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_1685_jn-mAW4fL.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_1059__dX86vUo8.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_1677_X0hRYm3TI.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_1816_ToA7M0iPd.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_1716_jiPTkzLae.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_3534_xx--ruHuXT.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_3904_Ak_PdiES2.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_1635_jBiFHuMlo7.jpg", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_9492_p8rcx2Dus.jpg?updatedAt=1749801943552", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_7180%20(1)_iXwQrusEc.jpg?updatedAt=1749801943246", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_1907_x0zyZNASE.jpg?updatedAt=1749801941097", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2329_QfCDyDTS3.jpg?updatedAt=1749765891133", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2327_ufFeQKb7O.jpg?updatedAt=1749765885191", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2747__-IVrLE82.jpg?updatedAt=1749765186109", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2742_1EFf97ShB.jpg?updatedAt=1749765185075", section: "Placeholder" },
            { url: "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/PXL_20240714_100356796_2g6LvKA8W.jpg?updatedAt=1749801944710", section: "Placeholder" }
        ];

        // ─────────────────────────────────────────────────────────────────────
        // Layout constants
        // ─────────────────────────────────────────────────────────────────────
        const aspect = window.innerWidth / window.innerHeight;
        this.isMobile = aspect < 1.0;
        this.baseWidth = this.isMobile ? 22 : 26;
        this.xSpread = this.isMobile ? 1 : 12;
        this.layoutSpacing = 50;

        // Archive images start at index 1
        const archiveCount = images.length - 1;
        // Add 3 extra spacings of travel at the end so the camera physically
        // moves past all images before reaching max scroll. At ~150 units
        // above camera, existing fog reduces images to ~15% visibility
        // — they dissolve naturally without extra opacity logic.
        this.totalHeight = archiveCount * this.layoutSpacing + this.layoutSpacing * 3;

        // Expose scroll proxy length before engine is ready
        const proxyHeight = this.totalHeight * 40;
        window.maxScrollLength = proxyHeight;
        const proxy = document.getElementById('scroll-proxy');
        if (proxy) proxy.style.height = proxyHeight + 'px';

        // ─────────────────────────────────────────────────────────────────────
        // Build layout — Math.random() for the organic scattered feel
        // ─────────────────────────────────────────────────────────────────────

        // Track last seen section to detect transitions
        let lastSection = null;
        this._sectionLabels = [];

        images.forEach((image, i) => {
            if (i === 0) {
                // ── Hero image — load immediately (always index 0) ──────────
                this._loadHero(image.url);
                return;
            }

            const archiveIndex = i - 1; // 0-based archive index

            // Random layout offsets.
            // CRITICAL: use (archiveIndex + 1) for Y so the first archive
            // image starts at y ≈ -layoutSpacing, safely BELOW the hero
            // which sits at y=0. Without +1, archiveIndex=0 gives offsetY≈0,
            // placing the image directly on top of the hero.
            const offsetX = (archiveIndex % 2 === 0 ? 1 : -1)
                * (this.xSpread + Math.random() * (this.isMobile ? 2.5 : 6));
            const offsetY = -(archiveIndex + 1) * this.layoutSpacing - (Math.random() * 5);
            // No more cumulative depth crawl — images stay at a consistent distance
            // const offsetZ = (Math.random() * 6 - 3);
            const offsetZ = -archiveIndex * .9 + (Math.random() * 4 - 2);

            const rotZ = (Math.random() - 0.5) * 0.1;
            const rotY = (Math.random() - 0.5) * 0.35;
            const rotX = (Math.random() - 0.5) * 0.12;

            // ── Section label sprite ───────────────────────────────────────
            if (image.section !== "Placeholder" && image.section !== lastSection) {
                lastSection = image.section;
                const labelMesh = this._createSectionLabel(image.section);
                const labelY = offsetY + this.layoutSpacing * 0.6;
                labelMesh.position.set(0, labelY, offsetZ + 2);
                labelMesh.baseY = labelY;
                this.scene.add(labelMesh);
                this._sectionLabels.push({ mesh: labelMesh, baseY: labelY });
            }

            // ── Create placeholder mesh immediately ────────────────────────
            const defaultAspect = 1.5;
            const w = this.baseWidth;
            const h = w / defaultAspect;
            const geometry = new THREE.PlaneGeometry(w, h, 4, 4);
            const placeholderMat = new THREE.ShaderMaterial({
                vertexShader: this.placeholderVertexShader,
                fragmentShader: this.placeholderFragmentShader,
                uniforms: { uOpacity: { value: 0.0 } },
                transparent: true
            });

            const mesh = new THREE.Mesh(geometry, placeholderMat);
            mesh.position.set(offsetX, offsetY, offsetZ);
            mesh.rotation.set(rotX, rotY, rotZ);
            mesh.baseX = offsetX;
            mesh.baseY = offsetY;
            mesh.baseZ = offsetZ;
            mesh._textureLoaded = false;
            mesh._loading = false;
            mesh._imageIndex = archiveIndex;
            // Store caption metadata — add location/year to any image object to enable the caption
            // Format: { url: "...", section: "Portrait", location: "Dolomiti", year: "2024" }
            mesh._meta = { location: image.location || '', year: image.year || '' };

            // Fade in placeholder
            gsap.to(placeholderMat.uniforms.uOpacity, {
                value: 0.35, duration: 1.5,
                delay: Math.min(archiveIndex * 0.03, 0.8),
                ease: 'power2.out'
            });

            this.scene.add(mesh);
            this.meshes.push(mesh);

            this._pendingImages.push({ archiveIndex, url: image.url, mesh });
        });

        // Load the first few images immediately (visible on load)
        const EAGER_COUNT = 4;
        this._pendingImages.slice(0, EAGER_COUNT).forEach(p => this._loadTexture(p));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Hero image loader
    // ─────────────────────────────────────────────────────────────────────────
    _loadHero(url) {
        this.textureLoader.load(url, (texture) => {
            texture.minFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;
            const ratio = texture.image.width / texture.image.height;
            const heroGeom = new THREE.PlaneGeometry(100, 100 / ratio, 32, 32);
            const heroMat = new THREE.ShaderMaterial({
                vertexShader: this.heroVertexShader,
                fragmentShader: this.heroFragmentShader,
                uniforms: {
                    uTexture: { value: texture },
                    uTime: { value: 0 },
                    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
                    uOpacity: { value: 0.0 }
                },
                transparent: true
            });
            this.heroMesh = new THREE.Mesh(heroGeom, heroMat);
            this.heroMesh.position.set(0, 0, -20);
            this.scene.add(this.heroMesh);
            gsap.to(this.heroMesh.material.uniforms.uOpacity, { value: 1.0, duration: 4, ease: "power2.out" });
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lazy texture loader — swaps placeholder shader for real image shader
    // ─────────────────────────────────────────────────────────────────────────
    _loadTexture(pending) {
        if (pending.mesh._loading || pending.mesh._textureLoaded) return;
        pending.mesh._loading = true;

        this.textureLoader.load(pending.url, (texture) => {
            texture.minFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;
            texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 4);

            const mesh = pending.mesh;
            const ratio = texture.image.width / texture.image.height;
            // Boost landscape images (+30%) so they fill the narrow phone width better
            const landscapeFactor = ratio > 1.1 ? 1.3 : 1.0;
            const w = this.baseWidth * landscapeFactor;
            const h = w / ratio;

            // Rebuild geometry with correct aspect ratio
            mesh.geometry.dispose();
            mesh.geometry = new THREE.PlaneGeometry(w, h, 6, 6);

            // Grab current opacity before disposing
            const currentOpacity = mesh.material.uniforms.uOpacity.value;
            mesh.material.dispose();

            mesh.material = new THREE.ShaderMaterial({
                vertexShader: this.scrollVertexShader,
                fragmentShader: this.scrollFragmentShader,
                uniforms: {
                    uTexture: { value: texture },
                    uVelocity: { value: 0 },
                    uTime: { value: 0 },
                    uHoverState: { value: 0 },
                    uOpacity: { value: currentOpacity }
                },
                transparent: true
            });

            // Fade in from placeholder opacity to full
            gsap.to(mesh.material.uniforms.uOpacity, { value: 1.0, duration: 1.2, ease: 'power2.out' });
            mesh._textureLoaded = true;
            mesh._loading = false;
        }, undefined, () => {
            // On error, reset so it can be retried
            pending.mesh._loading = false;
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Section label — canvas-rendered text as a sprite in 3D space
    // ─────────────────────────────────────────────────────────────────────────
    _createSectionLabel(text) {
        const canvas = document.createElement('canvas');
        const dpr = Math.min(window.devicePixelRatio, 2);
        canvas.width = 512 * dpr;
        canvas.height = 80 * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        // Background line
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, 40);
        ctx.lineTo(512, 40);
        ctx.stroke();

        // Label text
        ctx.font = '300 11px "Outfit", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.letterSpacing = '0.25em';
        ctx.fillText('— ' + text.toUpperCase(), 16, 44);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        const mat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(mat);
        // Scale: canvas is 512×80, map to world units
        const scaleX = this.isMobile ? 18 : 28;
        sprite.scale.set(scaleX, scaleX * (80 / 512), 1);

        // Fade in
        gsap.to(mat, { opacity: 1.0, duration: 1.5, ease: 'power2.out' });

        return sprite;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Scroll handler — called by main.js Lenis callback
    // ─────────────────────────────────────────────────────────────────────────
    onScroll(scrollPixels, maxScrollPixels) {
        const progress = scrollPixels / maxScrollPixels;
        const targetY = -(progress * this.totalHeight);

        this.camera.position.y = targetY;
        this.camera.position.x = this.isMobile ? 0 : Math.sin(targetY * 0.02) * 1.5;
        this.camera.position.z = this.isMobile ? 60 : 50 + Math.sin(targetY * 0.015) * 2.5;

        if (this.heroMesh) {
            this.heroMesh.position.y = targetY * 0.5;
            const heroOpacity = Math.max(0, 1 - (Math.abs(targetY) / 35));
            this.heroMesh.material.uniforms.uOpacity.value = heroOpacity;
        }

        this._checkLazyLoad(targetY);
        this._updateFrameCounter(targetY);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lazy load: load textures for images within a lookahead window
    // ─────────────────────────────────────────────────────────────────────────
    _checkLazyLoad(cameraY) {
        const LOOKAHEAD = this.layoutSpacing * 5; // load 5 images ahead
        const camAbsY = Math.abs(cameraY);

        this._pendingImages.forEach(pending => {
            if (pending.mesh._textureLoaded || pending.mesh._loading) return;
            const meshAbsY = Math.abs(pending.mesh.baseY);
            if (meshAbsY - camAbsY < LOOKAHEAD) {
                this._loadTexture(pending);
            }
        });
    }

    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const aspect = width / height;

        // Skip massive re-renders for tiny height changes (like mobile URL bar)
        if (this._lastWidth === width && Math.abs(this._lastHeight - height) < 100) {
            return;
        }

        this._lastWidth = width;
        this._lastHeight = height;

        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);

        const wasMobile = this.isMobile;
        this.isMobile = aspect < 1.0;
        this.camera.position.z = this.isMobile ? 60 : 50;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Main update — called every frame from main.js render loop
    // ─────────────────────────────────────────────────────────────────────────
    update(velocity, time, mouseX, mouseY) {
        // Raycaster — use matchMedia(pointer:coarse) as the touch guard.
        const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;

        if (isCoarsePointer) {
            // MOBILE: No cursor, so we "hover" whatever image is in the center of the screen.
            // This makes the gallery feel tactile as you scroll.
            this.pointer.set(0, 0);
            this.raycaster.setFromCamera(this.pointer, this.camera);
        } else {
            // DESKTOP: Traditional mouse hover.
            this.pointer.x = (mouseX / window.innerWidth) * 2 - 1;
            this.pointer.y = -(mouseY / window.innerHeight) * 2 + 1;
            this.raycaster.setFromCamera(this.pointer, this.camera);
        }

        const intersects = this.raycaster.intersectObjects(this.meshes, false);
        let hoveredMesh = null;
        if (intersects.length > 0) {
            hoveredMesh = intersects[0].object;
            if (!isCoarsePointer) document.body.classList.add('hovering');
        } else {
            document.body.classList.remove('hovering');
        }

        const normalizedVelocity = velocity * 1.5;
        const t = time * 0.001;

        // ── Frustum culling: skip updates for off-screen meshes ────────────
        this._frustumMatrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
        this._frustum.setFromProjectionMatrix(this._frustumMatrix);

        this.meshes.forEach(mesh => {
            // Skip floating animation & uniform updates for far-away meshes
            const inView = this._frustum.intersectsObject(mesh);

            if (inView && mesh.material.uniforms) {
                mesh.material.uniforms.uVelocity && (mesh.material.uniforms.uVelocity.value = normalizedVelocity);
                mesh.material.uniforms.uTime && (mesh.material.uniforms.uTime.value = t);

                if (mesh.material.uniforms.uHoverState) {
                    if (mesh === hoveredMesh) {
                        mesh.material.uniforms.uHoverState.value += (1.0 - mesh.material.uniforms.uHoverState.value) * 0.15;
                    } else {
                        mesh.material.uniforms.uHoverState.value += (0.0 - mesh.material.uniforms.uHoverState.value) * 0.1;
                    }
                }
            }

            // Subtle floating animation — only for meshes near camera
            if (inView) {
                mesh.position.y = mesh.baseY + Math.sin(time * 0.0007 + mesh.baseX) * 0.4;
                mesh.position.x = mesh.baseX + Math.cos(time * 0.0007 + mesh.baseY) * 0.15;
            }
        });

        // Hero shader update
        if (this.heroMesh) {
            const uX = mouseX / window.innerWidth;
            const uY = 1.0 - (mouseY / window.innerHeight);
            this.heroMesh.material.uniforms.uMouse.value.set(uX, uY);
            this.heroMesh.material.uniforms.uTime.value = time * 0.002;
        }

        // Update caption only when hovered mesh changes (not every frame)
        if (hoveredMesh !== this._lastHoveredMesh) {
            this._lastHoveredMesh = hoveredMesh;
            this._updateCaption(hoveredMesh);
        }

        this.renderer.render(this.scene, this.camera);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Photo caption: shows location + year when hovering an archive image
    // ─────────────────────────────────────────────────────────────────────────
    _updateCaption(mesh) {
        const caption = document.getElementById('photo-caption');
        if (!caption) return;

        if (mesh && mesh._meta) {
            const { location, year } = mesh._meta;
            // Only show if at least one field is filled
            if (location || year) {
                const locEl = document.getElementById('caption-location');
                const yearEl = document.getElementById('caption-year');
                if (locEl) locEl.textContent = location.toUpperCase();
                if (yearEl) yearEl.textContent = year;
                caption.classList.add('visible');
            } else {
                caption.classList.remove('visible');
            }
        } else {
            caption.classList.remove('visible');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Frame counter: updates the HUD footer as camera descends through archive
    // ─────────────────────────────────────────────────────────────────────────
    _updateFrameCounter(targetY) {
        const counter = document.getElementById('frame-counter');
        if (!counter || this.meshes.length === 0) return;

        const total = this.meshes.length;
        const progress = Math.abs(targetY) / this.totalHeight;
        const frame = Math.min(Math.round(progress * total) + 1, total);

        if (Math.abs(targetY) < 8) {
            // At the top (hero visible) — show the volume label
            counter.textContent = 'VOL. I';
        } else if (progress >= 0.85) {
            // At the end — show volume label again
            // Threshold reduced to 0.85 because totalHeight now includes travel padding
            counter.textContent = 'VOL. I — 2026';
        } else {
            // Scrolling through the archive — show live frame position
            const pad = (n) => String(n).padStart(2, '0');
            counter.textContent = `${pad(frame)} / ${pad(total)}`;
        }
    }
};
