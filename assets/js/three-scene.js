window.PortfolioScene = class PortfolioScene {
    constructor() {
        this.canvas = document.getElementById('spatial-canvas');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000); // Pitch black
        this.scene.fog = new THREE.FogExp2(0x000000, 0.015);

        // Perspective Camera
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
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

        this.meshes = [];
        this.heroMesh = null;
        
        // Target scroll to smooth it further than lenis if needed, or just use raw scroll
        this.currentScroll = 0;

        this.initShaders();
        this.initGallery();
        
        window.addEventListener('resize', this.onResize.bind(this));
    }

    initShaders() {
        this.scrollVertexShader = `
            uniform float uVelocity;
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vec3 pos = position;
                
                // Bend the plane based on scroll velocity and vertical position (uv.y)
                // If scrolling fast, the top or bottom edges bend backwards into space
                float bend = uVelocity * 0.05 * sin(uv.y * 3.14);
                pos.z -= bend; 
                
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `;

        this.scrollFragmentShader = `
            uniform sampler2D uTexture;
            uniform float uVelocity;
            varying vec2 vUv;
            void main() {
                // RGB split (Chromatic Aberration) based on velocity
                vec2 rOffset = vec2(0.0, uVelocity * 0.0008);
                vec2 bOffset = vec2(0.0, -uVelocity * 0.0008);
                
                float r = texture2D(uTexture, vUv + rOffset).r;
                float g = texture2D(uTexture, vUv).g;
                float b = texture2D(uTexture, vUv + bOffset).b;
                
                gl_FragColor = vec4(r, g, b, 1.0);
            }
        `;

        this.heroVertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
                
                // Aspect ratio fix for circle (assuming hero is 4:3 roughly)
                vec2 aspectMouse = uMouse;
                
                float dist = distance(p, aspectMouse);
                
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
    }

    initGallery() {
        const urls = [
            "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_1798_Lq9jriEIq.JPG?updatedAt=1749805117554",
            "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2747%20(7)_FGtI_KVgr.JPG?updatedAt=1749800987624",
            "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2743%20(4)_2X_i5EcCa.JPG?updatedAt=1749800987675",
            "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2741%20(5)_Dr4sjJERtE.JPG?updatedAt=1749800987619",
            "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2614-Enhanced-NR_U80RKhtFi.jpg?updatedAt=1749765888119",
            "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2611-Enhanced-NR_r2dn4xZbQ.jpg?updatedAt=1749765888670",
            "https://ik.imagekit.io/prdadhich/Images/PhotoGraphyPortfolio/IMG_2596-Enhanced-NR_VKy1Bqqmx.jpg?updatedAt=1749765892757",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_4835_sQRc-ARvL.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_4716_bBfga8ZVG.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_4661_gGtFv5Rl5.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_4789_EzevERgVj.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_4765_R7hY2a7YW.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_5036%20(1)_R2tMntxos.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_0886_BtzxX-_qU.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_3570_BuzfbhWtx.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_3575_6wfUEDtbG.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_4424%20(1)_pIvxGwj7MQ.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_4420_x9KfCMZweQ.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_3519_FKjO9AgJt.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_1644_azflEJwra.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_1685_jn-mAW4fL.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_1059__dX86vUo8.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_1677_X0hRYm3TI.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_1816_ToA7M0iPd.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_1716_jiPTkzLae.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_3534_xx--ruHuXT.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_3904_Ak_PdiES2.jpg",
            "https://ik.imagekit.io/prdadhich/Images/Photography/IMG_1635_jBiFHuMlo7.jpg"
        ]; // Truncated slightly for performance as a massive monolithic column requires a subset to feel perfectly curated. 

        this.layoutSpacing = 55; // increased units between each photo block to prevent overlap
        this.totalHeight = urls.length * this.layoutSpacing;
        
        // Tell main.js how much to scroll based on our 3D space
        if (window.app) {
            window.maxScrollLength = this.totalHeight * 40; // pixel ratio
            document.getElementById('scroll-proxy').style.height = window.maxScrollLength + 'px';
        }

        urls.forEach((url, i) => {
            this.textureLoader.load(url, (texture) => {
                const ratio = texture.image.width / texture.image.height;
                const baseWidth = 30; // Massive photos
                const height = baseWidth / ratio;

                const geometry = new THREE.PlaneGeometry(baseWidth, height, 32, 32);

                if (i === 0) {
                    // HERO IMAGE
                    // Needs to be huge and in the background, filling the screen
                    const heroGeom = new THREE.PlaneGeometry(100, 100 / ratio, 64, 64);
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
                    this.heroMesh.position.set(0, 0, -20); // Push back slightly
                    this.scene.add(this.heroMesh);
                    
                    // Fade in Hero gently
                    gsap.to(this.heroMesh.material.uniforms.uOpacity, { value: 1.0, duration: 4, ease: "power2.out" });

                } else {
                    // ARCHIVE IMAGES
                    // Custom Shader Material that reacts to velocity
                    const material = new THREE.ShaderMaterial({
                        vertexShader: this.scrollVertexShader,
                        fragmentShader: this.scrollFragmentShader,
                        uniforms: {
                            uTexture: { value: texture },
                            uVelocity: { value: 0 }
                        },
                        transparent: true
                    });

                    const mesh = new THREE.Mesh(geometry, material);
                    
                    // Masonry / Scattered layout
                    // X alternates precisely left and right with a wider minimum gap
                    const offsetX = (i % 2 === 0 ? 1 : -1) * (14 + Math.random() * 6); 
                    // Y goes downwards sequentially, with a tiny random variation
                    const offsetY = -i * this.layoutSpacing - (Math.random() * 5);
                    // Z has deeper parallax to avoid clipping
                    const offsetZ = Math.random() * 15 - 10; 

                    mesh.position.set(offsetX, offsetY, offsetZ);

                    // Add slight random rotation to make them feel floating
                    mesh.rotation.z = (Math.random() - 0.5) * 0.1;

                    this.scene.add(mesh);
                    this.meshes.push(mesh);
                }
            });
        });
    }

    onScroll(scrollPixels, maxScrollPixels) {
        // Map pixel scroll to our 3D Y coordinate space
        // E.g., if scrolled 10%, camera Y should be - (10% of totalHeight)
        const progress = scrollPixels / maxScrollPixels;
        
        // target Y
        const targetY = -(progress * this.totalHeight);
        
        // Directly set camera position to target since Lenis already dampens the scroll value perfectly
        this.camera.position.y = targetY;

        // When scrolling down, fade out the hero image softly so it doesn't overlap later images
        if (this.heroMesh) {
            // Push hero up slightly (parallax) and fade it
            this.heroMesh.position.y = targetY * 0.5;
            
            // Fade out within the first 100 units of scroll
            const opacity = Math.max(0, 1 - (Math.abs(targetY) / 100));
            // We can't directly animate transparency of custom shader without an opacity uniform unless we use raw JS or modify the shader
            // For now, let's just push it way into the background (-Z) to hide it or keep it simple.
        }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    update(velocity, time, mouseX, mouseY) {
        // Update uniforms for Archive Images (Velocity Distortion)
        const normalizedVelocity = velocity * 1.5; // Amplification
        
        this.meshes.forEach(mesh => {
            if (mesh.material.uniforms) {
                mesh.material.uniforms.uVelocity.value = normalizedVelocity;
            }
            
            // Subtle floating animation
            mesh.position.y += Math.sin(time * 0.001 + mesh.position.x) * 0.01;
            mesh.position.x += Math.cos(time * 0.001 + mesh.position.y) * 0.005;
        });

        // Update uniforms for Hero Image (Liquid Ripple)
        if (this.heroMesh) {
            // Map Mouse to UV (0 to 1) 
            // The plane is centered. We need to map screen mouse to the plane UV.
            const uX = mouseX / window.innerWidth;
            const uY = 1.0 - (mouseY / window.innerHeight); // Y is flipped in UV

            this.heroMesh.material.uniforms.uMouse.value.set(uX, uY);
            // Three.js time is usually very large, so pass time / 1000 to keep it manageable
            this.heroMesh.material.uniforms.uTime.value = time * 0.002;
        }

        this.renderer.render(this.scene, this.camera);
    }
}
