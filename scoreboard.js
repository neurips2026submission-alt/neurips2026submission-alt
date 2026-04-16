/**
 * Scoreboard Logic for C2CAD-Bench
 */

const Scoreboard = {
    modelIds: [],
    visibleModels: new Set(),
    activePhase: 0,
    maxDefaultModels: 10,

    init() {
        if (!window.SHOWCASE_DB) {
            console.error('Scoreboard: Database not found');
            return;
        }

        const { golden, models } = window.SHOWCASE_DB;
        
        // Sort and identify models
        this.modelIds = Object.keys(models).sort((a, b) => this.calculateAvgGlobal(b) - this.calculateAvgGlobal(a));
        
        // Initial visibility
        this.visibleModels.clear();
        this.modelIds.slice(0, 8).forEach(m => this.visibleModels.add(m));

        this.updateTabCounts();
        this.renderToggleChips();
        this.renderSummaryCards();
        this.renderTableHead();
        this.renderTableBody();
        this.applyColumnVisibility();
        this.setupEventListeners();
    },

    updateTabCounts() {
        const golden = window.SHOWCASE_DB.golden;
        if (!golden) return;
        const counts = { 0: golden.length, 1: 0, 2: 0, 3: 0, 4: 0 };
        golden.forEach(g => { if(g.phase) counts[g.phase]++; });

        document.querySelectorAll('.phase-tab').forEach(tab => {
            const p = tab.dataset.phase;
            if (counts[p] !== undefined) {
                const badge = tab.querySelector('.badge');
                if (badge) badge.innerText = counts[p];
            }
        });
    },

    calculateAvgGlobal(modelId) {
        const entries = (window.SHOWCASE_DB.models[modelId] || []).filter(e => e);
        if (!entries.length) return 0;
        return entries.reduce((s, e) => s + (e.score_global || 0), 0) / entries.length;
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

    getPrettyName(m) {
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

    getScoreClass(v) { return v > 80 ? 'good' : (v > 40 ? 'warn' : 'bad'); },
    getGlobalClass(v) { return v > 80 ? 'global-good' : (v > 40 ? 'global-warn' : 'global-bad'); },

    renderToggleChips() {
        const bar = document.getElementById('model-toggle-bar');
        const toggleAll = document.getElementById('toggle-all-btn');
        if (!bar) return;
        bar.innerHTML = '<span class="label">Models:</span>';

        this.modelIds.forEach(m => {
            const chip = document.createElement('span');
            chip.className = `model-chip ${this.visibleModels.has(m) ? 'is-active' : ''}`;
            chip.dataset.model = m;
            const prov = this.getProvider(m);
            chip.innerHTML = `<span class="provider-dot dot-${prov}"></span>${this.getPrettyName(m)}`;
            chip.onclick = () => this.toggleModel(m, chip);
            bar.appendChild(chip);
        });
        
        if (toggleAll) bar.appendChild(toggleAll);
    },

    toggleModel(m, chip) {
        if (this.visibleModels.has(m)) {
            this.visibleModels.delete(m);
            chip.classList.remove('is-active');
        } else {
            this.visibleModels.add(m);
            chip.classList.add('is-active');
        }
        this.applyColumnVisibility();
    },

    renderSummaryCards() {
        const row = document.getElementById('summary-row');
        row.innerHTML = '';
        
        this.modelIds.forEach(m => {
            const prov = this.getProvider(m);
            const data = window.SHOWCASE_DB.models[m] || [];
            
            let phaseHTML = '';
            [1, 2, 3, 4].forEach(p => {
                const pd = data.filter(d => d && d.phase === p);
                if (!pd.length) return;
                const avg = Math.round(pd.reduce((s, d) => s + (d.score_global || 0), 0) / pd.length);
                phaseHTML += `<div style="margin-bottom:6px; font-size:11px;">
                    <span style="color:var(--dark-text-muted);font-weight:600;width:25px;display:inline-block;">P${p}</span>
                    <span class="score-pill ${this.getScoreClass(avg)}">${avg}%</span>
                </div>`;
            });

            const all = data.filter(d => d);
            const overall = all.length ? Math.round(all.reduce((s,d) => s+(d.score_global||0),0)/all.length) : 0;

            const card = document.createElement('div');
            card.className = 'summary-card';
            card.dataset.model = m;
            card.style.display = this.visibleModels.has(m) ? '' : 'none';
            card.innerHTML = `
                <div class="model-name"><span class="provider-dot dot-${prov}"></span>${this.getPrettyName(m)}</div>
                <div class="agg-scores">${phaseHTML}</div>
                <div style="margin-top:12px;"><span class="global-pill ${this.getGlobalClass(overall)}">⊕ ${overall}% Overall</span></div>
            `;
            row.appendChild(card);
        });
    },

    renderTableHead() {
        const thead = document.getElementById('table-head');
        let html = `<tr><th style="min-width:250px">Benchmark Structure</th>`;
        this.modelIds.forEach((m, i) => {
            const prov = this.getProvider(m);
            html += `<th class="col-m-${i}" style="${this.visibleModels.has(m) ? '' : 'display:none'}">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="provider-dot dot-${prov}"></span>
                    <span>${this.getPrettyName(m)}</span>
                </div>
            </th>`;
        });
        html += `</tr>`;
        thead.innerHTML = html;
    },

    renderTableBody() {
        const tbody = document.getElementById('table-body');
        const golden = window.SHOWCASE_DB.golden;
        const models = window.SHOWCASE_DB.models;

        // Group by family
        const families = [];
        let currentFamily = null;
        golden.forEach((test, idx) => {
            if (!currentFamily || currentFamily.name !== test.family) {
                currentFamily = { name: test.family, phase: test.phase, entries: [] };
                families.push(currentFamily);
            }
            currentFamily.entries.push({ test, idx });
        });

        let html = '';
        families.forEach((fam, fIdx) => {
            const fid = `fam-${fIdx}`;
            
            // Family Row
            html += `<tr class="family-row" data-phase="${fam.phase}" data-fid="${fid}" onclick="Scoreboard.toggleFamily('${fid}')">
                <td>
                    <span class="expand-arrow">▶</span>
                    <span class="family-name">${fam.name}</span>
                    <span style="font-size:10px;color:var(--dark-text-muted);margin-left:8px;">${fam.entries.length} levels</span>
                </td>`;

            this.modelIds.forEach((m, mIdx) => {
                let sum = 0, count = 0;
                fam.entries.forEach(({idx}) => {
                    // Robust finding
                    const res = models[m] ? models[m].find(r => r && r.family === fam.name && r.difficultyID === golden[idx].difficultyID) : null;
                    if (res) {
                        sum += (res.score_global || 0);
                        count++;
                    }
                });
                const avg = count > 0 ? Math.round(sum / count) : 0;
                html += `<td class="col-m-${mIdx}" style="text-align:center; ${this.visibleModels.has(m) ? '' : 'display:none'}">
                    ${count > 0 ? `<span class="score-pill ${this.getScoreClass(avg)}">⊕ ${avg}%</span>` : '—'}
                </td>`;
            });
            html += `</tr>`;

            // Detail Rows
            fam.entries.forEach(({test, idx}) => {
                html += `<tr class="detail-row" data-phase="${fam.phase}" data-fid="${fid}">
                    <td style="padding-left:40px; font-size:12px; color:var(--dark-text-muted)">${test.difficultyLabel}</td>`;
                this.modelIds.forEach((m, mIdx) => {
                    const res = models[m] ? models[m].find(r => r && r.family === test.family && r.difficultyID === test.difficultyID) : null;
                    html += `<td class="col-m-${mIdx}" style="${this.visibleModels.has(m) ? '' : 'display:none'}">
                        ${res ? this.getDetailHTML(res) : '—'}
                    </td>`;
                });
                html += `</tr>`;
            });
        });

        tbody.innerHTML = html;
        this.applyPhaseFilter();
    },

    getDetailHTML(res) {
        const c = res.score_cov || 0, g = res.score_geom || 0, s = res.score_sem || 0, gl = res.score_global || 0;
        return `<div style="display:flex; flex-direction:column; gap:4px; font-size:11px;">
            <div style="display:flex;justify-content:space-between"><span>Cov</span><span class="${this.getScoreClass(c)}">${c}%</span></div>
            <div style="display:flex;justify-content:space-between"><span>Geom</span><span class="${this.getScoreClass(g)}">${g}%</span></div>
            <div style="display:flex;justify-content:space-between"><span>Sem</span><span class="${this.getScoreClass(s)}">${s}%</span></div>
            <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:2px;font-weight:700;display:flex;justify-content:space-between"><span>⊕</span><span class="${this.getScoreClass(gl)}">${gl}%</span></div>
        </div>`;
    },

    toggleFamily(fid) {
        const row = document.querySelector(`.family-row[data-fid="${fid}"]`);
        row.classList.toggle('expanded');
        document.querySelectorAll(`.detail-row[data-fid="${fid}"]`).forEach(r => {
            const p = parseInt(r.dataset.phase);
            const phaseOk = this.activePhase === 0 || p === this.activePhase;
            r.classList.toggle('visible', row.classList.contains('expanded') && phaseOk);
        });
    },

    applyColumnVisibility() {
        this.modelIds.forEach((m, i) => {
            const show = this.visibleModels.has(m);
            document.querySelectorAll(`.col-m-${i}`).forEach(el => el.style.display = show ? '' : 'none');
            const card = document.querySelector(`.summary-card[data-model="${m}"]`);
            if (card) card.style.display = show ? '' : 'none';
        });
    },

    setupEventListeners() {
        document.querySelectorAll('.phase-tab').forEach(tab => {
            tab.onclick = () => {
                this.activePhase = parseInt(tab.dataset.phase);
                document.querySelectorAll('.phase-tab').forEach(t => t.classList.toggle('is-active', t === tab));
                this.applyPhaseFilter();
            };
        });

        const toggleBtn = document.getElementById('toggle-all-btn');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                const allVisible = this.visibleModels.size === this.modelIds.length;
                if (allVisible) {
                    this.visibleModels.clear();
                    this.modelIds.slice(0, this.maxDefaultModels).forEach(m => this.visibleModels.add(m));
                } else {
                    this.modelIds.forEach(m => this.visibleModels.add(m));
                }
                this.renderToggleChips();
                this.applyColumnVisibility();
            };
        }
    },

    // Public alias for HTML interaction
    filterByPhase(p) {
        this.activePhase = parseInt(p);
        this.applyPhaseFilter();
    },

    applyPhaseFilter() {
        const p = this.activePhase;
        document.querySelectorAll('.family-row').forEach(row => {
            const rp = parseInt(row.dataset.phase);
            row.style.display = (p === 0 || rp === p) ? '' : 'none';
            if (row.classList.contains('expanded')) {
                const fid = row.dataset.fid;
                document.querySelectorAll(`.detail-row[data-fid="${fid}"]`).forEach(dr => {
                    dr.classList.toggle('visible', p === 0 || rp === p);
                });
            }
        });
    }
};

window.addEventListener('CG3D_SCORE_READY', () => Scoreboard.init());
