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

    let left = linkRect.left;
    let top = linkRect.bottom + margin;

    if (left + popupRect.width > vw - margin) left = Math.max(margin, vw - popupRect.width - margin);
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