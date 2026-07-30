import type { HtmlGameDefinition } from './types';

const shell = (title: string, body: string, script: string) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <style>
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#05050f;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body{display:flex;flex-direction:column;padding:14px}
    .hud{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
    .pill{border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.84);border-radius:12px;padding:8px 10px;min-width:88px}
    .label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;font-weight:800}
    .value{font-size:20px;font-weight:900;color:#f8fafc;line-height:1.05;margin-top:2px}
    .title{text-align:center;font-size:13px;color:#a78bfa;font-weight:900;letter-spacing:.04em;text-transform:uppercase}
    .stage{position:relative;flex:1;border:1px solid rgba(124,58,237,.26);border-radius:18px;background:radial-gradient(circle at 50% 20%,rgba(124,58,237,.22),rgba(15,23,42,.92) 54%,#05050f);overflow:hidden}
    button{font:inherit;color:inherit;border:0}
    .primary{height:48px;border-radius:999px;background:linear-gradient(90deg,#7c3aed,#0891b2);font-weight:900;margin-top:12px}
    .hint{position:absolute;left:16px;right:16px;bottom:18px;text-align:center;color:#94a3b8;font-size:13px;line-height:1.35}
  </style>
</head>
<body>
  <div class="hud">
    <div class="pill"><div class="label">Score</div><div class="value" id="score">0</div></div>
    <div class="title">${title}</div>
    <div class="pill" style="text-align:right"><div class="label">Time</div><div class="value" id="time">0</div></div>
  </div>
  ${body}
  <button class="primary" id="start">Start</button>
  <script>
    const RN = window.ReactNativeWebView;
    const CONFIG = __CONFIG__;
    const send = (payload) => RN && RN.postMessage(JSON.stringify(payload));
    ${script}
    send({ type: 'GAME_READY' });
  </script>
</body>
</html>`;

const withConfig = (
  title: string,
  body: string,
  script: string,
  config: Parameters<HtmlGameDefinition['buildHtml']>[0],
) => shell(title, body, script).replace('__CONFIG__', JSON.stringify(config));

const buildTapRush = (config: Parameters<HtmlGameDefinition['buildHtml']>[0]) =>
  withConfig(
    'Tap Rush',
    `<div class="stage" id="stage">
      <button id="target" aria-label="target"></button>
      <div class="hint" id="hint">Tap the glowing target as many times as possible in 20 seconds.</div>
    </div>`,
    `
      const stage = document.getElementById('stage');
      const target = document.getElementById('target');
      const scoreEl = document.getElementById('score');
      const timeEl = document.getElementById('time');
      const hint = document.getElementById('hint');
      const startBtn = document.getElementById('start');
      let score = 0, remaining = 20, started = false, timer = null;

      Object.assign(target.style, {
        position:'absolute', width:'72px', height:'72px', borderRadius:'50%',
        background:'radial-gradient(circle,#67e8f9,#7c3aed 68%,#4c1d95)',
        boxShadow:'0 0 28px rgba(103,232,249,.55)', display:'none'
      });

      function moveTarget(){
        const rect = stage.getBoundingClientRect();
        const size = 72;
        const x = Math.max(0, Math.random() * (rect.width - size));
        const y = Math.max(0, Math.random() * (rect.height - size));
        target.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      }

      function finish(){
        clearInterval(timer);
        target.style.display = 'none';
        startBtn.textContent = 'Play Again';
        startBtn.style.display = 'block';
        started = false;
        const xpEarned = Math.min(CONFIG.maxXp, 10 + Math.floor(score * CONFIG.maxXp / 28));
        send({ type:'GAME_COMPLETE', score, won: score >= 14, xpEarned, durationSeconds:20 });
      }

      target.addEventListener('click', () => {
        if(!started) return;
        score += 1;
        scoreEl.textContent = score;
        send({ type:'GAME_SCORE', score });
        moveTarget();
      });

      startBtn.addEventListener('click', () => {
        score = 0; remaining = 20; started = true;
        scoreEl.textContent = score; timeEl.textContent = remaining;
        hint.style.display = 'none'; startBtn.style.display = 'none';
        target.style.display = 'block'; moveTarget();
        timer = setInterval(() => {
          remaining -= 1;
          timeEl.textContent = remaining;
          if(remaining <= 0) finish();
        }, 1000);
      });
    `,
    config,
  );

const buildMemoryGrid = (config: Parameters<HtmlGameDefinition['buildHtml']>[0]) =>
  withConfig(
    'Memory Grid',
    `<div class="stage" id="stage">
      <div id="grid"></div>
      <div class="hint" id="hint">Memorize highlighted tiles, then replay the pattern.</div>
    </div>`,
    `
      const grid = document.getElementById('grid');
      const scoreEl = document.getElementById('score');
      const timeEl = document.getElementById('time');
      const startBtn = document.getElementById('start');
      const hint = document.getElementById('hint');
      let score = 0, round = 0, accepting = false, startedAt = 0, pattern = [], input = [];

      Object.assign(grid.style, {
        display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px',
        width:'min(92vw,360px)', margin:'42px auto 0'
      });
      const cells = Array.from({ length: 9 }, (_, i) => {
        const b = document.createElement('button');
        b.textContent = '';
        Object.assign(b.style, {
          aspectRatio:'1/1', borderRadius:'16px', background:'rgba(15,23,42,.95)',
          border:'1px solid rgba(148,163,184,.24)', boxShadow:'inset 0 0 0 1px rgba(255,255,255,.03)'
        });
        b.addEventListener('click', () => choose(i));
        grid.appendChild(b);
        return b;
      });

      function flash(i){
        cells[i].style.background = 'linear-gradient(135deg,#7c3aed,#22d3ee)';
        setTimeout(() => cells[i].style.background = 'rgba(15,23,42,.95)', 420);
      }

      function nextRound(){
        accepting = false;
        input = [];
        round += 1;
        timeEl.textContent = round;
        pattern = Array.from({ length: Math.min(2 + round, 7) }, () => Math.floor(Math.random() * 9));
        pattern.forEach((idx, n) => setTimeout(() => flash(idx), 540 * n + 250));
        setTimeout(() => { accepting = true; hint.textContent = 'Replay the pattern.'; }, 540 * pattern.length + 350);
      }

      function finish(won){
        accepting = false;
        startBtn.textContent = 'Play Again';
        startBtn.style.display = 'block';
        const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const xpEarned = Math.min(CONFIG.maxXp, 8 + Math.floor(score * CONFIG.maxXp / 6));
        send({ type:'GAME_COMPLETE', score, won, xpEarned, durationSeconds });
      }

      function choose(i){
        if(!accepting) return;
        input.push(i);
        flash(i);
        if(i !== pattern[input.length - 1]) return finish(false);
        if(input.length === pattern.length){
          score += 1;
          scoreEl.textContent = score;
          send({ type:'GAME_SCORE', score });
          if(score >= 5) return finish(true);
          hint.textContent = 'Good. Next pattern...';
          setTimeout(nextRound, 700);
        }
      }

      startBtn.addEventListener('click', () => {
        score = 0; round = 0; startedAt = Date.now();
        scoreEl.textContent = score; timeEl.textContent = round;
        startBtn.style.display = 'none';
        nextRound();
      });
    `,
    config,
  );

export const HTML5_GAMES: HtmlGameDefinition[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'tap-rush',
    name: 'Tap Rush',
    emoji: 'TR',
    imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=600&auto=format&fit=crop',
    gradient: ['#7C3AED', '#0891B2'],
    maxXp: 35,
    isHot: true,
    averageDurationLabel: '20 sec',
    buildHtml: buildTapRush,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'memory-grid',
    name: 'Memory Grid',
    emoji: 'MG',
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=600&auto=format&fit=crop',
    gradient: ['#0F766E', '#4F46E5'],
    maxXp: 45,
    isHot: false,
    averageDurationLabel: '1 min',
    buildHtml: buildMemoryGrid,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    slug: 'scribble',
    name: 'Scribble',
    emoji: '✏️',
    imageUrl: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?q=80&w=600&auto=format&fit=crop',
    gradient: ['#F59E0B', '#EF4444'],
    maxXp: 50,
    isHot: true,
    averageDurationLabel: '3 min',
    buildHtml: buildTapRush,
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    slug: 'ludo',
    name: 'Ludo Classic',
    emoji: '🎲',
    imageUrl: 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffaed?q=80&w=600&auto=format&fit=crop',
    gradient: ['#10B981', '#3B82F6'],
    maxXp: 60,
    isHot: false,
    averageDurationLabel: '10 min',
    buildHtml: buildTapRush,
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    slug: 'snake-ladder',
    name: 'Snake & Ladder',
    emoji: '🐍',
    imageUrl: 'https://images.unsplash.com/photo-1570303363992-7f95ee20ebdb?q=80&w=600&auto=format&fit=crop',
    gradient: ['#8B5CF6', '#EC4899'],
    maxXp: 40,
    isHot: false,
    averageDurationLabel: '8 min',
    buildHtml: buildTapRush,
  },
  {
    id: '66666666-6666-4666-8666-666666666666',
    slug: 'chess',
    name: 'Chess',
    emoji: '♟️',
    imageUrl: 'https://images.unsplash.com/photo-1586165368502-1bad197a6461?q=80&w=600&auto=format&fit=crop',
    gradient: ['#374151', '#111827'],
    maxXp: 100,
    isHot: true,
    averageDurationLabel: '15 min',
    buildHtml: buildTapRush,
  },
  {
    id: '77777777-7777-4777-8777-777777777777',
    slug: 'word-rush',
    name: 'Word Rush',
    emoji: '📝',
    imageUrl: 'https://images.unsplash.com/photo-1555448248-2571daf6344b?q=80&w=600&auto=format&fit=crop',
    gradient: ['#0EA5E9', '#6366F1'],
    maxXp: 45,
    isHot: false,
    averageDurationLabel: '2 min',
    buildHtml: buildMemoryGrid,
  },
];

export const getHtmlGame = (gameId: string) =>
  HTML5_GAMES.find((game) => game.id === gameId || game.slug === gameId);
