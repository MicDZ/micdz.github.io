// Abstract popup and sup tooltip functionality
(function () {
  const popup = document.createElement('div');
  popup.className = 'ref-hover-popup';
  document.body.appendChild(popup);

  const isTouch = (('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches);

  let currentLink = null;
  let hoverOnPopup = false;
  let hideTimer = null;

  function clearHideTimer() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }
  function scheduleHide() {
    clearHideTimer();
    hideTimer = setTimeout(() => { if (!hoverOnPopup) hide(); }, 120);
  }

  // 仅在非触摸设备启用 hover 留驻
  popup.addEventListener('mouseenter', () => { if (!isTouch) { hoverOnPopup = true; clearHideTimer(); }});
  popup.addEventListener('mouseleave', () => { if (!isTouch) { hoverOnPopup = false; scheduleHide(); }});

  function positionAt(link) {
    const margin = 8;
    popup.style.visibility = 'hidden';
    popup.style.display = 'block';

    const rects = link.getClientRects();
    const linkRect = rects.length ? rects[rects.length - 1] : link.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    if (top + popupRect.height > vh - margin) top = linkRect.top - popupRect.height - margin;
    if (left < margin) left = margin;
    if (top < margin) top = Math.min(vh - popupRect.height - margin, linkRect.bottom + margin);

    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    popup.style.visibility = '';
  }

  function show(link) {
    const text = (link.dataset.abstract || '').trim();
    if (!text) return;
    clearHideTimer();
    popup.textContent = text; // 防注入
    positionAt(link);
    popup.style.display = 'block';
    currentLink = link;
  }

  function hide() {
    popup.style.display = 'none';
    popup.textContent = '';
    clearHideTimer();
    currentLink = null;
  }

  function bind(link) {
    // 非触摸：支持 hover 显示、移出延迟隐藏
    if (!isTouch) {
      link.addEventListener('mouseenter', () => { hoverOnPopup = false; show(link); });
      link.addEventListener('mouseleave', scheduleHide);
      link.addEventListener('focus', () => show(link));
      link.addEventListener('blur', scheduleHide);
    }
    // 触摸与桌面共用：点击切换开关
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (popup.style.display === 'block' && currentLink === link) {
        hide();
      } else {
        show(link);
      }
    });
  }

  document.querySelectorAll('.abstract-link').forEach(bind);

  // 点击空白处关闭（避免点链接自身或弹窗内误关闭）
  document.addEventListener('click', (e) => {
    if (popup.style.display !== 'block') return;
    const t = e.target;
    if (t.closest('.ref-hover-popup')) return;
    if (t.closest('.abstract-link')) return;
    hide();
  });

  // 滚动关闭：仅桌面启用，避免移动端点击后立刻收起
  if (!isTouch) window.addEventListener('scroll', hide, { passive: true });
  window.addEventListener('resize', hide);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

  // Sup tooltip
  const supPopup = document.createElement('div');
  supPopup.className = 'sup-tooltip';
  document.body.appendChild(supPopup);

  document.querySelectorAll('sup').forEach(function(sup) {
    const text = sup.textContent.trim();
    let tooltipText = '';
    if (text === '*') {
      tooltipText = 'Equal Contribution';
    } else if (text === '†') {
      tooltipText = 'Corresponding Author';
    }
    if (tooltipText) {
      sup.addEventListener('mouseenter', function() {
        supPopup.textContent = tooltipText;
        supPopup.style.visibility = 'hidden';
        supPopup.style.display = 'block';
        supPopup.style.left = '-9999px';
        supPopup.style.top = '-9999px';
        const rect = sup.getBoundingClientRect();
        const popupRect = supPopup.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        const margin = 8;
        let left = rect.left;
        let top = rect.bottom + margin;
        if (left + popupRect.width > vw - margin) left = Math.max(margin, vw - popupRect.width - margin);
        if (top + popupRect.height > vh - margin) top = rect.top - popupRect.height - margin;
        if (left < margin) left = margin;
        if (top < margin) top = Math.min(vh - popupRect.height - margin, rect.bottom + margin);
        supPopup.style.left = left + 'px';
        supPopup.style.top = top + 'px';
        supPopup.style.visibility = '';
      });
      sup.addEventListener('mouseleave', function() {
        supPopup.style.display = 'none';
      });
    }
  });
})();

// Avatar decryption functionality
(function () {
  const el = document.getElementById('avatarImg');
  if (!el) return;

  const encUrl = (el.dataset.encryptedUrl || '').trim();
  const b64BlobInline = (el.dataset.encryptedBlob || '').trim();
  const b64Iv = (el.dataset.encryptedIv || '').trim();
  const mime = (el.dataset.mime || 'image/png').trim();

  if ((!encUrl && !b64BlobInline) || !b64Iv) return;

  // 支持 ?key=xxx 或 #key=xxx
  const hsKey = new URLSearchParams((window.location.hash || '').replace(/^#/, '')).get('key');
  console.log('hsKey:', hsKey);
  const pass = (hsKey || '').trim();
  if (!pass) return;
  console.log('Attempting to decrypt avatar with provided key...');
  const b64Normalize = (b64) => {
    let s = (b64 || '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4;
    if (pad) s += '='.repeat(4 - pad);
    return s;
  };

  const b64ToU8 = (b64) => {
    const str = atob(b64Normalize(b64));
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
    return out;
  };

  (async () => {
    try {
      // 拉取/获取密文
      let cipherU8;
      if (encUrl) {
        const resp = await fetch(encUrl, { cache: 'no-store' });
        if (!resp.ok) throw new Error('fetch encrypted blob failed');
        const txt = await resp.text();              // 服务器提供的 base64 文本
        cipherU8 = b64ToU8(txt);
      } else {
        cipherU8 = b64ToU8(b64BlobInline);          // 回退到内嵌 base64
      }

      // 口令派生密钥并解密
      const passBytes = new TextEncoder().encode(pass);
      const hash = await crypto.subtle.digest('SHA-256', passBytes); // 32B key
      const key = await crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['decrypt']);
      const iv = b64ToU8(b64Iv);
      console.log('iv:', iv);
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherU8);
      console.log('Avatar decrypted successfully.');
      // 替换头像
      const url = URL.createObjectURL(new Blob([plainBuf], { type: mime || 'application/octet-stream' }));
      el.src = url;
      el.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 3000), { once: true });
    } catch (e) {
      // 解密失败或获取失败则保持公开头像
      console.error('Decrypt avatar failed:', e);
    }
  })();
})();

// Weekly calendar from ICS
(function () {
  const container = document.getElementById('weeklyCalendar');
  if (!container) return;

  const icsUrl = (container.dataset.icsUrl || '/asset/calendar.ics').trim();
  const startHour = 9;
  const endHour = 18;
  const slotHeight = 60;
  const hours = endHour - startHour;
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  container.style.setProperty('--slot-height', slotHeight + 'px');
  container.style.setProperty('--hours', hours);

  function startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - day);
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function formatDate(d) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function formatTime(d) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function unfoldIcs(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const out = [];
    for (const line of lines) {
      if (!line) continue;
      if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
        out[out.length - 1] += line.slice(1);
      } else {
        out.push(line);
      }
    }
    return out;
  }

  function parseIcsDate(value) {
    const v = value.trim();
    if (/^\d{8}$/.test(v)) {
      const y = Number(v.slice(0, 4));
      const m = Number(v.slice(4, 6)) - 1;
      const d = Number(v.slice(6, 8));
      return new Date(y, m, d);
    }
    const match = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]) - 1;
    const d = Number(match[3]);
    const hh = Number(match[4]);
    const mm = Number(match[5]);
    const ss = Number(match[6] || '0');
    const isUtc = Boolean(match[7]);
    if (isUtc) return new Date(Date.UTC(y, m, d, hh, mm, ss));
    return new Date(y, m, d, hh, mm, ss);
  }

  function parseIcs(text) {
    const lines = unfoldIcs(text);
    const events = [];
    let current = null;

    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') {
        current = {};
        continue;
      }
      if (line === 'END:VEVENT') {
        if (current && current.start) {
          if (!current.end) current.end = new Date(current.start.getTime() + 60 * 60 * 1000);
          events.push(current);
        }
        current = null;
        continue;
      }
      if (!current) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const namePart = line.slice(0, idx).toUpperCase();
      const value = line.slice(idx + 1);
      const name = namePart.split(';')[0];

      if (name === 'DTSTART') current.start = parseIcsDate(value);
      if (name === 'DTEND') current.end = parseIcsDate(value);
      if (name === 'SUMMARY') current.summary = value;
      if (name === 'DESCRIPTION') current.description = value;
      if (name === 'LOCATION') current.location = value;
    }
    return events;
  }

  function buildCalendarShell(weekStart) {
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'calendar-header';
    const empty = document.createElement('div');
    empty.className = 'time-header';
    header.appendChild(empty);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      day.setHours(0, 0, 0, 0);
      const cell = document.createElement('div');
      cell.className = 'day-header';
      if (day.getTime() === today.getTime()) {
        cell.classList.add('is-today');
      }
      cell.innerHTML = `${dayNames[i]}<span class="day-date">${formatDate(day)}</span>`;
      header.appendChild(cell);
    }
    container.appendChild(header);

    const body = document.createElement('div');
    body.className = 'calendar-body';

    const timeCol = document.createElement('div');
    timeCol.className = 'time-col';
    for (let h = startHour; h < endHour; h++) {
      const slot = document.createElement('div');
      slot.className = 'time-slot';
      slot.textContent = `${pad(h)}:00`;
      timeCol.appendChild(slot);
    }
    body.appendChild(timeCol);

    const dayCols = [];
    for (let i = 0; i < 7; i++) {
      const col = document.createElement('div');
      col.className = 'day-col';
      col.dataset.day = String(i);
      body.appendChild(col);
      dayCols.push(col);
    }

    container.appendChild(body);
    return dayCols;
  }

  function renderEvents(events, weekStart, dayCols) {
    const weekEnd = addDays(weekStart, 7);
    const visible = events.filter((ev) => ev.start && ev.end && ev.end > weekStart && ev.start < weekEnd);

    for (const col of dayCols) col.innerHTML = '';

    for (const ev of visible) {
      for (let i = 0; i < 7; i++) {
        const dayStart = addDays(weekStart, i);
        dayStart.setHours(startHour, 0, 0, 0);
        const dayEnd = addDays(weekStart, i);
        dayEnd.setHours(endHour, 0, 0, 0);

        if (ev.end <= dayStart || ev.start >= dayEnd) continue;

        const segStart = new Date(Math.max(ev.start, dayStart));
        const segEnd = new Date(Math.min(ev.end, dayEnd));
        if (segEnd <= segStart) continue;

        const minutesFromStart = (segStart - dayStart) / 60000;
        const durationMinutes = (segEnd - segStart) / 60000;
        const top = (minutesFromStart / 60) * slotHeight;
        const height = Math.max(18, (durationMinutes / 60) * slotHeight);

        const card = document.createElement('div');
        card.className = 'calendar-event';
        const title = document.createElement('div');
        title.className = 'event-title';
        title.textContent = ev.summary || 'Untitled';

        const meta = document.createElement('div');
        meta.className = 'event-meta';
        meta.textContent = `${formatTime(segStart)}–${formatTime(segEnd)}`;

        card.appendChild(title);
        card.appendChild(meta);
        if (ev.location) {
          const loc = document.createElement('div');
          loc.className = 'event-location';
          loc.textContent = ev.location;
          card.appendChild(loc);
        }
        card.style.top = `${top}px`;
        card.style.height = `${height}px`;
        dayCols[i].appendChild(card);
      }
    }
  }

  let eventsCache = [];
  let weekOffset = 0;

  function hasEventsInWeek(weekStart) {
    const weekEnd = addDays(weekStart, 7);
    return eventsCache.some((ev) => ev.start && ev.end && ev.end > weekStart && ev.start < weekEnd);
  }

  function updatePrevButton(weekStart) {
    const prevBtn = document.getElementById('calendarPrevBtn');
    if (!prevBtn) return;
    const prevWeekStart = addDays(weekStart, -7);
    const hasPrev = hasEventsInWeek(prevWeekStart);
    prevBtn.disabled = !hasPrev;
  }

  function updateNextButton(weekStart) {
    const nextBtn = document.getElementById('calendarNextBtn');
    if (!nextBtn) return;
    const nextWeekStart = addDays(weekStart, 7);
    const hasNext = hasEventsInWeek(nextWeekStart);
    nextBtn.disabled = !hasNext;
  }

  function renderWeek(offset) {
    weekOffset = offset;
    const weekStart = addDays(startOfWeek(new Date()), weekOffset * 7);
    const dayCols = buildCalendarShell(weekStart);
    renderEvents(eventsCache, weekStart, dayCols);
    updatePrevButton(weekStart);
    updateNextButton(weekStart);
  }

  async function init() {
    try {
      const resp = await fetch(icsUrl, { cache: 'no-store' });
      if (!resp.ok) throw new Error('ICS fetch failed');
      const text = await resp.text();
      eventsCache = parseIcs(text).filter((ev) => ev.start && ev.end);
      renderWeek(0);
    } catch (e) {
      const error = document.createElement('div');
      error.className = 'calendar-error';
      error.textContent = 'Calendar unavailable.';
      container.appendChild(error);
    }
  }

  const prevBtn = document.getElementById('calendarPrevBtn');
  const nextBtn = document.getElementById('calendarNextBtn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (prevBtn.disabled) return;
      renderWeek(weekOffset - 1);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      renderWeek(weekOffset + 1);
    });
  }

  init();
})();

// Calendar expand/collapse
(function () {
  const container = document.getElementById('weeklyCalendar');
  const btn = document.getElementById('calendarToggleBtn');
  if (!container || !btn) return;

  const collapsedClass = 'is-collapsed';
  const expandedClass = 'is-expanded';

  function syncText() {
    const expanded = container.classList.contains(expandedClass);
    btn.textContent = expanded ? 'Hide calendar' : 'Click to view calendar';
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const isExpanded = container.classList.contains(expandedClass);
    container.classList.toggle(expandedClass, !isExpanded);
    container.classList.toggle(collapsedClass, isExpanded);
    syncText();
  });

  syncText();
})();