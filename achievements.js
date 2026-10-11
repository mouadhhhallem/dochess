/**
 * achievements.js — DoChess ranks + achievements (classic script, file:// safe).
 *
 * The "database" is the same device-local pattern the rest of the static
 * build already uses (OnlineRatings `ccr_`, OnlineStore `ccg_`, Study
 * `dcstudy_v1_`): one versioned localStorage record per user —
 * `cca_v1_{uid}` — holding earned badges (id -> timestamp), play-day
 * history, screen coverage and rolling counters. Nothing is decorative:
 * every rank is derived from real peak ratings, every badge rule reads
 * real ratings/history/Learn-store/lesson/study data, and community
 * badges that cannot be honestly earned without a server stay visibly
 * locked with their real unlock text.
 *
 * Surfaces: Profile rank card + full badge gallery, lobby rank chip,
 * device-leaderboard crests, game-end toasts (badge unlocks and rank
 * promotions). app.js calls touch()/onGame()/profileHTML() at the real
 * events; this file owns evaluation and rendering.
 */
const DoChessAchievements = (() => {
    'use strict';

    /* ── Ranks: 8 crests, thresholds on peak rating (max `best` per cat) ── */
    const RANKS = [
        { id: 'bronze',      name: 'Bronze',      min: 800  },
        { id: 'silver',      name: 'Silver',      min: 1000 },
        { id: 'gold',        name: 'Gold',        min: 1200 },
        { id: 'platinum',    name: 'Platinum',    min: 1400 },
        { id: 'diamond',     name: 'Diamond',     min: 1600 },
        { id: 'master',      name: 'Master',      min: 1850 },
        { id: 'grandmaster', name: 'Grandmaster', min: 2100 },
        { id: 'legend',      name: 'Legend',      min: 2400 }
    ];

    function rankIndex(peak) {
        const p = Number.isFinite(peak) ? peak : 800;
        let i = 0;
        for (let k = 0; k < RANKS.length; k++) if (p >= RANKS[k].min) i = k;
        return i;
    }
    function rankFor(peak) {
        const i = rankIndex(peak);
        const cur = RANKS[i];
        const next = RANKS[i + 1] || null;
        const p = Number.isFinite(peak) ? peak : cur.min;
        const span = next ? next.min - cur.min : 1;
        const pct = next ? Math.max(0, Math.min(100, Math.round(((p - cur.min) / span) * 100))) : 100;
        return { ...cur, index: i, peak: p, next, pct, toNext: next ? Math.max(0, next.min - p) : 0 };
    }

    const SVG = {
        rank: (id) => `assets/DoChess_SVGs/ranks/rank-${id}.svg`,
        badge: (id) => `assets/DoChess_SVGs/badges/badge-${id}.svg`
    };
    function av() {
        try { if (window.ChessCourseApp && ChessCourseApp.assetV) return ChessCourseApp.assetV(); } catch (_) {}
        return 'v1';
    }
    function esc(v) {
        if (typeof window.esc === 'function') return window.esc(v);
        return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    const KNIGHT_LEVELS = ['s1n-1', 's1n-2', 's1n-3', 's1n-4', 's1n-5', 's1n-6'];

    /* ── Badge catalog ──
       rule(ctx) reads the merged real-data context (see buildCtx). Badges
       without an honest local rule are `community: true`: shown in the
       gallery, never falsely earned, unlock text is the real condition. */
    const BADGES = [
        // Online play (OnlineRatings + history + game-end events)
        { id: 'first-win', name: 'First Win', how: 'Win your first rated online game.', group: 'online',
          rule: c => c.totalWins >= 1 },
        { id: '100-games', name: '100 Games', how: 'Play 100 rated online games.', group: 'online',
          rule: c => c.totalGames >= 100 },
        { id: '500-games', name: '500 Games', how: 'Play 500 rated online games.', group: 'online',
          rule: c => c.totalGames >= 500 },
        { id: '1000-games', name: '1000 Games', how: 'Play 1000 rated online games.', group: 'online',
          rule: c => c.totalGames >= 1000 },
        { id: 'win-streak', name: 'Win Streak', how: 'Win 5 rated games in a row.', group: 'online',
          rule: c => c.maxStreak >= 5 },
        { id: 'comeback', name: 'Comeback', how: 'Beat an opponent outrated by 50+ points.', group: 'online',
          rule: c => !!c.store.flags.comeback },
        { id: 'speed-demon', name: 'Speed Demon', how: 'Win a Bullet (1+0) rated game.', group: 'online',
          rule: c => !!c.store.flags.bulletWin },
        { id: 'coffee-break', name: 'Coffee Break', how: 'Finish a Bullet (1+0) game.', group: 'online',
          rule: c => !!c.store.flags.bulletGame },
        { id: 'chess-lover', name: 'Chess Lover', how: 'Play rated games in all three speeds.', group: 'online',
          rule: c => c.ratings.bullet.games >= 1 && c.ratings.blitz.games >= 1 && c.ratings.rapid.games >= 1 },
        { id: 'blitz-champion', name: 'Blitz Champion', how: 'Reach a 1400 Blitz rating.', group: 'online',
          rule: c => c.ratings.blitz.best >= 1400 },
        { id: 'rapid-champion', name: 'Rapid Champion', how: 'Reach a 1400 Rapid rating.', group: 'online',
          rule: c => c.ratings.rapid.best >= 1400 },
        { id: 'classical-champion', name: 'Classical Champion', how: 'Reach a 1700 Rapid rating — the long-format milestone.', group: 'online',
          rule: c => c.ratings.rapid.best >= 1700 },
        { id: 'tournament-winner', name: 'Tournament Winner', how: 'Win a DoChess tournament — arrives with online events.', group: 'online', community: true },
        // Ranks
        { id: 'rising-star', name: 'Rising Star', how: 'Reach a 1100 peak rating.', group: 'rank',
          rule: c => c.peak >= 1100 },
        { id: 'dochess-pro', name: 'DoChess Pro', how: 'Reach the Master rank (1850 peak).', group: 'rank',
          rule: c => c.peak >= 1850 },
        { id: 'legendary', name: 'Legendary', how: 'Reach the Legend rank (2400 peak).', group: 'rank',
          rule: c => c.peak >= 2400 },
        { id: 'collector', name: 'Collector', how: 'Earn 10 other badges.', group: 'rank',
          rule: c => c.earnedCount >= 10 },
        // Learn store (dochess:v1) + lessons (ccp_v4)
        { id: 'perfect-game', name: 'Perfect Game', how: 'Earn 3 stars on any Learn level (1 try, no hints).', group: 'learn',
          rule: c => c.learn.threeStars >= 1 },
        { id: 'no-mistakes', name: 'No Mistakes', how: 'Earn 3 stars on 15 Learn levels.', group: 'learn',
          rule: c => c.learn.threeStars >= 15 },
        { id: 'sharp-eye', name: 'Sharp Eye', how: 'Earn 3 stars on 3 Learn levels.', group: 'learn',
          rule: c => c.learn.threeStars >= 3 },
        { id: 'knight-fan', name: 'Knight Fan', how: 'Earn 3 stars on all 6 knight levels.', group: 'learn',
          rule: c => c.learn.knightThree >= 6 },
        { id: 'puzzle-master', name: 'Puzzle Master', how: 'Solve all 36 Learn levels.', group: 'learn',
          rule: c => c.learn.solved >= 36 },
        { id: 'tactics-expert', name: 'Tactics Expert', how: 'Finish the tactics lessons (5 and 6).', group: 'learn',
          rule: c => c.lessonsDone.includes(5) && c.lessonsDone.includes(6) },
        { id: 'endgame-expert', name: 'Endgame Expert', how: 'Finish lessons 8, 9 and 10.', group: 'learn',
          rule: c => c.lessonsDone.includes(8) && c.lessonsDone.includes(9) && c.lessonsDone.includes(10) },
        { id: 'knowledge-seeker', name: 'Knowledge Seeker', how: 'Earn 500 XP in Learn.', group: 'learn',
          rule: c => c.learn.xp >= 500 },
        { id: 'pathfinder', name: 'Pathfinder', how: 'Complete all 10 course lessons.', group: 'learn',
          rule: c => c.lessonsDone.length >= 10 },
        { id: 'speed-runner', name: 'Speed Runner', how: 'Set a Rush-mode best score in Learn.', group: 'learn',
          rule: c => c.learn.rushBest > 0 },
        { id: 'daily-puzzle', name: 'Daily Puzzle', how: 'Complete a Daily challenge in Learn.', group: 'learn',
          rule: c => !!c.store.flags.dailyPuzzle },
        { id: 'study-buddy', name: 'Study Buddy', how: 'Work through 3+ Study sessions.', group: 'study',
          rule: c => c.study.opens >= 3 },
        { id: 'opening-theorist', name: 'Opening Theorist', how: 'Save an opening repertoire in Study.', group: 'study',
          rule: c => c.study.repertoire >= 1 },
        // Habits
        { id: 'daily-player', name: 'Daily Player', how: 'Play or practice on 2 different days.', group: 'habit',
          rule: c => c.days.length >= 2 },
        { id: 'weekly-player', name: 'Weekly Player', how: 'Play or practice on 7 different days.', group: 'habit',
          rule: c => c.days.length >= 7 },
        { id: 'consistency', name: 'Consistent Player', how: 'Keep a 7-day activity streak.', group: 'habit',
          rule: c => c.dayStreak >= 7 },
        { id: 'veteran', name: 'Veteran', how: 'Play or practice on 30 different days.', group: 'habit',
          rule: c => c.days.length >= 30 },
        { id: 'late-night', name: 'Late Night', how: 'Play between 22:00 and 04:59.', group: 'habit',
          rule: c => !!c.store.flags.lateNight },
        { id: 'holiday-mode', name: 'Holiday Mode', how: 'Play between Dec 20 and Jan 5.', group: 'habit',
          rule: c => !!c.store.flags.holiday },
        { id: 'explorer', name: 'Explorer', how: 'Visit every section of DoChess.', group: 'habit',
          rule: c => ['home-screen', 'lessons-screen', 'learn-screen', 'progress-screen', 'profile-screen', 'online-screen', 'study-screen'].every(s => c.store.screens[s]) },
        { id: 'early-access', name: 'Early Access', how: 'Use DoChess before achievements existed.', group: 'habit',
          rule: c => !!c.store.flags.founding },
        { id: 'beta-tester', name: 'Beta Tester', how: 'Play the pre-release DoChess.', group: 'habit',
          rule: c => !!c.store.flags.founding },
        // Community: honestly locked until the social backend exists.
        { id: 'supporter', name: 'Supporter', how: 'Support the DoChess community.', group: 'community', community: true },
        { id: 'team-player', name: 'Team Player', how: 'Join or support a team.', group: 'community', community: true },
        { id: 'mentor', name: 'Mentor', how: 'Mentor another player.', group: 'community', community: true },
        { id: 'helpful', name: 'Helpful', how: 'Help other players.', group: 'community', community: true },
        { id: 'commentator', name: 'Commentator', how: 'Contribute commentary.', group: 'community', community: true },
        { id: 'discussion-starter', name: 'Discussion Starter', how: 'Start a helpful discussion.', group: 'community', community: true },
        { id: 'blog-writer', name: 'Blog Writer', how: 'Publish an article.', group: 'community', community: true },
        { id: 'content-creator', name: 'Content Creator', how: 'Publish chess content.', group: 'community', community: true },
        { id: 'coachs-pick', name: "Coach's Pick", how: 'Receive coach recognition.', group: 'community', community: true },
        { id: 'food-lover', name: 'Food Lover', how: 'A seasonal community badge.', group: 'community', community: true },
        { id: 'animal-lover', name: 'Animal Lover', how: 'A community fun badge.', group: 'community', community: true }
    ].filter(b => !b.hidden);

    /* ── Store: `cca_v1_{uid}` ── */
    const KEY_PREFIX = 'cca_v1_';
    function key(uid) { return KEY_PREFIX + (uid || 'anon'); }
    function blank(now) {
        return {
            v: 1,
            earned: {},            // badgeId -> earnedAt ms
            days: [],              // 'YYYY-MM-DD' play days, newest first, capped
            screens: {},           // screenId -> true
            counters: { streak: 0, maxStreak: 0, studyOpens: 0, lastStudyAt: 0 },
            flags: {}              // comeback, bulletWin, bulletGame, lateNight, holiday, dailyPuzzle, founding
        };
    }
    function load(uid) {
        try {
            const s = localStorage.getItem(key(uid));
            if (s) {
                const d = JSON.parse(s);
                if (d && typeof d === 'object' && d.v === 1 && d.earned && typeof d.earned === 'object') {
                    d.counters = d.counters || {};
                    d.screens = d.screens || {};
                    d.flags = d.flags || {};
                    d.days = Array.isArray(d.days) ? d.days : [];
                    return d;
                }
            }
        } catch (_) {}
        return null;
    }
    function save(uid, d) {
        try { localStorage.setItem(key(uid), JSON.stringify(d)); } catch (_) {}
    }
    function ensure(uid) {
        let d = load(uid);
        if (d) return d;
        d = blank(Date.now());
        // Founding member: any real activity predating this record means the
        // player was here before achievements existed — grant honestly once.
        try {
            const prior = (uid && localStorage.getItem('ccr_' + uid)) || localStorage.getItem('dochess:v1') || localStorage.getItem('ccp_v4');
            if (prior) d.flags.founding = true;
        } catch (_) {}
        save(uid, d);
        return d;
    }

    function dayKey(dt) {
        const d = dt || new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function pushDay(d, key2) {
        if (!key2 || d.days[0] === key2) return;
        const i = d.days.indexOf(key2);
        if (i > 0) d.days.splice(i, 1);
        if (i !== 0) d.days.unshift(key2);
        if (d.days.length > 60) d.days.length = 60;
    }
    function dayStreakOf(days) {
        if (!days.length) return 0;
        const set = new Set(days);
        let cur = new Date();
        if (!set.has(dayKey(cur))) {
            cur.setDate(cur.getDate() - 1);
            if (!set.has(dayKey(cur))) return 0;
        }
        let n = 0;
        while (set.has(dayKey(cur))) { n++; cur.setDate(cur.getDate() - 1); }
        return n;
    }

    /* ── Context: merge every real store (read-only) ── */
    function readJSON(k) {
        try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (_) { return null; }
    }
    function buildCtx(uid, d) {
        const cats = {};
        ['bullet', 'blitz', 'rapid'].forEach(id => { cats[id] = { games: 0, w: 0, l: 0, d: 0, best: 800, rating: 800 }; });
        const r = readJSON('ccr_' + (uid || 'anon'));
        if (r && r.cats) {
            Object.keys(cats).forEach(id => {
                const c = r.cats[id];
                if (c && typeof c === 'object') {
                    cats[id] = {
                        games: c.games || 0, w: c.w || 0, l: c.l || 0, d: c.d || 0,
                        best: c.best || c.rating || 800, rating: c.rating || 800
                    };
                }
            });
        }
        const totalGames = cats.bullet.games + cats.blitz.games + cats.rapid.games;
        const totalWins = cats.bullet.w + cats.blitz.w + cats.rapid.w;
        const peak = Math.max(cats.bullet.best, cats.blitz.best, cats.rapid.best, 800);

        // Learn store — stars/xp/streak/daily/rush, honest reads only.
        const ls = readJSON('dochess:v1') || {};
        const stars = (ls.stars && typeof ls.stars === 'object') ? ls.stars : {};
        let solved = 0, threeStars = 0, knightThree = 0;
        Object.keys(stars).forEach(id => {
            const v = stars[id];
            if (typeof v === 'number' && v > 0) solved++;
            if (v === 3) threeStars++;
        });
        KNIGHT_LEVELS.forEach(id => { if (stars[id] === 3) knightThree++; });
        if (ls.daily && ls.daily.done) d.flags.dailyPuzzle = true;

        // Course lessons.
        const prog = readJSON('ccp_v4' + (uid ? '_' + uid : ''));
        const lessonsDone = (prog && Array.isArray(prog.done)) ? prog.done.filter(n => Number.isInteger(n)) : [];

        // Study library.
        const st = readJSON('dcstudy_v1_' + (uid || 'anon'));
        let chapters = 0, repertoire = 0;
        if (st && Array.isArray(st.studies)) {
            st.studies.forEach(s => {
                chapters += (s && Array.isArray(s.chapters)) ? s.chapters.length : 0;
                repertoire += (s && Array.isArray(s.repertoire)) ? s.repertoire.length : 0;
            });
        }

        // Days: union of store days, Learn heatmap, rated-game dates.
        const daySet = new Set(d.days);
        if (ls.heatmap && typeof ls.heatmap === 'object') {
            Object.keys(ls.heatmap).forEach(k => { if (/^\d{4}-\d{2}-\d{2}$/.test(k)) daySet.add(k); });
        }
        try {
            const h = readJSON('ccgh_' + (uid || 'anon'));
            if (Array.isArray(h)) h.forEach(g => {
                if (g && typeof g.date === 'number') daySet.add(dayKey(new Date(g.date)));
            });
        } catch (_) {}
        const days = [...daySet].sort().reverse().slice(0, 60);

        return {
            now: new Date(),
            ratings: cats, totalGames, totalWins, peak,
            maxStreak: d.counters.maxStreak || 0,
            learn: {
                solved, threeStars, knightThree,
                xp: typeof ls.xp === 'number' ? ls.xp : 0,
                streak: (ls.streak && typeof ls.streak.count === 'number') ? ls.streak.count : 0,
                rushBest: typeof ls.rushBest === 'number' ? ls.rushBest : 0,
                dailyDone: !!(ls.daily && ls.daily.done)
            },
            lessonsDone,
            study: { chapters, repertoire, opens: d.counters.studyOpens || 0 },
            days,
            dayStreak: Math.max(dayStreakOf(days), (ls.streak && typeof ls.streak.count === 'number') ? ls.streak.count : 0),
            earnedCount: Object.keys(d.earned).length,
            store: d
        };
    }

    /* ── Evaluate: grant every currently-true badge, return the new ones ── */
    function evaluate(uid) {
        const d = ensure(uid);
        const c = buildCtx(uid, d);
        const fresh = [];
        const now = Date.now();
        // Habit flags from the current moment (activity is happening now).
        const hr = c.now.getHours();
        if (hr >= 22 || hr < 5) d.flags.lateNight = true;
        const mo = c.now.getMonth() + 1, da = c.now.getDate();
        if ((mo === 12 && da >= 20) || (mo === 1 && da <= 5)) d.flags.holiday = true;
        pushDay(d, dayKey(c.now));
        BADGES.forEach(b => {
            if (b.community || d.earned[b.id]) return;
            let ok = false;
            try { ok = !!b.rule(c); } catch (_) { ok = false; }
            if (ok) { d.earned[b.id] = now; fresh.push(b); }
        });
        // Collector counts OTHER earned badges, and its rule reads the
        // pre-pass snapshot — re-check after the pass so crossing 10 lands
        // in the same evaluate instead of waiting for the next touch.
        if (!d.earned.collector && Object.keys(d.earned).length >= 10) {
            const cb = BADGES.find(b => b.id === 'collector');
            if (cb) { d.earned.collector = now; fresh.push(cb); }
        }
        save(uid, d);
        return { fresh, rank: rankFor(c.peak), ctx: c };
    }

    /* ── Game end hook: update counters/flags from a finished online game ──
       Promotion compares the peak BEFORE this game's rating write — callers
       that already applied the Elo delta must pass peakBefore (captured
       before applyGame), otherwise before === after and promotion never
       fires. peakBefore is read-only context, never written back. */
    function onGame(info) {
        const uid = info && info.uid;
        const d = ensure(uid);
        const res = info.result;
        const before = Number.isFinite(info.peakBefore) ? rankFor(info.peakBefore) : rankFor(peakFromStore(uid));
        if (res === 'win' || res === 'loss' || res === 'draw') {
            pushDay(d, dayKey(new Date()));
            if (res === 'win') {
                d.counters.streak = (d.counters.streak || 0) + 1;
                if (d.counters.streak > (d.counters.maxStreak || 0)) d.counters.maxStreak = d.counters.streak;
            } else {
                d.counters.streak = 0;
            }
            if (info.cat === 'bullet') {
                d.flags.bulletGame = true;
                if (res === 'win') d.flags.bulletWin = true;
            }
            if (res === 'win' && Number.isFinite(info.oppRating) && Number.isFinite(info.myBefore) && info.oppRating - info.myBefore >= 50) {
                d.flags.comeback = true;
            }
            const hr = new Date().getHours();
            if (hr >= 22 || hr < 5) d.flags.lateNight = true;
            const mo = new Date().getMonth() + 1, da = new Date().getDate();
            if ((mo === 12 && da >= 20) || (mo === 1 && da <= 5)) d.flags.holiday = true;
        }
        save(uid, d);
        const { fresh } = evaluate(uid);
        const after = rankFor(peakFromStore(uid));
        return { fresh, promoted: after.index > before.index ? after : null, demoted: after.index < before.index ? after : null, rank: after };
    }

    function peakFromStore(uid) {
        let peak = 800;
        const r = readJSON('ccr_' + (uid || 'anon'));
        if (r && r.cats) Object.keys(r.cats).forEach(id => {
            const c = r.cats[id];
            if (c) peak = Math.max(peak, c.best || c.rating || 800);
        });
        return peak;
    }
    function myPeak(uid) { return peakFromStore(uid); }

    /* ── Screen/session hooks (cheap; no-op when unchanged) ── */
    let lastTouchKey = '';
    function touch(uid, screenId) {
        const k = (uid || 'anon') + '|' + (screenId || '');
        if (k === lastTouchKey) return null;
        lastTouchKey = k;
        const d = ensure(uid);
        let changed = false;
        if (screenId && !d.screens[screenId]) { d.screens[screenId] = true; changed = true; }
        if (screenId === 'study-screen') {
            const now = Date.now();
            if (now - (d.counters.lastStudyAt || 0) > 10 * 60 * 1000) {
                d.counters.studyOpens = (d.counters.studyOpens || 0) + 1;
                d.counters.lastStudyAt = now;
                changed = true;
            }
        }
        if (!changed) return null;
        save(uid, d);
        const { fresh } = evaluate(uid);
        return fresh;
    }

    /* ── Toasts ── */
    let toastBox = null;
    function toastBoxEl() {
        if (toastBox && document.body.contains(toastBox)) return toastBox;
        toastBox = document.createElement('div');
        toastBox.className = 'dc-ach-toasts';
        toastBox.setAttribute('role', 'status');
        toastBox.setAttribute('aria-live', 'polite');
        document.body.appendChild(toastBox);
        return toastBox;
    }
    function toastBadge(b) {
        try {
            const box = toastBoxEl();
            const el = document.createElement('div');
            el.className = 'dc-ach-toast';
            el.innerHTML = `<img src="${SVG.badge(b.id)}?${av()}" width="44" height="44" alt="">
                <span><strong>${esc(b.name)}</strong><em>Badge unlocked</em></span>`;
            box.appendChild(el);
            while (box.children.length > 3) box.removeChild(box.firstChild);
            setTimeout(() => { try { el.classList.add('out'); } catch (_) {} setTimeout(() => { try { el.remove(); } catch (_) {} }, 400); }, 5200);
        } catch (_) {}
    }
    function toastRank(rk) {
        try {
            const box = toastBoxEl();
            const el = document.createElement('div');
            el.className = 'dc-ach-toast rank';
            el.innerHTML = `<img src="${SVG.rank(rk.id)}?${av()}" width="44" height="44" alt="">
                <span><strong>${esc(rk.name)} rank</strong><em>Promoted — peak ${rk.peak}</em></span>`;
            box.appendChild(el);
            while (box.children.length > 3) box.removeChild(box.firstChild);
            setTimeout(() => { try { el.classList.add('out'); } catch (_) {} setTimeout(() => { try { el.remove(); } catch (_) {} }, 400); }, 6200);
        } catch (_) {}
    }
    function announceFresh(fresh, promoted) {
        (fresh || []).slice(0, 3).forEach((b, i) => setTimeout(() => toastBadge(b), i * 700));
        if (promoted) setTimeout(() => toastRank(promoted), ((fresh || []).slice(0, 3).length) * 700 + 350);
    }

    /* ── Profile rendering ── */
    function crestHTML(rk, size) {
        const s = size || 72;
        return `<img class="dc-rank-crest" src="${SVG.rank(rk.id)}?${av()}" width="${s}" height="${s}" alt="">`;
    }
    function profileHTML(uid) {
        const d = ensure(uid);
        evaluate(uid);
        const peak = peakFromStore(uid);
        const rk = rankFor(peak);
        const earnedCount = Object.keys(d.earned).length;
        const bar = rk.next
            ? `<div class="dc-rank-bar" role="img" aria-label="${rk.pct} percent toward ${esc(rk.next.name)}">
                   <span style="width:${Math.max(4, rk.pct)}%"></span></div>
               <p class="dc-line">${rk.toNext} points to ${esc(rk.next.name)}</p>`
            : `<div class="dc-rank-bar maxed" role="img" aria-label="Highest rank reached"><span style="width:100%"></span></div>
               <p class="dc-line">Highest rank reached.</p>`;
        const items = BADGES.map(b => {
            const at = d.earned[b.id];
            const on = !!at;
            let when = '';
            if (on) {
                try { when = new Date(at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); } catch (_) { when = ''; }
            }
            return `<li class="dc-ach-item${on ? ' on' : ' locked'}">
                <img src="${SVG.badge(b.id)}?${av()}" width="64" height="64" loading="lazy" decoding="async" alt="${esc(b.name)} badge${on ? '' : ' (locked)'}">
                <span class="dc-ach-n">${esc(b.name)}</span>
                <span class="dc-ach-h">${on ? esc(when || 'Earned') : esc(b.how)}</span>
            </li>`;
        }).join('');
        return `
        <section class="dc-panel dc-ach" aria-label="Rank and achievements">
            <div class="dc-rank">
                ${crestHTML(rk, 84)}
                <div class="dc-rank-main">
                    <p class="dc-rank-kicker">Competitive rank</p>
                    <h4>${esc(rk.name)}</h4>
                    <p class="dc-line">Peak rating ${rk.peak}${rk.next ? ` · ${esc(rk.next.name)} at ${rk.next.min}` : ''}</p>
                    ${bar}
                </div>
            </div>
            <div class="dc-ach-head">
                <h4>Badges</h4>
                <p class="dc-line">${earnedCount} of ${BADGES.length} earned</p>
            </div>
            <ul class="dc-ach-grid">${items}</ul>
        </section>`;
    }

    /* ── Small chips for lobby + leaderboard ── */
    function rankChipHTML(uid, peakArg) {
        const peak = Number.isFinite(peakArg) ? peakArg : peakFromStore(uid);
        const rk = rankFor(peak);
        return `<span class="dc-rank-chip" title="${esc(rk.name)} rank — peak ${rk.peak}">
            <img src="${SVG.rank(rk.id)}?${av()}" width="18" height="18" alt="${esc(rk.name)} rank">
            <span>${esc(rk.name)}</span></span>`;
    }
    function crestMiniHTML(rating) {
        const rk = rankFor(Number.isFinite(rating) ? rating : 800);
        return `<img class="dc-rank-mini" src="${SVG.rank(rk.id)}?${av()}" width="16" height="16" alt="${esc(rk.name)}" title="${esc(rk.name)} rank">`;
    }

    return {
        RANKS, BADGES,
        rankFor, myPeak, peakFor: peakFromStore,
        evaluate, onGame, touch,
        profileHTML, rankChipHTML, crestMiniHTML,
        toastBadge, toastRank, announceFresh,
        version: '1.0.0'
    };
})();

if (typeof window !== 'undefined') window.DoChessAchievements = DoChessAchievements;
if (typeof module !== 'undefined' && module.exports) module.exports = { DoChessAchievements };
