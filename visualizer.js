/**
 * 3D Visualizer Logic for C2CAD-Bench
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const Visualizer = {
    scenes: [],
    renderer: null,
    currentPhase: 1,
    currentModelId: null,

    PALETTE: {
        box:     { color:0x3b82f6, emissive:0x1d4ed8, metalness:0.15, roughness:0.25 },
        cylinder:{ color:0x10b981, emissive:0x064e3b, metalness:0.2,  roughness:0.2  },
        sphere:  { color:0xf43f5e, emissive:0x9f1239, metalness:0.1,  roughness:0.35 },
        pipe:    { color:0xf59e0b, emissive:0x78350f, metalness:0.35, roughness:0.15 },
        beam:    { color:0xa78bfa, emissive:0x4c1d95, metalness:0.1,  roughness:0.3  },
        cone:    { color:0xec4899, emissive:0x831843, metalness:0.2,  roughness:0.2  },
        torus:   { color:0x06b6d4, emissive:0x164e63, metalness:0.3,  roughness:0.15 },
        default: { color:0xd1d5db, emissive:0x374151, metalness:0.05, roughness:0.4  }
    },

    AXIS_MAP: {x:[1,0,0],'+x':[1,0,0],'-x':[-1,0,0],y:[0,1,0],'+y':[0,1,0],'-y':[0,-1,0],z:[0,0,1],'+z':[0,0,1],'-z':[0,0,-1]},

    init() {
        console.log('Visualizer: Initializing Three.js scene...');
        const canvas = document.getElementById('main-canvas');
        if (!canvas) {
            console.error('Visualizer Error: main-canvas element not found!');
            return;
        }

        try {
            this.renderer = new THREE.WebGLRenderer({ 
                canvas, 
                antialias: true, 
                alpha: true, 
                logarithmicDepthBuffer: true,
                powerPreference: 'high-performance'
            });
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
            this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.15;
            this.renderer.outputColorSpace  = THREE.SRGBColorSpace;
            this.renderer.localClippingEnabled = true;

            this.setupPhaseListeners();
            this.setupModelSelector();
            this.animate();
            
            console.log('Visualizer: Scene initialized. Switching to Phase 1...');
            this.switchPhase(1);
        } catch (err) {
            console.error('Visualizer: Critical initialization error:', err);
        }
    },

    setupPhaseListeners() {
        document.querySelectorAll('.phase-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchPhase(parseInt(tab.dataset.phase)));
        });
    },

    setupModelSelector() {
        const sel = document.getElementById('modelSelector');
        sel.addEventListener('change', () => {
            this.currentModelId = sel.value;
            this.refreshView();
        });
    },

    switchPhase(phase) {
        console.log(`Visualizer: Switching to Phase ${phase}...`);
        this.currentPhase = phase;
        document.querySelectorAll('.phase-tab').forEach(t => t.classList.toggle('active', parseInt(t.dataset.phase) === phase));
        
        const phaseData = window[`CG3D_P${phase}`];
        if (phaseData) {
            this.populateModelSelector(phaseData.models);
            this.currentModelId = this.currentModelId || document.getElementById('modelSelector').value;
            this.refreshView();
        } else {
            console.warn(`Visualizer Warning: Data for Phase ${phase} not found in global scope.`);
            const content = document.getElementById('content');
            if (content && content.innerHTML.includes('Preparing')) {
                content.innerHTML = `<div style="padding:40px; text-align:center; color:var(--text-muted)">Waiting for Phase ${phase} data...</div>`;
            }
        }
    },

    populateModelSelector(models) {
        const sel = document.getElementById('modelSelector');
        if (sel.options.length > 0) return; // Only populate once if list doesn't change

        const provOrder = ['gemini','claude','deepseek','openai','kimi','custom'];
        const grouped = {};
        for (const id of Object.keys(models)) {
            const p = this.getProvider(id);
            (grouped[p] = grouped[p] || []).push(id);
        }

        sel.innerHTML = '';
        for (const prov of provOrder) {
            if (!grouped[prov]?.length) continue;
            const og = document.createElement('optgroup');
            og.label = prov.charAt(0).toUpperCase() + prov.slice(1);
            for (const id of grouped[prov]) {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = this.prettyModel(id);
                og.appendChild(opt);
            }
            sel.appendChild(og);
        }
    },

    refreshView() {
        const phaseData = window[`CG3D_P${this.currentPhase}`];
        if (!phaseData) return;

        const content = document.getElementById('content');
        content.innerHTML = '';
        
        // Cleanup old scenes
        this.scenes.forEach(s => {
            s.scene.traverse(o => { 
                if(o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
            });
        });
        this.scenes = [];

        const { golden, models } = phaseData;
        const aiData = models[this.currentModelId] || [];
        const prov = this.getProvider(this.currentModelId);

        const familyMap = new Map();
        golden.forEach((g, idx) => {
            if (!familyMap.has(g.family)) familyMap.set(g.family, []);
            familyMap.get(g.family).push({ g, ai: aiData[idx]||null, idx });
        });

        familyMap.forEach((entries, familyName) => {
            entries.sort((a,b) => (a.g.difficultyID||0) - (b.g.difficultyID||0));
            this.renderFamilyBlock(familyName, entries, prov);
        });
        
        this.updateOverallBadge(aiData);
    },

    renderFamilyBlock(name, entries, prov) {
        const content = document.getElementById('content');
        const blockId = 'fb-' + name.replace(/[^a-z0-9]/gi, '_');
        const block = document.createElement('div');
        block.className = 'family-block';

        const lvlBtns = entries.map((e, i) => 
            `<button class="lvl-btn ${i === 0 ? 'active' : ''}" data-li="${i}" onclick="window._switchLvl('${blockId}', ${i}, ${entries.length})">L${e.g.difficultyID || i+1}</button>`
        ).join('');

        block.innerHTML = `
            <div class="family-header">
                <span class="family-name">${name}</span>
                <span class="fam-phase-pill">Phase ${entries[0].g.phase}</span>
                <div class="level-switcher">${lvlBtns}</div>
            </div>
        `;

        entries.forEach(({ g, ai, idx }, i) => {
            const row = this.createRowHTML(blockId, i, g, ai, idx, prov);
            block.appendChild(row);
        });

        content.appendChild(block);

        // Initialize first level viewports
        const { g, ai, idx } = entries[0];
        this.createViewport(document.getElementById(`vp-g-${idx}`), g.shapes || [], false, `vp-g-${idx}`);
        this.createViewport(document.getElementById(`vp-a-${idx}`), ai?.shapes || [], true, `vp-a-${idx}`);
        
        block._entries = entries;
        block._loaded = new Set([0]);
    },

    createRowHTML(blockId, i, g, ai, idx, prov) {
        const vpGId = `vp-g-${idx}`, vpAId = `vp-a-${idx}`;
        const row = document.createElement('div');
        row.className = 'vp-row';
        row.id = `${blockId}-row-${i}`;
        row.style.display = i === 0 ? 'grid' : 'none';

        let scoreTags = '';
        if (ai) {
            const cv = ai.score_cov || 0, gm = ai.score_geom || 0, sm = ai.score_sem || 0, gl = ai.score_global || 0;
            scoreTags = `
                <span class="score-badge" style="color:${this.scoreColor(cv)}">Cov ${cv}%</span>
                <span class="score-badge" style="color:${this.scoreColor(gm)}">Geom ${gm}%</span>
                <span class="score-badge" style="color:${this.scoreColor(sm)}">Sem ${sm}%</span>
                <span class="global-badge" style="color:${this.scoreColor(gl)};border-color:${this.scoreColor(gl)}60">⊕ ${gl}%</span>
            `;
        }

        row.innerHTML = `
            <div class="viewport-card">
                <div class="card-header">
                    <span style="font-weight:700;color:#059669">🏆 Ground Truth</span>
                    <span style="font-size:11px;color:var(--text-muted)">${g.difficultyLabel} · ${(g.shapes||[]).length} parts</span>
                </div>
                ${this.toolbarHTML(vpGId)}
                <div class="viewport" id="${vpGId}"></div>
                <div class="prompt-container">
                    <button class="prompt-toggle" onclick="window._togglePrompt('prompt-${idx}')">[+] View Prompt</button>
                    <div class="prompt-content" id="prompt-${idx}">${g.prompt?.replace(/</g,'&lt;') || 'No prompt.'}</div>
                </div>
            </div>
            <div class="viewport-card">
                <div class="card-header">
                    <span><span class="provider-dot dot-${prov}"></span> ${this.prettyModel(this.currentModelId)} ${scoreTags}</span>
                    <span style="font-size:11px;color:var(--text-muted)">${(ai?.shapes||[]).length} parts</span>
                </div>
                ${this.toolbarHTML(vpAId)}
                <div class="viewport" id="${vpAId}"></div>
            </div>
        `;
        return row;
    },

    toolbarHTML(id) {
        return `
            <div class="vp-toolbar">
                <button class="vp-btn" id="xray-${id}">🔍 X-Ray</button>
                <button class="vp-btn" id="wire-${id}">📐 Wire</button>
                <button class="vp-btn" id="cut-${id}">✂ Cut</button>
                <button class="vp-btn" id="focus-${id}">🎯 Reset</button>
                <div style="margin-left:auto; display:flex; align-items:center; gap:8px;">
                    <label style="font-size:10px;color:var(--text-muted)">ZOOM</label>
                    <input type="range" id="zoom-${id}" min="0.2" max="20" step="0.1" value="1" style="width:60px">
                </div>
            </div>
        `;
    },

    createViewport(el, shapes, isAI, vpId) {
        if (!el) return;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(isAI ? 0xfdfdfe : 0xf8fafc);
        scene.fog = new THREE.FogExp2(scene.background.getHex(), 0.0004);
        
        this.addLighting(scene);
        const grid = new THREE.GridHelper(1000, 20, 0xcbd5e1, 0xe2e8f0);
        grid.rotation.x = Math.PI/2;
        scene.add(grid);

        const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 10000);
        const controls = new OrbitControls(camera, el);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;

        const meshObjects = [];
        const com = new THREE.Vector3();
        let count = 0;

        shapes.forEach(s => {
            try {
                const mat = this.makeMat(s.type);
                const obj = this.buildMesh(s, mat);
                if (obj) {
                    obj.userData.shapeType = s.type;
                    scene.add(obj);
                    meshObjects.push(obj);
                    const center = this.parseCenter(s.center || (s.start ? s.start : [0,0,0]));
                    com.add(new THREE.Vector3(...center));
                    count++;
                }
            } catch(e) { console.warn('Mesh error:', e); }
        });

        if (count > 0) {
            com.divideScalar(count);
            controls.target.copy(com);
            camera.position.set(com.x + 300, com.y + 300, com.z + 300);
        } else {
            camera.position.set(200, 200, 200);
        }
        controls.update();

        const state = { xray: false, wire: false, cut: false, clipPlane: new THREE.Plane(new THREE.Vector3(0, -1, 0), com.y) };

        this.setupViewportControls(vpId, meshObjects, camera, controls, com, state);

        this.scenes.push({ scene, camera, controls, element: el });
    },

    setupViewportControls(id, objects, cam, ctrl, com, state) {
        const apply = () => {
            objects.forEach(obj => {
                const type = obj.userData.shapeType || 'default';
                obj.traverse(c => {
                    if (!c.isMesh) return;
                    c.material = state.wire ? this.makeWireMat(type) : this.makeMat(type, state.xray ? 0.22 : 1.0);
                    c.material.clippingPlanes = state.cut ? [state.clipPlane] : [];
                    c.material.clipShadows = state.cut;
                });
            });
        };

        const bind = (btnId, key) => {
            const btn = document.getElementById(`${btnId}-${id}`);
            if (btn) btn.onclick = () => { 
                state[key] = !state[key]; 
                if (key === 'wire') state.xray = false;
                if (key === 'xray') state.wire = false;
                btn.classList.toggle('active', state[key]);
                if (key === 'wire') document.getElementById(`xray-${id}`).classList.remove('active');
                if (key === 'xray') document.getElementById(`wire-${id}`).classList.remove('active');
                apply(); 
            };
        };

        bind('xray', 'xray');
        bind('wire', 'wire');
        bind('cut', 'cut');
        
        const focus = document.getElementById(`focus-${id}`);
        if (focus) focus.onclick = () => {
            cam.position.set(com.x + 300, com.y + 300, com.z + 300);
            ctrl.target.copy(com);
            ctrl.update();
        };

        const zoom = document.getElementById(`zoom-${id}`);
        if (zoom) zoom.oninput = () => { cam.fov = 50 / parseFloat(zoom.value); cam.updateProjectionMatrix(); };
    },

    addLighting(scene) {
        scene.add(new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.8));
        const key = new THREE.DirectionalLight(0xffffff, 2.0);
        key.position.set(120, 80, 200);
        key.castShadow = true;
        scene.add(key);
        scene.add(new THREE.AmbientLight(0xffffff, 0.18));
    },

    makeMat(type, opacity=1.0) {
        const p = this.PALETTE[type] || this.PALETTE.default;
        return new THREE.MeshStandardMaterial({ color: p.color, emissive: p.emissive, emissiveIntensity: 0.1, transparent: opacity < 1, opacity, side: THREE.DoubleSide });
    },

    makeWireMat(type) {
        const p = this.PALETTE[type] || this.PALETTE.default;
        return new THREE.MeshBasicMaterial({ color: p.color, wireframe: true, transparent: true, opacity: 0.7 });
    },

    buildMesh(shape, mat) {
        const c = this.parseCenter(shape.center);
        const t = (shape.type||'').toLowerCase();

        if (t === 'box') {
            let sz = shape.size || shape.dimensions || shape.dim || [10,10,10];
            if (typeof sz === 'object' && !Array.isArray(sz)) sz = [Number(sz.x||sz.width||10), Number(sz.y||sz.depth||10), Number(sz.z||sz.height||10)];
            const m = new THREE.Mesh(new THREE.BoxGeometry(...sz.map(Number)), mat);
            m.position.set(...c); m.castShadow=true; m.receiveShadow=true; return m;

        } else if (t === 'sphere') {
            const m = new THREE.Mesh(new THREE.SphereGeometry(shape.radius||1,48,48), mat);
            m.position.set(...c); m.castShadow=true; return m;

        } else if (t === 'cylinder') {
            const r=Number(shape.radius)||1, h=Number(shape.height||shape.length)||2;
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,64), mat);
            m.position.set(...c);
            const axis = new THREE.Vector3(...this.parseAxis(shape.axis)).normalize();
            m.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), axis));
            m.castShadow=true; m.receiveShadow=true; return m;

        } else if (t === 'pipe') {
            const ri=Number(shape.inner_radius)||2, ro=Number(shape.outer_radius)||4, h=Number(shape.height||shape.length)||8;
            const grp = new THREE.Group();
            grp.add(new THREE.Mesh(new THREE.CylinderGeometry(ro,ro,h,64,1,true), mat));
            grp.add(new THREE.Mesh(new THREE.CylinderGeometry(ri,ri,h,64,1,true), mat));
            const r1=new THREE.Mesh(new THREE.RingGeometry(ri,ro,64),mat); r1.rotation.x=Math.PI/2;  r1.position.y= h/2; grp.add(r1);
            const r2=new THREE.Mesh(new THREE.RingGeometry(ri,ro,64),mat); r2.rotation.x=-Math.PI/2; r2.position.y=-h/2; grp.add(r2);
            const axis = new THREE.Vector3(...this.parseAxis(shape.axis)).normalize();
            grp.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), axis));
            grp.position.set(...c); return grp;

        } else if (t === 'cone') {
            const rb=Number(shape.base_radius||shape.radius||shape.start_radius)||2;
            const rt=Number(shape.top_radius||shape.end_radius)||0;
            const h=Number(shape.height||shape.length)||4;
            const m = new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,48), mat);
            m.position.set(...c);
            const axis = new THREE.Vector3(...this.parseAxis(shape.axis)).normalize();
            m.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), axis));
            m.castShadow=true; m.receiveShadow=true; return m;

        } else if (t === 'torus') {
            const R=Number(shape.ring_radius||shape.major_radius)||5;
            const r=Number(shape.tube_radius||shape.minor_radius)||1;
            const m = new THREE.Mesh(new THREE.TorusGeometry(R,r,32,64), mat);
            m.position.set(...c);
            const axis = new THREE.Vector3(...this.parseAxis(shape.axis)).normalize();
            m.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), axis));
            m.castShadow=true; m.receiveShadow=true; return m;

        } else if (t === 'beam') {
            const v1=new THREE.Vector3(...(shape.start||[0,0,0])), v2=new THREE.Vector3(...(shape.end||[10,0,0]));
            const len=Math.max(v1.distanceTo(v2),0.1);
            const m=new THREE.Mesh(new THREE.BoxGeometry(shape.width||2,shape.height||2,len), mat);
            m.position.copy(new THREE.Vector3().addVectors(v1,v2).multiplyScalar(0.5));
            m.lookAt(v2); return m;

        } else {
            const start = shape.start||shape.points?.[0]||c;
            const end   = shape.end||shape.points?.[shape.points?.length-1]||[c[0]+5,c[1],c[2]];
            const v1=new THREE.Vector3(...start), v2=new THREE.Vector3(...end);
            const len=Math.max(v1.distanceTo(v2),0.1);
            const m=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,len,8), mat);
            m.position.copy(new THREE.Vector3().addVectors(v1,v2).multiplyScalar(0.5));
            const axis=new THREE.Vector3().subVectors(v2,v1).normalize();
            m.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis));
            return m;
        }
    },

    parseCenter(c) {
        if (Array.isArray(c)) return c.map(Number);
        if (typeof c === 'object' && 'x' in c) return [Number(c.x), Number(c.y), Number(c.z)];
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

    getProvider(m) {
        if (m.startsWith('gemini')) return 'gemini';
        if (m.startsWith('claude')) return 'claude';
        if (m.startsWith('deepseek')) return 'deepseek';
        if (m.startsWith('gpt') || m.startsWith('openai') || m.startsWith('o1') || m.startsWith('o3')) return 'openai';
        if (m.startsWith('mistral') || m.startsWith('codestral')) return 'mistral';
        if (m.startsWith('kimi') || m.startsWith('moonshot')) return 'kimi';
        return 'custom';
    },

    prettyModel(m) {
        const names = {
            'gemini-2.5-flash':              'Gemini 2.5 Flash',
            'gemini-2.5-pro':                'Gemini 2.5 Pro',
            'gemini-3.1-flash-lite-preview': 'Gemini 3.1 Flash-Lite',
            'gemini-3-flash-preview':        'Gemini 3 Flash',
            'gemini-3.1-pro-preview':        'Gemini 3.1 Pro',
            'claude-opus-4-6':               'Claude Opus 4.6',
            'claude-sonnet-4-6':             'Claude Sonnet 4.6',
            'deepseek-chat':                 'DeepSeek V3.2',
            'deepseek-reasoner':             'DeepSeek R1',
            'gpt-4.1':                       'GPT-4.1',
            'gpt-5.4':                       'GPT-5.4',
            'gpt-5.4-mini':                  'GPT-5.4 Mini',
            'kimi-k2.5':                     'Kimi K2.5',
        };
        return names[m] || m;
    },

    scoreColor(v) { return v > 80 ? '#10b981' : v > 40 ? '#f59e0b' : '#f43f5e'; },

    updateOverallBadge(data) {
        const el = document.getElementById('overallScore');
        if (!data.length) { el.style.display = 'none'; return; }
        const avg = Math.round(data.reduce((s, d) => s + (d.score_global || 0), 0) / data.length);
        el.textContent = `Global Average: ${avg}%`;
        el.style.display = 'block';
    }
};

// Expose globals for onclick handlers
window._switchLvl = (blockId, i, total) => {
    const block = document.querySelector(`#${blockId}-row-0`).closest('.family-block');
    block.querySelectorAll('.lvl-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.li) === i));
    for (let l = 0; l < total; l++) document.getElementById(`${blockId}-row-${l}`).style.display = l === i ? 'grid' : 'none';
    if (block._loaded.has(i)) return;
    block._loaded.add(i);
    const { g, ai, idx } = block._entries[i];
    Visualizer.createViewport(document.getElementById(`vp-g-${idx}`), g.shapes || [], false, `vp-g-${idx}`);
    Visualizer.createViewport(document.getElementById(`vp-a-${idx}`), ai?.shapes || [], true, `vp-a-${idx}`);
};

window._togglePrompt = (id) => {
    const el = document.getElementById(id);
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
};

// Handle potential race condition: check if data ready before attaching listener
console.log('Visualizer: Script loaded. Checking for existing data...');
if (window.CG3D_P1) {
    console.log('Visualizer: Data found immediately.');
    Visualizer.init();
} else {
    console.log('Visualizer: Waiting for CG3D_DATA_READY event...');
    window.addEventListener('CG3D_DATA_READY', () => {
        console.log('Visualizer: CG3D_DATA_READY event received.');
        Visualizer.init();
    });
}

// Trigger data loading if not already triggered (failsafe)
if (typeof window._loadData === 'function' && !window._dataLoadingTriggered) {
    console.log('Visualizer: Manually triggering data load...');
    window._dataLoadingTriggered = true;
    window._loadData();
}
