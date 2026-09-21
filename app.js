/* AI 简报 · 静态站渲染逻辑
 * 数据契约：data/manifest.json（日期数组）+ data/YYYY-MM-DD.json（单日）
 * 纯 Vanilla JS，无依赖；所有请求走相对路径以适配 GitHub Pages 子路径部署。
 *
 * 渲染约定（2026-09-20 重构）：
 *   1. 占位符过滤：值为 "--" / "—" / "-" / "N/A" 的条目一律不渲染（历史数据里的占位符不再显示成一行内容）
 *   2. 缺模块降级：某模块为空时**不报错、不显示空壳**，改在顶部提示「本日缺少哪些板块」
 *   3. 状态可达：日期写进 URL hash，可直接分享/刷新某一天
 */
(function () {
  'use strict';

  var datesEl = document.getElementById('dates');
  var briefingEl = document.getElementById('briefing');
  var railCount = document.getElementById('rail-count');
  var footerMeta = document.getElementById('footer-meta');
  var themeBtn = document.getElementById('theme-toggle');

  var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  // 报头日期：ISO → 「2026年8月14日」+ 星期（衬线报头的核心信息）
  function cnDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return { cn: String(iso || ''), week: '' };
    var dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return {
      cn: +m[1] + '年' + +m[2] + '月' + +m[3] + '日',
      week: WEEK[dt.getUTCDay()] || ''
    };
  }

  var MODULE_LABELS = {
    points: '今日要点',
    tracks: '赛道动态',
    consensus: '最大共识',
    division: '主要分歧',
    reading: '推荐阅读',
    github: 'GitHub 项目推荐'
  };

  var PLACEHOLDERS = ['--', '---', '—', '–', '-', '无', 'N/A', 'n/a', 'null'];

  function isPlaceholder(v) {
    if (v == null) return true;
    var s = String(v).trim();
    if (!s) return true;
    return PLACEHOLDERS.indexOf(s) !== -1;
  }

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 只允许 http(s) 链接进入 href（挡 javascript:/data: 等伪协议）
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    return /^https?:\/\//i.test(s) ? s : '#';
  }

  // 从文案末尾抽取「（来源）」尾注，拆成正文 + 来源
  function splitSource(text) {
    var m = /（([^（）]{1,60})）\s*$/.exec(text);
    if (m) return { body: text.slice(0, m.index).trim(), source: m[1].trim() };
    return { body: text, source: '' };
  }

  function cleanList(list) {
    return (Array.isArray(list) ? list : []).filter(function (x) { return !isPlaceholder(x); });
  }

  function trackGroupHtml(label, kind, items) {
    var list = cleanList(items);
    if (!list.length) return '';
    var itemsHtml = list.map(function (it) {
      var parts = splitSource(String(it));
      var meta = parts.source ? '<div class="item-meta">来源：' + esc(parts.source) + '</div>' : '';
      return '<div class="item"><div class="item-body">' + esc(parts.body) + '</div>' + meta + '</div>';
    }).join('');
    return '<div class="group" data-kind="' + kind + '"><div class="group-title">' + esc(label) + '</div>' + itemsHtml + '</div>';
  }

  function vpCard(kind, title, vp) {
    if (!vp || isPlaceholder(vp.text)) return '';
    var quotes = cleanList(vp.quotes);
    var quotesHtml = quotes.length
      ? '<ul>' + quotes.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul>'
      : '';
    return '<div class="vp-card vp-' + kind + '"><h4>' + esc(title) + '</h4>' +
      '<div class="vp-text">' + esc(vp.text) + '</div>' + quotesHtml + '</div>';
  }

  function readingHtml(reading) {
    var list = (Array.isArray(reading) ? reading : []).filter(function (r) { return r && !isPlaceholder(r.title); });
    if (!list.length) return '';
    var lis = list.map(function (r) {
      var title = r.url
        ? '<a href="' + esc(safeUrl(r.url)) + '" target="_blank" rel="noopener">' + esc(r.title) + '</a>'
        : esc(r.title);
      var reason = (!isPlaceholder(r.reason)) ? '<p class="reason">' + esc(r.reason) + '</p>' : '';
      return '<li>' + title + (r.source ? ' <span class="src">— ' + esc(r.source) + '</span>' : '') + reason + '</li>';
    }).join('');
    return '<section class="reading"><h2>推荐阅读</h2><ol>' + lis + '</ol></section>';
  }

  function githubHtml(github) {
    var list = (Array.isArray(github) ? github : []).filter(function (g) { return g && (g.repo || g.url); });
    if (!list.length) return '';
    var lis = list.map(function (g) {
      var u = g.url || ('https://github.com/' + g.repo);
      var name = g.repo || g.url;
      var star = (g.stars != null && g.stars !== '') ? ' <span class="src">⭐' + esc(g.stars) + '</span>' : '';
      var track = (!isPlaceholder(g.track)) ? ' <span class="badge badge-quiet">' + esc(g.track) + '</span>' : '';
      var note = (!isPlaceholder(g.note)) ? '<p class="reason">' + esc(g.note) + '</p>' : '';
      var why = (!isPlaceholder(g.why)) ? '<p class="reason reason-why">落地：' + esc(g.why) + '</p>' : '';
      return '<li><a href="' + esc(safeUrl(u)) + '" target="_blank" rel="noopener">' + esc(name) + '</a>' + star + track + note + why + '</li>';
    }).join('');
    return '<section class="reading"><h2>GitHub 项目推荐</h2><ol>' + lis + '</ol></section>';
  }

  function missingNotice(data) {
    var missing = [];
    if (!cleanList(data.points).length) missing.push(MODULE_LABELS.points);
    if (!(Array.isArray(data.tracks) ? data.tracks : []).some(function (t) {
      return cleanList(t && t.news).length || cleanList(t && t.insights).length || cleanList(t && t.actions).length;
    })) missing.push(MODULE_LABELS.tracks);
    if (!(data.consensus && !isPlaceholder(data.consensus.text))) missing.push(MODULE_LABELS.consensus);
    if (!(data.division && !isPlaceholder(data.division.text))) missing.push(MODULE_LABELS.division);
    if (!cleanList(data.reading).length) missing.push(MODULE_LABELS.reading);
    if (!cleanList(data.github).length) missing.push(MODULE_LABELS.github);
    if (!missing.length) return '';
    return '<div class="notice">本日数据缺少板块：' + esc(missing.join('、')) +
      '（早期简报格式与当前不一致，已按现有内容渲染）</div>';
  }

  function renderBriefing(data) {
    var points = cleanList(data.points);
    var tracks = Array.isArray(data.tracks) ? data.tracks : [];

    // 有内容的赛道（三色带图例与实际渲染的赛道一致 —— 是信息，不是装饰）
    var liveTracks = tracks.filter(function (t) {
      return t && (cleanList(t.news).length || cleanList(t.insights).length || cleanList(t.actions).length);
    });

    var html = '<div class="brief-head">';
    var dd = cnDate(data.date);
    html += '<div class="date"><span class="date-cn">' + esc(dd.cn) + '</span>' +
      (dd.week ? '<span class="date-week">' + esc(dd.week) + '</span>' : '') + '</div>';
    if (liveTracks.length) {
      html += '<ul class="lanes">' + liveTracks.map(function (t) {
        return '<li class="lane"><i aria-hidden="true"></i>' + esc(t.name || t.key || '') + '</li>';
      }).join('') + '</ul>';
    }
    var metaBits = [];
    if (data.version) metaBits.push('<span class="badge">' + esc(data.version) + '</span>');
    html += '<div class="meta">' + metaBits.join('') + '</div>';
    if (points.length) {
      html += '<div class="lead-label">今日要点</div>';
      html += '<ul class="points">' + points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>';
    }
    html += '</div>';

    html += missingNotice(data);

    liveTracks.forEach(function (t, i) {
      var name = t.name || t.key || '';
      var emoji = t.emoji ? esc(t.emoji) + ' ' : '';
      var body = trackGroupHtml('最新动态', 'news', t.news) +
                 trackGroupHtml('洞察发现', 'insights', t.insights) +
                 trackGroupHtml('落地行动', 'actions', t.actions);
      if (!body) return;   // 该赛道本日无内容 → 整段不渲染
      // lane-i 与页眉三色图例一一对应（顺序即颜色）
      html += '<section class="track lane-' + i + '"><h2>' + emoji + esc(name) + '</h2>' + body + '</section>';
    });

    var vp = vpCard('consensus', '共识解读', data.consensus) + vpCard('division', '分歧解读', data.division);
    if (vp) html += '<div class="viewpoint">' + vp + '</div>';

    html += readingHtml(data.reading);
    html += githubHtml(data.github);

    briefingEl.innerHTML = html;
    document.title = (dd.cn ? dd.cn + ' · ' : '') + 'AI 简报';
    // 换期入场：整块一次（不做逐段上浮），尊重 reduced-motion（由 CSS 关闭）
    briefingEl.classList.remove('enter');
    void briefingEl.offsetWidth;
    briefingEl.classList.add('enter');
  }

  function renderDates(dates, activeDate, gaps) {
    datesEl.innerHTML = dates.map(function (d) {
      var partial = gaps && gaps[d] ? ' partial' : '';
      var mark = partial ? '<span class="d-dot" title="该日数据板块不全">◦</span>' : '';
      return '<li data-date="' + esc(d) + '" tabindex="0" class="' + (d === activeDate ? 'active' : '') + partial + '">' +
        '<span>' + esc(d) + '</span>' + mark + '</li>';
    }).join('');
  }

  function setActive(date) {
    Array.prototype.forEach.call(datesEl.children, function (c) {
      c.classList.toggle('active', c.getAttribute('data-date') === date);
    });
  }

  async function loadDate(date) {
    briefingEl.innerHTML = '<p class="state">正在加载 ' + esc(date) + ' 简报…</p>';
    try {
      var res = await fetch('data/' + date + '.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      data.date = data.date || date;
      renderBriefing(data);
      setActive(date);
      if (location.hash.slice(1) !== date) history.replaceState(null, '', '#' + date);
    } catch (err) {
      briefingEl.innerHTML = '<p class="state">加载失败：' + esc(err.message) + '</p>';
    }
  }

  /* ---- 主题：默认跟随系统，手动切换后记住 -------------------------------- */
  var THEME_LABEL = { dark: '☀ 浅色', light: '☾ 深色' };

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeBtn) {
      // 按钮文案写「切到哪个模式」，比一个含糊的符号好懂
      themeBtn.textContent = THEME_LABEL[theme] || '';
      themeBtn.setAttribute('title', '切换到' + (THEME_LABEL[theme] || '') + '模式');
      themeBtn.setAttribute('aria-label', '切换到' + (THEME_LABEL[theme] || '') + '模式');
    }
    try { localStorage.setItem('ai-briefing-theme', theme); } catch (e) {}
  }
  (function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('ai-briefing-theme'); } catch (e) {}
    if (saved) { applyTheme(saved); return; }
    var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(prefersLight ? 'light' : 'dark');
  })();
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var now = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(now);
    });
  }

  async function init() {
    var dates = [];
    try {
      var res = await fetch('data/manifest.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      dates = (await res.json()).slice().sort().reverse();
    } catch (err) {
      datesEl.innerHTML = '<li class="state">日期加载失败</li>';
      briefingEl.innerHTML = '<p class="state">无法加载日期清单（data/manifest.json）：' + esc(err.message) + '</p>';
      return;
    }
    if (!dates.length) {
      briefingEl.innerHTML = '<p class="state">日期清单为空</p>';
      return;
    }

    if (railCount) railCount.textContent = dates.length + ' 期';
    if (footerMeta) footerMeta.textContent = ' 数据区间：' + dates[dates.length - 1] + ' → ' + dates[0] + '。';

    var hash = decodeURIComponent(location.hash.slice(1));
    var active = dates.indexOf(hash) !== -1 ? hash : dates[0];
    renderDates(dates, active);
    await loadDate(active);

    datesEl.addEventListener('click', function (e) {
      var li = e.target.closest('li[data-date]');
      if (!li) return;
      loadDate(li.getAttribute('data-date'));
    });

    window.addEventListener('hashchange', function () {
      var d = decodeURIComponent(location.hash.slice(1));
      if (dates.indexOf(d) !== -1) loadDate(d);
    });

    document.addEventListener('keydown', function (e) {
      // 日期项可键盘操作（li 带 tabindex="0"）：Enter / 空格 = 打开该日
      var el = e.target;
      if ((e.key === 'Enter' || e.key === ' ') && el && el.getAttribute && el.getAttribute('data-date')) {
        e.preventDefault();
        loadDate(el.getAttribute('data-date'));
        return;
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      var cur = datesEl.querySelector('li.active');
      if (!cur) return;
      var i = dates.indexOf(cur.getAttribute('data-date'));
      var next = e.key === 'ArrowUp' ? i - 1 : i + 1;   // 列表自上而下=新→旧：↑ 更新，↓ 更早
      if (next >= 0 && next < dates.length) {
        e.preventDefault();
        loadDate(dates[next]);
        datesEl.querySelector('li.active').scrollIntoView({ block: 'nearest' });
      }
    });
  }

  init();
})();
