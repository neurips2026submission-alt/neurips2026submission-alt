/**
 * Home Page Results Showcase Logic for C2CAD-Bench
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const HomeTable = {
    renderer: null,
    scenes: [],
    top4: [],
    
    PALETTE: {
        box:     { color:0x3b82f6, emissive:0x1d4ed8 },
        cylinder:{ color:0x10b981, emissive:0x064e3b },
        sphere:  { color:0xf43f5e, emissive:0x9f1239 },
        pipe:    { color:0xf59e0b, emissive:0x78350f },
        beam:    { color:0xa78bfa, emissive:0x4c1d95 },
        cone:    { color:0xec4899, emissive:0x831843 },
        torus:   { color:0x06b6d4, emissive:0x164e63 },
        default: { color:0xd1d5db, emissive:0x374151 }
    },

    AXIS_MAP: {x:[1,0,0],'+x':[1,0,0],'-x':[-1,0,0],y:[0,1,0],'+y':[0,1,0],'-y':[0,-1,0],z:[0,0,1],'+z':[0,0,1],'-z':[0,0,-1]},

    async init() {
        console.log('HomeTable: Initializing...');
        const container = document.getElementById('home-showcase-container');
        if (!container) return;

        // Ensure data is ready
        if (!window.SHOWCASE_DB) {
            console.log('HomeTable: Waiting for SHOWCASE_DB...');
            window.addEventListener('CG3D_DATA_READY', () => this.init());
            return;
        }

        this.findTopModels();
        this.setupRenderer();
        this.renderTable();
        this.animate();
    },

    findTopModels() {
        const { models } = window.SHOWCASE_DB;
        const sorted = Object.keys(models).sort((a, b) => {
            const avg = m => {
                const e = models[m].filter(x => x);
                return e.length ? e.reduce((s, x) => s + (x.score_global || 0), 0) / e.length : 0;
            };
            return avg(b) - avg(a);
        });
        this.top4 = sorted.slice(0, 4);
        console.log('HomeTable: Top 4 Models identified:', this.top4);
    },

    setupRenderer() {
        const canvas = document.createElement('canvas');
        canvas.id = 'home-table-canvas';
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '100';
        document.body.appendChild(canvas);

        this.renderer = new THREE.WebGLRenderer({ 
            canvas, 
            antialias: true, 
            alpha: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    },

    renderTable() {
        const container = document.getElementById('home-showcase-container');
        const { golden, models } = window.SHOWCASE_DB;

        // Select 8 landmark cases that show performance variance
        const cases = [
            golden.find(g => g.family === 'Spiral Staircase' && g.difficultyID === 1),
            golden.find(g => g.family === 'Suspension Bridge' && g.difficultyID === 1),
            golden.find(g => g.family === 'DNA Helix' && g.difficultyID === 3),
            golden.find(g => g.family === 'Voxel Grid' && g.difficultyID === 3),
            golden.find(g => g.family === 'Planetary Array' && g.difficultyID === 2),
            golden.find(g => g.family === 'Flanged Pipe Joint' && g.difficultyID === 3),
            golden.find(g => g.family === 'Fractal Y-Tree' && g.difficultyID === 2),
            golden.find(g => g.family === 'Radiolarian Skeleton' && g.difficultyID === 2)
        ].filter(x => x);

        let html = `
            <div class="table-container">
                <table class="table is-fullwidth is-hoverable showcase-table">
                    <thead>
                        <tr>
                            <th>Benchmark Task</th>
                            <th class="has-text-centered">Ground Truth</th>
                            <th class="has-text-centered">🥇 ${this.prettyModel(this.top4[0])}</th>
                            <th class="has-text-centered">🥈 ${this.prettyModel(this.top4[1])}</th>
                            <th class="has-text-centered">🥉 ${this.prettyModel(this.top4[2])}</th>
                            <th class="has-text-centered">🏅 ${this.prettyModel(this.top4[3])}</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        cases.forEach((g, rowIdx) => {
            const gIdx = golden.indexOf(g);
            html += `
                <tr class="reveal reveal-up">
                    <td class="task-info">
                        <strong>${g.family}</strong><br>
                        <small class="text-muted">${g.difficultyLabel}</small>
                    </td>
                    <td><div class="home-vp" id="home-vp-gold-${rowIdx}" data-type="gold" data-idx="${gIdx}"></div></td>
                    ${this.top4.map((m, i) => `
                        <td><div class="home-vp" id="home-vp-top${i+1}-${rowIdx}" data-type="ai" data-m="${m}" data-idx="${gIdx}"></div></td>
                    `).join('')}
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;

        // Initialize viewports
        const vps = document.querySelectorAll('.home-vp');
        vps.forEach(el => {
            const { type, idx, m } = el.dataset;
            const targetGold = golden[idx];
            let shapes = [];

            if (type === 'gold') {
                shapes = targetGold.shapes;
            } else if (models[m]) {
                // Robust matching by family and difficulty
                const result = models[m].find(res => 
                    res && 
                    res.family === targetGold.family && 
                    res.difficultyID === targetGold.difficultyID
                );
                shapes = result ? result.shapes : [];
            }
            
            this.createViewport(el, shapes, type === 'ai');
        });
    },

    createViewport(el, shapes, isAI) {
        const scene = new THREE.Scene();
        scene.background = null; // Transparent
        
        // Lighting
        scene.add(new THREE.HemisphereLight(0xffffff, 0xeeeeee, 1.0));
        const key = new THREE.DirectionalLight(0xffffff, 1.5);
        key.position.set(100, 100, 100);
        scene.add(key);
        scene.add(new THREE.AmbientLight(0xffffff, 0.2));

        const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.1, 5000);
        const controls = new OrbitControls(camera, el);
        controls.enableDamping = true;
        controls.enablePan = false;
        controls.enableZoom = false; // Zoom is handled by auto-fit, but we can enable scroll zoom if desired

        const group = new THREE.Group();
        const box = new THREE.Box3();

        shapes.forEach(s => {
            const mat = this.makeMat(s.type);
            const mesh = this.buildMesh(s, mat);
            if (mesh) {
                group.add(mesh);
                box.expandByObject(mesh);
            }
        });
        scene.add(group);

        // Auto-fit Logic
        if (!box.isEmpty()) {
            const center = new THREE.Vector3();
            box.getCenter(center);
            const size = new THREE.Vector3();
            box.getSize(size);
            
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
            cameraZ *= 1.8; // Padding

            camera.position.set(center.x + cameraZ*0.6, center.y + cameraZ*0.6, center.z + cameraZ*0.5);
            controls.target.copy(center);
        } else {
            camera.position.set(100, 100, 100);
        }
        
        controls.update();
        this.scenes.push({ scene, camera, controls, element: el });
    },

    makeMat(type) {
        const p = this.PALETTE[type] || this.PALETTE.default;
        return new THREE.MeshStandardMaterial({ 
            color: p.color, 
            emissive: p.emissive, 
            emissiveIntensity: 0.15,
            metalness: 0.2,
            roughness: 0.3,
            side: THREE.DoubleSide 
        });
    },

    buildMesh(shape, mat) {
        const c = this.parseCenter(shape.center);
        const t = (shape.type||'').toLowerCase();

        try {
            if (t === 'box') {
                let sz = shape.size || shape.dimensions || shape.dim || [10,10,10];
                if (typeof sz === 'object' && !Array.isArray(sz)) sz = [Number(sz.x||10), Number(sz.y||10), Number(sz.z||10)];
                const m = new THREE.Mesh(new THREE.BoxGeometry(...sz.map(Number)), mat);
                m.position.set(...c); return m;
            } else if (t === 'sphere') {
                const m = new THREE.Mesh(new THREE.SphereGeometry(shape.radius||1,32,32), mat);
                m.position.set(...c); return m;
            } else if (t === 'cylinder') {
                const r=Number(shape.radius)||1, h=Number(shape.height||shape.length)||2;
                const m = new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,32), mat);
                m.position.set(...c);
                const axis = new THREE.Vector3(...this.parseAxis(shape.axis)).normalize();
                m.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), axis));
                return m;
            } else if (t === 'pipe') {
                const ri=Number(shape.inner_radius)||2, ro=Number(shape.outer_radius)||4, h=Number(shape.height||shape.length)||8;
                const grp = new THREE.Group();
                grp.add(new THREE.Mesh(new THREE.CylinderGeometry(ro,ro,h,32,1,true), mat));
                grp.add(new THREE.Mesh(new THREE.CylinderGeometry(ri,ri,h,32,1,true), mat));
                const r1=new THREE.Mesh(new THREE.RingGeometry(ri,ro,32),mat); r1.rotation.x=Math.PI/2; r1.position.y= h/2; grp.add(r1);
                const r2=new THREE.Mesh(new THREE.RingGeometry(ri,ro,32),mat); r2.rotation.x=-Math.PI/2; r2.position.y=-h/2; grp.add(r2);
                const axis = new THREE.Vector3(...this.parseAxis(shape.axis)).normalize();
                grp.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), axis));
                grp.position.set(...c); return grp;
            } else if (t === 'cone') {
                const rb=Number(shape.base_radius||shape.radius||2), rt=Number(shape.top_radius)||0, h=Number(shape.height||4);
                const m = new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,32), mat);
                m.position.set(...c);
                const axis = new THREE.Vector3(...this.parseAxis(shape.axis)).normalize();
                m.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), axis));
                return m;
            } else if (t === 'torus') {
                const R=Number(shape.ring_radius||5), r=Number(shape.tube_radius||1);
                const m = new THREE.Mesh(new THREE.TorusGeometry(R,r,16,32), mat);
                m.position.set(...c);
                const axis = new THREE.Vector3(...this.parseAxis(shape.axis)).normalize();
                m.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), axis));
                return m;
            } else if (t === 'beam') {
                const v1=new THREE.Vector3(...(shape.start||[0,0,0])), v2=new THREE.Vector3(...(shape.end||[10,0,0]));
                const len=Math.max(v1.distanceTo(v2),0.1);
                const m=new THREE.Mesh(new THREE.BoxGeometry(shape.width||2,shape.height||2,len), mat);
                m.position.copy(new THREE.Vector3().addVectors(v1,v2).multiplyScalar(0.5));
                m.lookAt(v2); return m;
            }
        } catch(e) { console.warn('HomeTable mesh error:', e); }
        return null;
    },

    parseCenter(c) {
        if (Array.isArray(c)) return c.map(Number);
        if (typeof c === 'object' && c && 'x' in c) return [Number(c.x), Number(c.y), Number(c.z)];
        return [0, 0, 0];
    },

    parseAxis(a) {
        if (!a) return [0,0,1];
        if (typeof a === 'string') return this.AXIS_MAP[a.toLowerCase().trim()] || [0,0,1];
        if (Array.isArray(a)) return a.map(Number);
        return [0,0,1];
    },

    animate() {
        requestAnimationFrame(() => this.animate());
        this.scenes.forEach(s => {
            const rect = s.element.getBoundingClientRect();
            if (rect.bottom < 0 || rect.top > window.innerHeight) return;
            s.controls.update();
            this.renderer.setViewport(rect.left, window.innerHeight - rect.bottom, rect.width, rect.height);
            this.renderer.setScissor(rect.left, window.innerHeight - rect.bottom, rect.width, rect.height);
            this.renderer.setScissorTest(true);
            this.renderer.render(s.scene, s.camera);
        });
    },

    prettyModel(m) {
        const names = {
            'gemini-2.5-flash': 'Gemini 2.5 Flash',
            'gemini-2.5-pro': 'Gemini 2.5 Pro',
            'gemini-3.1-flash-lite-preview': 'Gemini 3.1 Flash-Lite',
            'gemini-3-flash-preview': 'Gemini 3 Flash',
            'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
            'claude-opus-4-6': 'Claude Opus 4.6',
            'claude-sonnet-4-6': 'Claude Sonnet 4.6',
            'deepseek-chat': 'DeepSeek V3.2',
            'deepseek-reasoner': 'DeepSeek R1',
            'gpt-4.1': 'GPT-4.1',
            'gpt-5.4': 'GPT-5.4',
            'gpt-5.4-mini': 'GPT-5.4 Mini',
            'kimi-k2.5': 'Kimi K2.5',
        };
        return names[m] || m;
    }
};

window.addEventListener('DOMContentLoaded', () => HomeTable.init());
