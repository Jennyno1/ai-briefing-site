/* AI 简报 · 静态站渲染逻辑
 * 数据契约见 README.md；日期清单来自 data/manifest.json，单日数据来自 data/YYYY-MM-DD.json。
 * 纯 Vanilla JS，无第三方依赖，fetch 全部使用相对路径以适配 GitHub Pages 子路径部署。
 */
(function () {
  'use strict';

  const datesEl = document.getElementById('dates');
  const briefingEl = document.getElementById('briefing');

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 从文案末尾抽取「（来源）」尾注，拆成正文 + 来源
  function splitSource(text) {
    const m = /（([^（）]*)）\s*$/.exec(text);
    if (m) return { body: text.slice(0, m.index).trim(), source: m[1].trim() };
    return { body: text, source: '' };
  }

  function trackGroupHtml(label, items) {
    if (!items || !items.length) return '';
    const itemsHtml = items.map(function (it) {
      const parts = splitSource(it);
      const meta = parts.source
        ? '<div class="item-meta">来源：' + esc(parts.source) + '</div>'
        : '';
      return '<div class="item"><div class="item-body">' + esc(parts.body) + '</div>' + meta + '</div>';
    }).join('');
    return '<div class="group"><div class="group-title">' + esc(label) + '</div>' + itemsHtml + '</div>';
  }

  function vpCard(kind, title, vp) {
    if (!vp || !vp.text) return '';
    const quotes = (vp.quotes && vp.quotes.length)
      ? '<ul>' + vp.quotes.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul>'
      : '';
    return '<div class="vp-card vp-' + kind + '"><h4>' + esc(title) + '</h4>' +
      '<div class="vp-text">' + esc(vp.text) + '</div>' + quotes + '</div>';
  }

  function renderBriefing(data) {
    const date = data.date || '';
    const version = data.version || '';
    const points = data.points || [];
    const tracks = data.tracks || [];
    const consensus = data.consensus;
    const division = data.division;
    const reading = data.reading || [];
    const github = data.github || [];

    let html = '';

    // 头部：日期 + 版本 + 今日要点
    html += '<div class="brief-head"><div class="date">' + esc(date) + '</div>';
    if (version) html += '<div class="meta">' + esc(version) + '</div>';
    if (points.length) {
      html += '<ul class="points">' +
        points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') +
        '</ul>';
    }
    html += '</div>';

    // 三条赛道：赛道名以 JSON 实际字段 name 为准，按 news/insights/actions 分组
    tracks.forEach(function (t) {
      const name = t.name || t.key || '';
      const emoji = t.emoji ? esc(t.emoji) + ' ' : '';
      html += '<section class="track"><h3>' + emoji + esc(name) + '</h3>';
      html += trackGroupHtml('最新动态', t.news);
      html += trackGroupHtml('洞察发现', t.insights);
      html += trackGroupHtml('落地行动', t.actions);
      html += '</section>';
    });

    // 最大共识与分歧
    const vp = vpCard('consensus', '🔵 共识解读', consensus) +
               vpCard('division', '🔴 分歧解读', division);
    if (vp) html += '<div class="viewpoint">' + vp + '</div>';

    // 推荐阅读（标题 / 原文链接 / 来源）
    if (reading.length) {
      html += '<section class="reading"><h3>📖 推荐阅读</h3><ol>';
      reading.forEach(function (r) {
        const title = r.url
          ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.title) + '</a>'
          : esc(r.title);
        html += '<li>' + title + (r.source ? ' <span class="src">— ' + esc(r.source) + '</span>' : '') + '</li>';
      });
      html += '</ol></section>';
    }

    // GitHub 推荐
    if (github.length) {
      html += '<section class="reading"><h3>⭐ GitHub 推荐</h3><ol>';
      github.forEach(function (g) {
        const u = g.url || ('https://github.com/' + g.repo);
        const star = (g.stars != null) ? ' ⭐' + g.stars : '';
        html += '<li><a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(g.repo) + '</a>' + star +
          (g.note ? ' <span class="src">— ' + esc(g.note) + '</span>' : '') + '</li>';
      });
      html += '</ol></section>';
    }

    briefingEl.innerHTML = html;
  }

  function renderDates(dates, activeDate) {
    datesEl.innerHTML = dates.map(function (d) {
      return '<li data-date="' + esc(d) + '" class="' + (d === activeDate ? 'active' : '') + '">' + esc(d) + '</li>';
    }).join('');
  }

  async function loadDate(date) {
    briefingEl.innerHTML = '<p class="loading">正在加载 ' + esc(date) + ' 简报…</p>';
    try {
      const res = await fetch('data/' + date + '.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      renderBriefing(await res.json());
    } catch (err) {
      briefingEl.innerHTML = '<p class="loading">加载失败：' + esc(err.message) + '</p>';
    }
  }

  async function init() {
    let dates = [];
    try {
      const res = await fetch('data/manifest.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      dates = (await res.json()).slice().sort().reverse(); // ISO 日期字符串，倒序
    } catch (err) {
      datesEl.innerHTML = '<li class="loading">日期加载失败</li>';
      briefingEl.innerHTML = '<p class="loading">无法加载日期清单（data/manifest.json）：' + esc(err.message) + '</p>';
      return;
    }

    if (!dates.length) {
      briefingEl.innerHTML = '<p class="loading">日期清单为空</p>';
      return;
    }

    renderDates(dates, dates[0]);

    // 事件委托：点选日期
    datesEl.addEventListener('click', function (e) {
      const li = e.target.closest('li[data-date]');
      if (!li) return;
      const d = li.getAttribute('data-date');
      Array.prototype.forEach.call(datesEl.children, function (c) { c.classList.remove('active'); });
      li.classList.add('active');
      loadDate(d);
    });

    await loadDate(dates[0]); // 默认最新一天
  }

  init();
})();
