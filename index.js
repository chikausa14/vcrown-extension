/* V-CROWN Panels v0.1.0
 * In-chat "Program Record" (Mission + Ranking) and an X-style "Fan Community" feed
 * for idol-survival cards such as PROJECT:V. Everything is generated on demand with
 * the model you already have connected, and stored in the chat's metadata.
 */
(() => {
    'use strict';

    const MODULE = 'vcrown_panels';
    const TITLE = 'V-CROWN Panels';

    const DEFAULTS = { fab: true, batch: 8, feedAccent: 'x' };

    const PHASES = [
        { title: 'Phase 1 · Initial Evaluations', note: 'Ep 1–2 · 100 trainees perform solo and are seated on the pyramid.' },
        { title: 'Phase 2 · Group Battles', note: 'Ep 3–6 · V-CROWN voting opens: public 40%, judges 60%.' },
        { title: 'Phase 3 · Position Tracks', note: 'Ep 7–9 · 60 trainees pick Vocal, Dance, Rap or Produce.' },
        { title: 'Phase 4 · Concept Evaluation', note: 'Ep 10–11 · 30 trainees, wildly different concepts.' },
        { title: 'Phase 5 · Final Stage', note: 'Ep 12–14 · Top 10 live. Public 50%, judges 30%, peers 20%.' },
    ];

    const TIMES = ['now', '1m', '3m', '6m', '9m', '14m', '22m', '31m', '47m', '1h', '2h', '3h'];

    // ------------------------------------------------------------------ pure helpers

    const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

    const toInt = (v, d) => {
        const n = Math.round(Number(String(v).replace(/[, ]/g, '')));
        return Number.isFinite(n) && n >= 0 ? n : d;
    };

    function fmt(n) {
        n = Number(n) || 0;
        if (n < 10000) return n.toLocaleString('en-US');
        if (n < 1000000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
        return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
    }

    function extractJson(text) {
        if (typeof text !== 'string') return null;
        let s = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
        const start = s.search(/[[{]/);
        if (start < 0) return null;
        const open = s[start];
        const close = open === '{' ? '}' : ']';
        let depth = 0, inStr = false, esc = false, end = -1;
        for (let i = start; i < s.length; i++) {
            const ch = s[i];
            if (inStr) {
                if (esc) esc = false;
                else if (ch === '\\') esc = true;
                else if (ch === '"') inStr = false;
                continue;
            }
            if (ch === '"') inStr = true;
            else if (ch === open) depth++;
            else if (ch === close) {
                depth--;
                if (depth === 0) { end = i; break; }
            }
        }
        if (end < 0) return null;
        let body = s.slice(start, end + 1);
        try { return JSON.parse(body); } catch (e) { /* try a light repair */ }
        body = body.replace(/,\s*([}\]])/g, '$1');
        try { return JSON.parse(body); } catch (e) { return null; }
    }

    function splitRich(text) {
        return String(text || '')
            .split(/(#[\wÀ-ɏ가-힣]+|@\w+)/u)
            .filter(Boolean)
            .map((p) => ({ t: p, link: /^[#@]/.test(p) }));
    }

    function cleanHandle(h, fallback) {
        const x = str(h, 30).replace(/^@+/, '').replace(/\s/g, '');
        return '@' + (x || fallback);
    }

    function normalizePosts(raw) {
        const arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.posts) ? raw.posts : []);
        const stamp = Date.now();
        return arr
            .filter((p) => p && typeof p === 'object' && str(p.text, 400))
            .map((p, i) => {
                const post = {
                    id: 'p' + stamp + '_' + i,
                    name: str(p.name, 40) || 'anon',
                    handle: cleanHandle(p.handle, 'user' + (1000 + i)),
                    time: TIMES[Math.min(i, TIMES.length - 1)],
                    text: str(p.text, 320),
                    verified: !!p.verified,
                    kind: str(p.kind, 16).toLowerCase(),
                    replies: toInt(p.replies, 40 + i * 37),
                    reposts: toInt(p.reposts, 120 + i * 91),
                    likes: toInt(p.likes, 900 + i * 410),
                    views: toInt(p.views, 12000 + i * 5300),
                    quote: null,
                    video: null,
                    poll: null,
                };
                if (p.quote && typeof p.quote === 'object' && str(p.quote.text, 240)) {
                    post.quote = {
                        name: str(p.quote.name, 40) || 'anon',
                        handle: cleanHandle(p.quote.handle, 'user'),
                        text: str(p.quote.text, 240),
                    };
                }
                if (p.video && typeof p.video === 'object') {
                    const dur = str(p.video.dur, 8);
                    post.video = {
                        label: str(p.video.label, 48).toUpperCase() || 'FANCAM',
                        dur: /^\d{1,2}:\d{2}$/.test(dur) ? dur : '0:30',
                    };
                }
                if (p.poll && Array.isArray(p.poll.options)) {
                    const options = p.poll.options
                        .slice(0, 4)
                        .map((o) => ({ label: str(o && o.label, 32), pct: Math.min(100, toInt(o && o.pct, 0)) }))
                        .filter((o) => o.label);
                    if (options.length >= 2) post.poll = { options, meta: str(p.poll.meta, 60) };
                }
                return post;
            });
    }

    function normalizeTrends(raw) {
        const arr = Array.isArray(raw) ? raw : [];
        return arr
            .filter((t) => t && str(t.topic, 60))
            .slice(0, 8)
            .map((t, i) => ({
                kicker: str(t.kicker, 40) || (i + 1) + ' · Trending',
                topic: str(t.topic, 60),
                count: str(t.count, 20),
            }));
    }

    function normalizeRecord(raw) {
        const r = raw && typeof raw === 'object' ? raw : {};
        const m = r.mission && typeof r.mission === 'object' ? r.mission : null;
        const phaseNum = m ? parseInt(String(m.phase).match(/\d+/) || '1', 10) : 1;
        const mission = m
            ? {
                phase: Math.min(Math.max(phaseNum || 1, 1), PHASES.length),
                number: str(m.number, 8),
                title: str(m.title, 80),
                format: str(m.format, 40),
                result: str(m.result, 40),
                elimination: str(m.elimination, 40),
                goal: str(m.goal, 200),
                detail: str(m.detail, 360),
            }
            : null;
        const progress = (Array.isArray(r.progress) ? r.progress : [])
            .filter((g) => g && str(g.text, 240))
            .slice(0, 12)
            .map((g) => ({ tag: str(g.tag, 10), text: str(g.text, 240) }));
        const ranking = (Array.isArray(r.ranking) ? r.ranking : [])
            .filter((t) => t && str(t.name, 60))
            .slice(0, 40)
            .map((t) => {
                const rank = t.rank == null || t.rank === '' ? null : toInt(t.rank, null);
                const delta = str(t.delta, 8).toLowerCase();
                return {
                    rank: rank && rank >= 1 ? rank : null,
                    name: str(t.name, 60),
                    age: toInt(t.age, 0),
                    role: str(t.role, 24),
                    agency: str(t.agency, 24),
                    delta: ['same', 'up', 'down', 'new', 'out'].includes(delta) ? delta : 'same',
                };
            })
            .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
        const y = r.you && typeof r.you === 'object' ? r.you : {};
        const yr = y.rank == null || y.rank === '' ? null : toInt(y.rank, null);
        return { mission, progress, ranking, you: { rank: yr && yr >= 1 ? yr : null, note: str(y.note, 120) } };
    }

    // ------------------------------------------------------------------ prompts

    function recordPrompt() {
        return (
            '[OOC: Do not continue the roleplay. Act as the PROJECT:V production log. Using the story so far, ' +
            'return ONLY one JSON object, with no prose and no code fences, shaped like this:\n' +
            '{"mission":{"phase":1,"number":"01","title":"","format":"","result":"","elimination":"","goal":"","detail":""},' +
            '"progress":[{"tag":"short time or episode tag","text":"one-sentence event"}],' +
            '"ranking":[{"rank":1,"name":"","age":0,"role":"","agency":"","delta":"same|up|down|new|out"}],' +
            '"you":{"rank":null,"note":""}}\n' +
            'Rules: include only events and ranks that have actually happened in the story. Use null for any rank not yet decided. ' +
            'List up to 20 trainees, best rank first, and mark eliminated trainees with delta "out". "progress" has at most 8 entries, oldest first. ' +
            '"you" is {{user}}.]'
        );
    }

    function feedPrompt(n, previous) {
        const avoid = previous.slice(0, 10).map((t) => '- ' + t.slice(0, 70)).join('\n');
        return (
            '[OOC: Do not continue the roleplay. Write ' + n + ' fictional social media posts reacting to what has recently happened on the show ' +
            'in the story so far, plus 6 trending topics. Return ONLY one JSON object, with no prose and no code fences:\n' +
            '{"posts":[{"name":"display name","handle":"@handle","text":"post text, max 240 chars, may include #hashtags and emoji",' +
            '"kind":"fan|fancam|meme|hate|rumor|translation|shipping|ranking|news|official","verified":false,' +
            '"replies":0,"reposts":0,"likes":0,"views":0,"quote":null,"video":null,"poll":null}],' +
            '"trends":[{"kicker":"1 · Entertainment · Trending","topic":"","count":"12.3K posts"}]}\n' +
            'Optional fields: "quote":{"name":"","handle":"","text":""}, "video":{"label":"FANCAM · NAME","dur":"0:45"}, ' +
            '"poll":{"options":[{"label":"","pct":50}],"meta":"4,213 votes · 21 hours left"}. ' +
            'Mix the kinds. Show the gap between what the audience sees and what really happened. Use verified true only for official or news accounts. ' +
            'Make the posts sound like real fans online, with different voices. Do not repeat these earlier posts:\n' + avoid + ']'
        );
    }

    // ------------------------------------------------------------------ state

    let state = null;
    let tab = 'mission'; // mission | ranking | fans
    let fanTab = 'foryou'; // foryou | trending
    let rankFilter = 'all';
    let busy = false;
    let busyMsg = '';
    let hint = '';
    let nodes = {};

    const ctx = () => SillyTavern.getContext();

    function settings() {
        const c = ctx();
        if (!c.extensionSettings[MODULE]) c.extensionSettings[MODULE] = {};
        const s = c.extensionSettings[MODULE];
        for (const k of Object.keys(DEFAULTS)) if (s[k] === undefined) s[k] = DEFAULTS[k];
        return s;
    }

    function saveSettings() {
        const c = ctx();
        if (c.saveSettingsDebounced) c.saveSettingsDebounced();
    }

    function loadState() {
        const md = ctx().chatMetadata;
        if (!md) return { mission: null, progress: [], ranking: [], you: { rank: null, note: '' }, posts: [], trends: [], liked: {}, reposted: {}, recordAt: 0, feedAt: 0 };
        if (!md[MODULE]) md[MODULE] = {};
        const s = md[MODULE];
        const d = { mission: null, progress: [], ranking: [], you: { rank: null, note: '' }, posts: [], trends: [], liked: {}, reposted: {}, recordAt: 0, feedAt: 0 };
        for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
        return s;
    }

    async function save() {
        const c = ctx();
        const fn = c.saveMetadata || c.saveMetadataDebounced;
        if (fn) await fn.call(c);
    }

    function notify(msg, kind) {
        if (window.toastr && window.toastr[kind || 'error']) window.toastr[kind || 'error'](msg, TITLE);
        else console.warn('[' + TITLE + ']', msg);
    }

    async function quiet(prompt) {
        const c = ctx();
        const fn = c.generateQuietPrompt;
        if (typeof fn !== 'function') throw new Error('This SillyTavern version has no generateQuietPrompt.');
        // Newer SillyTavern takes one options object (length 0 or 1); older builds take positional arguments (length 2+).
        const out = fn.length < 2 ? await fn({ quietPrompt: prompt }) : await fn(prompt, false, false);
        return typeof out === 'string' ? out : '';
    }

    function timeAgo(ts) {
        if (!ts) return '';
        const m = Math.round((Date.now() - ts) / 60000);
        if (m < 1) return 'just now';
        if (m < 60) return m + ' min ago';
        const h = Math.round(m / 60);
        return h < 24 ? h + ' h ago' : Math.round(h / 24) + ' d ago';
    }

    // ------------------------------------------------------------------ DOM helpers

    function el(tag, props, ...kids) {
        const n = document.createElement(tag);
        if (props) {
            for (const [k, v] of Object.entries(props)) {
                if (v == null || v === false) continue;
                if (k === 'class') n.className = v;
                else if (k === 'text') n.textContent = v;
                else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
                else n.setAttribute(k, v === true ? '' : v);
            }
        }
        for (const kid of kids.flat()) {
            if (kid == null || kid === false) continue;
            n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
        }
        return n;
    }

    const SVG = {
        close: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        crown: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"/></svg>',
        reply: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
        repost: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
        like: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9-9.3C2 8 4 5 7 5c2 0 3.7 1.2 5 3 1.3-1.8 3-3 5-3 3 0 5 3 4 6.2-1.5 4.7-9 9.3-9 9.3z"/></svg>',
        views: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 21V12M12 21V4M19 21v-6"/></svg>',
        bookmark: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21V3z"/></svg>',
        share: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
        more: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
        search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
        play: '<svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M8 5l12 7-12 7V5z"/></svg>',
        up: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 5l8 12H4z"/></svg>',
        down: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 19L4 7h16z"/></svg>',
        badge: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 1.7 2.9-.2 1 2.7 2.4 1.7-.8 2.8.8 2.8-2.4 1.7-1 2.7-2.9-.2L12 22l-2.4-1.7-2.9.2-1-2.7-2.4-1.7.8-2.8-.8-2.8 2.4-1.7 1-2.7 2.9.2L12 2z" fill="currentColor"/><path d="M8 12.2l2.7 2.7L16 9.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    };

    function icon(name, cls) {
        const s = el('span', { class: 'vcp-ico' + (cls ? ' ' + cls : '') });
        s.innerHTML = SVG[name];
        return s;
    }

    const PALETTE = ['#6b4a8a', '#2f6b57', '#8a3f52', '#3a4a6b', '#b0587a', '#6b6b2f', '#3a6b6b', '#8a6d1f', '#a8453a', '#5a3a8a'];
    function colorFor(name) {
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
        return PALETTE[h % PALETTE.length];
    }
    function initials(name) {
        const parts = String(name).replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/);
        return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
    }

    function richText(text) {
        return splitRich(text).map((s) => (s.link ? el('span', { class: 'vcp-link', text: s.t }) : document.createTextNode(s.t)));
    }

    // ------------------------------------------------------------------ renderers

    function renderMission() {
        const m = state.mission;
        if (!m) {
            return el('div', { class: 'vcp-empty' },
                el('div', { class: 'vcp-empty-title', text: 'No record yet' }),
                'Tap "Update record" and the story so far will be turned into the mission card, progress log and ranking.');
        }
        const kids = [];
        kids.push(el('div', { class: 'vcp-kicker', text: ('PHASE ' + m.phase + (m.number ? ' · MISSION ' + m.number : '')) }));
        kids.push(el('div', { class: 'vcp-mission-title', text: m.title || 'Untitled mission' }));
        const facts = el('div', { class: 'vcp-facts' });
        [['Format', m.format], ['Result', m.result], ['Elimination', m.elimination]].forEach(([k, v]) => {
            if (v) facts.append(el('div', { class: 'vcp-fact' }, el('div', { class: 'vcp-fact-k', text: k }), el('div', { class: 'vcp-fact-v', text: v })));
        });
        if (facts.children.length) kids.push(facts);
        if (m.goal || m.detail) {
            kids.push(el('div', { class: 'vcp-goal' },
                m.goal && el('div', { class: 'vcp-goal-main', text: m.goal }),
                m.goal && m.detail && el('div', { class: 'vcp-goal-rule' }),
                m.detail && el('div', { class: 'vcp-goal-detail', text: m.detail })));
        }
        kids.push(el('div', { class: 'vcp-kicker vcp-section', text: 'SHOW PHASES' }));
        const steps = el('div', { class: 'vcp-steps' });
        PHASES.forEach((p, i) => {
            const cur = i + 1 === m.phase;
            steps.append(el('div', { class: 'vcp-step' + (cur ? ' vcp-step-cur' : '') },
                el('div', { class: 'vcp-step-rail' }, el('div', { class: 'vcp-dot' }), i < PHASES.length - 1 && el('div', { class: 'vcp-line' })),
                el('div', { class: 'vcp-step-body' }, el('div', { class: 'vcp-step-title', text: p.title }), el('div', { class: 'vcp-step-note', text: p.note }))));
        });
        kids.push(steps);
        if (state.progress.length) {
            kids.push(el('div', { class: 'vcp-kicker vcp-section', text: 'PROGRESS' }));
            const log = el('div', { class: 'vcp-log' });
            state.progress.forEach((g) => log.append(el('div', { class: 'vcp-log-row' }, el('div', { class: 'vcp-log-tag', text: g.tag }), el('div', { class: 'vcp-log-text', text: g.text }))));
            kids.push(log);
        }
        return el('div', { class: 'vcp-pad' }, kids);
    }

    function renderRanking() {
        const all = state.ranking;
        const out = all.filter((t) => t.delta === 'out');
        const active = all.filter((t) => t.delta !== 'out');
        const chips = el('div', { class: 'vcp-chips' });
        [['all', 'All ' + all.length], ['active', 'Active ' + active.length], ['out', 'Eliminated ' + out.length]].forEach(([id, label]) => {
            chips.append(el('button', { class: 'vcp-chip' + (rankFilter === id ? ' vcp-chip-on' : ''), type: 'button', text: label, onclick: () => { rankFilter = id; rerender(); } }));
        });
        const list = rankFilter === 'out' ? out : rankFilter === 'active' ? active : all;
        const wrap = el('div', { class: 'vcp-pad' }, el('div', { class: 'vcp-kicker', text: 'OFFICIAL RANKING' }), chips);
        if (!all.length) {
            wrap.append(el('div', { class: 'vcp-empty' }, el('div', { class: 'vcp-empty-title', text: 'No ranking yet' }), 'Tap "Update record" once ranks have been announced in the story.'));
            return wrap;
        }
        if (!list.length) {
            wrap.append(el('div', { class: 'vcp-empty' }, el('div', { class: 'vcp-empty-title', text: 'Nobody here yet' })));
            return wrap;
        }
        const userName = (ctx().name1 || '').toLowerCase();
        const rows = el('div', { class: 'vcp-rows' });
        list.forEach((t) => {
            const isYou = userName && t.name.toLowerCase() === userName;
            const meta = [t.age ? 'Age ' + t.age : '', t.role].filter(Boolean).join(' · ');
            let delta;
            if (t.delta === 'up') delta = icon('up', 'vcp-up');
            else if (t.delta === 'down') delta = icon('down', 'vcp-down');
            else if (t.delta === 'new') delta = el('span', { class: 'vcp-new', text: 'NEW' });
            else if (t.delta === 'out') delta = el('span', { class: 'vcp-outtag', text: 'OUT' });
            else delta = el('span', { class: 'vcp-dash', text: '—' });
            rows.append(el('div', { class: 'vcp-row' + (t.rank === 1 ? ' vcp-row-top' : '') + (isYou ? ' vcp-row-you' : '') + (t.delta === 'out' ? ' vcp-row-out' : '') },
                el('div', { class: 'vcp-rank' }, t.rank === 1 ? icon('crown', 'vcp-crown') : el('span', { text: t.rank == null ? '–' : String(t.rank) })),
                el('div', { class: 'vcp-delta' }, delta),
                el('div', { class: 'vcp-avatar', style: 'background:' + colorFor(t.name), text: initials(t.name) }),
                el('div', { class: 'vcp-who' }, el('div', { class: 'vcp-name', text: t.name + (isYou ? ' (you)' : '') }), meta && el('div', { class: 'vcp-meta', text: meta })),
                t.agency && el('div', { class: 'vcp-agency', text: t.agency })));
        });
        wrap.append(rows);
        return wrap;
    }

    function postCard(p) {
        const liked = !!state.liked[p.id];
        const rted = !!state.reposted[p.id];
        const gold = p.kind === 'official' || p.kind === 'news';
        const head = el('div', { class: 'vcp-post-head' },
            el('span', { class: 'vcp-post-name', text: p.name }),
            p.verified && icon('badge', 'vcp-badge ' + (gold ? 'vcp-badge-gold' : 'vcp-badge-blue')),
            el('span', { class: 'vcp-post-handle', text: p.handle }),
            el('span', { class: 'vcp-post-dot', text: '·' }),
            el('span', { class: 'vcp-post-time', text: p.time }),
            el('span', { class: 'vcp-grow' }),
            icon('more', 'vcp-more'));
        const col = el('div', { class: 'vcp-post-col' }, head, el('div', { class: 'vcp-post-text' }, richText(p.text)));
        if (p.video) {
            col.append(el('div', { class: 'vcp-video' },
                el('div', { class: 'vcp-video-label', text: p.video.label }),
                el('div', { class: 'vcp-video-play' }, icon('play')),
                el('div', { class: 'vcp-video-dur', text: p.video.dur })));
        }
        if (p.quote) {
            col.append(el('div', { class: 'vcp-quote' },
                el('div', { class: 'vcp-quote-head' },
                    el('div', { class: 'vcp-quote-av', style: 'background:' + colorFor(p.quote.name), text: initials(p.quote.name) }),
                    el('span', { class: 'vcp-post-name', text: p.quote.name }),
                    el('span', { class: 'vcp-post-handle', text: p.quote.handle })),
                el('div', { class: 'vcp-quote-text', text: p.quote.text })));
        }
        if (p.poll) {
            const top = Math.max(...p.poll.options.map((o) => o.pct));
            const poll = el('div', { class: 'vcp-poll' });
            p.poll.options.forEach((o) => {
                poll.append(el('div', { class: 'vcp-poll-opt' },
                    el('div', { class: 'vcp-poll-bar' + (o.pct === top ? ' vcp-poll-lead' : ''), style: 'width:' + o.pct + '%' }),
                    el('div', { class: 'vcp-poll-row' + (o.pct === top ? ' vcp-poll-lead-text' : '') }, el('span', { text: o.label }), el('span', { text: o.pct + '%' }))));
            });
            if (p.poll.meta) poll.append(el('div', { class: 'vcp-poll-meta', text: p.poll.meta }));
            col.append(poll);
        }
        const act = (cls, ic, count, label, onclick) =>
            el('button', { class: 'vcp-act ' + cls, type: 'button', 'aria-label': label, onclick }, icon(ic), el('span', { text: count }));
        col.append(el('div', { class: 'vcp-actions' },
            act('', 'reply', fmt(p.replies), 'Reply'),
            act('vcp-act-rt' + (rted ? ' vcp-on' : ''), 'repost', fmt(p.reposts + (rted ? 1 : 0)), 'Repost', async () => { state.reposted[p.id] = !rted; await save(); rerender(true); }),
            act('vcp-act-like' + (liked ? ' vcp-on' : ''), 'like', fmt(p.likes + (liked ? 1 : 0)), 'Like', async () => { state.liked[p.id] = !liked; await save(); rerender(true); }),
            act('', 'views', fmt(p.views), 'Views'),
            el('span', { class: 'vcp-act-end' },
                el('button', { class: 'vcp-act vcp-act-icon', type: 'button', 'aria-label': 'Bookmark' }, icon('bookmark')),
                el('button', { class: 'vcp-act vcp-act-icon', type: 'button', 'aria-label': 'Share' }, icon('share')))));
        return el('div', { class: 'vcp-post' },
            el('div', { class: 'vcp-post-av', style: 'background:' + colorFor(p.name), text: initials(p.name) }), col);
    }

    function renderFans() {
        const subtabs = el('div', { class: 'vcp-subtabs' },
            el('button', { class: 'vcp-subtab' + (fanTab === 'foryou' ? ' vcp-subtab-on' : ''), type: 'button', onclick: () => { fanTab = 'foryou'; rerender(); } }, el('span', { text: 'For you' })),
            el('button', { class: 'vcp-subtab' + (fanTab === 'trending' ? ' vcp-subtab-on' : ''), type: 'button', onclick: () => { fanTab = 'trending'; rerender(); } }, el('span', { text: 'Trending' })));
        const search = el('div', { class: 'vcp-search' }, icon('search'), el('span', { text: '#PROJECTV' }));
        const wrap = el('div', {}, search, subtabs);
        if (fanTab === 'trending') {
            if (!state.trends.length) {
                wrap.append(el('div', { class: 'vcp-empty vcp-empty-feed' }, el('div', { class: 'vcp-empty-title', text: 'Nothing trending yet' }), 'Tap "Load reactions" to see what fans are saying.'));
                return wrap;
            }
            wrap.append(el('div', { class: 'vcp-trend-head', text: 'Trending in South Korea' }));
            state.trends.forEach((t) => wrap.append(el('div', { class: 'vcp-trend' },
                el('div', {}, el('div', { class: 'vcp-trend-k', text: t.kicker }), el('div', { class: 'vcp-trend-t', text: t.topic }), t.count && el('div', { class: 'vcp-trend-k', text: t.count })),
                icon('more', 'vcp-more'))));
            return wrap;
        }
        if (!state.posts.length) {
            wrap.append(el('div', { class: 'vcp-empty vcp-empty-feed' }, el('div', { class: 'vcp-empty-title', text: 'No reactions loaded yet' }), 'Tap "Load reactions" to see what fans are saying.'));
            return wrap;
        }
        state.posts.forEach((p) => wrap.append(postCard(p)));
        return wrap;
    }

    // ------------------------------------------------------------------ shell

    function rerender(keepScroll) {
        if (!nodes.overlay || nodes.overlay.hidden) return;
        const top = nodes.body.scrollTop;
        nodes.sheet.classList.toggle('vcp-feed', tab === 'fans');
        nodes.overlay.classList.toggle('vcp-accent-gold', settings().feedAccent === 'gold');
        nodes.tabs.querySelectorAll('.vcp-tab').forEach((b) => b.classList.toggle('vcp-tab-on', b.dataset.tab === tab));
        nodes.body.replaceChildren(tab === 'mission' ? renderMission() : tab === 'ranking' ? renderRanking() : renderFans());
        nodes.body.scrollTop = keepScroll ? top : 0;
        renderFooter();
    }

    function renderFooter() {
        const fans = tab === 'fans';
        const label = busy ? busyMsg || 'Working…' : fans ? (state.posts.length ? 'Load new reactions' : 'Load reactions') : 'Update record';
        const stamp = fans ? state.feedAt : state.recordAt;
        const bits = [];
        if (!fans && tab === 'ranking') {
            const y = state.you;
            bits.push(el('div', { class: 'vcp-you' },
                el('div', { class: 'vcp-you-badge', text: 'YOU' }),
                el('div', {}, el('div', { class: 'vcp-you-rank', text: y.rank ? 'Your rank: ' + y.rank : 'Your rank: pending' }), y.note && el('div', { class: 'vcp-you-note', text: y.note }))));
        }
        bits.push(el('button', { class: 'vcp-cta' + (fans ? ' vcp-cta-feed' : ''), type: 'button', disabled: busy, onclick: fans ? runFeed : runRecord, text: label }));
        if (hint) bits.push(el('div', { class: 'vcp-hint vcp-hint-err', text: hint }));
        else if (stamp) bits.push(el('div', { class: 'vcp-hint', text: 'Last updated ' + timeAgo(stamp) }));
        nodes.foot.replaceChildren(...bits);
    }

    function openPanel(which) {
        state = loadState();
        if (which) tab = which;
        hint = '';
        nodes.overlay.hidden = false;
        document.body.classList.add('vcp-lock');
        rerender();
        nodes.close.focus();
    }

    function closePanel() {
        if (!nodes.overlay) return;
        nodes.overlay.hidden = true;
        document.body.classList.remove('vcp-lock');
    }

    function buildOverlay() {
        const tabBtn = (id, label) => el('button', { class: 'vcp-tab', type: 'button', 'data-tab': id, onclick: () => { tab = id; hint = ''; rerender(); } }, el('span', { text: label }));
        nodes.close = el('button', { class: 'vcp-close', type: 'button', 'aria-label': 'Close', onclick: closePanel }, icon('close'));
        nodes.tabs = el('nav', { class: 'vcp-tabs' }, tabBtn('mission', 'Mission'), tabBtn('ranking', 'Ranking'), tabBtn('fans', 'Fans'));
        nodes.body = el('div', { class: 'vcp-body' });
        nodes.foot = el('div', { class: 'vcp-foot' });
        nodes.sheet = el('div', { class: 'vcp-sheet', role: 'dialog', 'aria-label': 'Program Record' },
            el('header', { class: 'vcp-head' }, nodes.close, el('div', { class: 'vcp-title', text: 'Program Record' })),
            nodes.tabs, nodes.body, nodes.foot);
        nodes.overlay = el('div', { class: 'vcp-overlay', hidden: true, onclick: (e) => { if (e.target === nodes.overlay) closePanel(); } }, nodes.sheet);
        document.body.append(nodes.overlay);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !nodes.overlay.hidden) closePanel(); });
    }

    function buildFab() {
        nodes.fab = el('button', { class: 'vcp-fab', type: 'button', 'aria-label': 'Open Program Record', onclick: () => openPanel() }, icon('crown'));
        nodes.fab.hidden = !settings().fab;
        document.body.append(nodes.fab);
    }

    function hookMenu() {
        let tries = 0;
        const attempt = () => {
            const menu = document.getElementById('extensionsMenu');
            if (menu) {
                if (document.getElementById('vcp-menu-item')) return;
                const item = el('div', { id: 'vcp-menu-item', class: 'list-group-item flex-container flexGap5', onclick: () => openPanel() },
                    el('div', { class: 'fa-solid fa-crown extensionsMenuExtensionButton' }), el('span', { text: 'V-CROWN Panels' }));
                menu.append(item);
            } else if (tries++ < 20) setTimeout(attempt, 500);
        };
        attempt();
    }

    function buildSettings() {
        let tries = 0;
        const attempt = () => {
            const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
            if (!host) { if (tries++ < 20) setTimeout(attempt, 500); return; }
            if (document.getElementById('vcp-settings')) return;
            const s = settings();
            const fab = el('input', { type: 'checkbox', id: 'vcp-set-fab' });
            fab.checked = !!s.fab;
            fab.addEventListener('change', () => { s.fab = fab.checked; nodes.fab.hidden = !s.fab; saveSettings(); });
            const batch = el('input', { type: 'number', min: '4', max: '12', id: 'vcp-set-batch', class: 'text_pole', value: String(s.batch) });
            batch.addEventListener('change', () => { s.batch = Math.min(12, Math.max(4, toInt(batch.value, 8))); batch.value = String(s.batch); saveSettings(); });
            const accent = el('select', { id: 'vcp-set-accent', class: 'text_pole' }, el('option', { value: 'x', text: 'X blue' }), el('option', { value: 'gold', text: 'Gold' }));
            accent.value = s.feedAccent;
            accent.addEventListener('change', () => { s.feedAccent = accent.value; saveSettings(); rerender(true); });
            const drawer = el('div', { id: 'vcp-settings', class: 'inline-drawer' },
                el('div', { class: 'inline-drawer-toggle inline-drawer-header' }, el('b', { text: TITLE }), el('div', { class: 'inline-drawer-icon fa-solid fa-circle-chevron-down down' })),
                el('div', { class: 'inline-drawer-content' },
                    el('label', { class: 'checkbox_label', for: 'vcp-set-fab' }, fab, el('span', { text: 'Show floating crown button' })),
                    el('label', {}, el('span', { text: 'Posts per load (4–12)' }), batch),
                    el('label', {}, el('span', { text: 'Feed accent colour' }), accent)));
            host.append(drawer);
        };
        attempt();
    }

    // ------------------------------------------------------------------ actions

    function setBusy(on, msg) {
        busy = on;
        busyMsg = msg || '';
        if (on) hint = '';
        if (nodes.overlay && !nodes.overlay.hidden) renderFooter();
    }

    async function runRecord() {
        if (busy) return;
        setBusy(true, 'Reading the story…');
        try {
            const raw = extractJson(await quiet(recordPrompt()));
            if (!raw) throw new Error('The model did not return usable JSON. Try again; stronger models follow this best.');
            const rec = normalizeRecord(raw);
            state.mission = rec.mission;
            state.progress = rec.progress;
            state.ranking = rec.ranking;
            state.you = rec.you;
            state.recordAt = Date.now();
            await save();
        } catch (e) {
            hint = String(e && e.message ? e.message : e);
            notify(hint);
        } finally {
            setBusy(false);
            rerender(true);
        }
    }

    async function runFeed() {
        if (busy) return;
        setBusy(true, 'Loading reactions…');
        try {
            const n = settings().batch;
            const raw = extractJson(await quiet(feedPrompt(n, state.posts.map((p) => p.text))));
            if (!raw) throw new Error('The model did not return usable JSON. Try again; stronger models follow this best.');
            const posts = normalizePosts(raw);
            if (!posts.length) throw new Error('No posts came back. Try again.');
            state.posts = posts.concat(state.posts).slice(0, 60);
            const trends = normalizeTrends(raw && raw.trends);
            if (trends.length) state.trends = trends;
            state.feedAt = Date.now();
            fanTab = 'foryou';
            await save();
        } catch (e) {
            hint = String(e && e.message ? e.message : e);
            notify(hint);
        } finally {
            setBusy(false);
            rerender();
        }
    }

    // ------------------------------------------------------------------ boot

    function init() {
        if (nodes.overlay) return;
        state = loadState();
        buildOverlay();
        buildFab();
        hookMenu();
        buildSettings();
        const c = ctx();
        if (c.eventSource && c.event_types && c.event_types.CHAT_CHANGED) {
            c.eventSource.on(c.event_types.CHAT_CHANGED, () => {
                state = loadState();
                hint = '';
                rerender();
            });
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { extractJson, fmt, splitRich, normalizePosts, normalizeTrends, normalizeRecord, initials };
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
