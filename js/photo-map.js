(function () {
  const mapEls = {
    world: document.getElementById('photoMapWorld'),
    americas: document.getElementById('photoMapAmericas'),
    eastAsia: document.getElementById('photoMapEastAsia'),
    southeastAsia: document.getElementById('photoMapSoutheastAsia'),
    europe: document.getElementById('photoMapEurope'),
    usaCalifornia: document.getElementById('photoMapCalifornia'),
    usaNevada: document.getElementById('photoMapNevada'),
    usaNewYork: document.getElementById('photoMapNewYork'),
    usaDC: document.getElementById('photoMapDC')
  };

  if (!mapEls.world || !mapEls.americas || !mapEls.eastAsia || !mapEls.southeastAsia || !mapEls.europe ||
      !mapEls.usaCalifornia || !mapEls.usaNevada || !mapEls.usaNewYork || !mapEls.usaDC) return;

  const dataUrl = mapEls.world.getAttribute('data-locations-url') || '/assets/maps/locations.json';
  const chinaGeoUrl = mapEls.world.getAttribute('data-china-geo-url') || '/js/china-provinces-simplified.json';

  if (!window.Datamap || !window.d3) {
    console.warn('Datamaps or d3 is not loaded.');
    return;
  }

  function debugLog() {
    if (!window.PHOTO_MAP_DEBUG) return;
    const args = Array.prototype.slice.call(arguments);
    args.unshift('[photo-map]');
    console.log.apply(console, args);
  }

  function traceNow() {
    return (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? Number(performance.now().toFixed(1))
      : Date.now();
  }

  function traceLog(label, payload) {
    if (window.PHOTO_MAP_TRACE === false) return;
    const meta = {
      t: traceNow()
    };
    if (typeof mapState !== 'undefined' && mapState && mapState.active) {
      meta.activePane = mapState.active;
    }
    console.log('[photo-map:trace]', label, Object.assign(meta, payload || {}));
  }

  function bringToFront(selection) {
    selection.each(function () {
      if (this && this.parentNode) {
        this.parentNode.appendChild(this);
      }
    });
  }

  function ensureBubbleOnTop(map) {
    if (!map || !map.svg) return;
    const bubbleLayer = map.svg.select('.datamaps-bubbles, .bubbles');
    const outlineLayer = map.svg.select('g.china-outline');
    const hitLayer = map.svg.select('g.china-outline-hit');
    const overlayLayer = map.svg.select('g.photo-map-overlay');
    const svgNode = map.svg.node ? map.svg.node() : null;
    if (!svgNode) return;

    const moveLayers = () => {
      if (!outlineLayer.empty()) {
        svgNode.appendChild(outlineLayer.node());
        outlineLayer.style('pointer-events', 'none');
        outlineLayer.selectAll('path').style('pointer-events', 'none');
      }
      if (!hitLayer.empty()) {
        svgNode.appendChild(hitLayer.node());
      }
      if (!bubbleLayer.empty()) {
        svgNode.appendChild(bubbleLayer.node());
        bubbleLayer.style('pointer-events', 'all');
        bubbleLayer.selectAll('.datamaps-bubble, .bubble').style('pointer-events', 'all');
      }
      if (!overlayLayer.empty()) {
        svgNode.appendChild(overlayLayer.node());
      }
    };

    moveLayers();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(moveLayers);
    }

    if (window.PHOTO_MAP_DEBUG) {
      const order = [];
      if (svgNode && svgNode.childNodes) {
        Array.prototype.forEach.call(svgNode.childNodes, (node) => {
          if (!node || node.nodeType !== 1) return;
          const cls = node.getAttribute ? node.getAttribute('class') : '';
          order.push({ tag: node.tagName, className: cls });
        });
      }
      debugLog('svg layer order', { map: map.__name || 'unknown', order });
    }
  }

  const WorldDatamap = window.Datamap;
  let usaLoadPromise = null;
  let chinaGeoPromise = null;

  function loadUsaDatamap() {
    if (usaLoadPromise) return usaLoadPromise;
    usaLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/datamaps/0.5.9/datamaps.usa.min.js';
      script.async = true;
      script.onload = function () {
        const UsaDatamap = window.Datamap;
        window.Datamap = WorldDatamap;
        resolve(UsaDatamap);
      };
      script.onerror = function () {
        reject(new Error('Failed to load Datamaps USA script.'));
      };
      document.head.appendChild(script);
    });
    return usaLoadPromise;
  }

  function loadChinaGeo() {
    if (chinaGeoPromise) return chinaGeoPromise;
    if (window.PHOTO_MAP_DEBUG) {
      console.log('[photo-map] china geo url', chinaGeoUrl);
    }
    const cacheBuster = `v=${Date.now()}`;
    const url = chinaGeoUrl.includes('?') ? `${chinaGeoUrl}&${cacheBuster}` : `${chinaGeoUrl}?${cacheBuster}`;
    chinaGeoPromise = fetch(url, { cache: 'no-store' })
      .then((res) => {
        if (window.PHOTO_MAP_DEBUG) {
          console.log('[photo-map] china geo status', res.status);
        }
        return res.json();
      })
      .catch((err) => {
        if (window.PHOTO_MAP_DEBUG) {
          console.warn('[photo-map] china geo fetch failed', err);
        }
        return null;
      });
    return chinaGeoPromise;
  }

  const popup = document.createElement('div');
  popup.className = 'ref-hover-popup photo-map-popup';
  popup.style.display = 'none';
  document.body.appendChild(popup);

  const modal = document.createElement('div');
  modal.className = 'photo-map-modal';
  modal.innerHTML = '<div class="photo-map-modal-card"><button type="button" class="photo-map-modal-close" aria-label="Close">x</button><div class="photo-map-modal-body"></div></div>';
  document.body.appendChild(modal);

  const modalBody = modal.querySelector('.photo-map-modal-body');
  const modalClose = modal.querySelector('.photo-map-modal-close');
  if (modalClose) {
    modalClose.addEventListener('click', hideModal);
  }
  modal.addEventListener('click', function (evt) {
    if (evt && evt.target === modal) {
      hideModal();
    }
  });
  document.addEventListener('keydown', function (evt) {
    if (!evt || evt.key !== 'Escape') return;
    if (modal.classList.contains('is-open')) {
      hideModal();
    }
  });

  const imageCache = new Map();
  let popupToken = 0;

  function positionPopup(evt) {
    if (!evt) return;
    const margin = 12;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    let left = evt.pageX + margin;
    let top = evt.pageY + margin;

    const rect = popup.getBoundingClientRect();
    if (left + rect.width > vw - margin) {
      left = evt.pageX - rect.width - margin;
    }
    if (left < margin) left = margin;
    if (top + rect.height > vh - margin) top = Math.max(margin, vh - rect.height - margin);

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  function updateOverlayBounds(scopeEl) {
    if (!scopeEl) return;
    const frames = scopeEl.querySelectorAll('.photo-map-frame');
    frames.forEach((frame) => {
      const img = frame.querySelector('img');
      if (!img) return;
      const applyBounds = () => {
        const left = img.offsetLeft;
        const width = img.clientWidth;
        frame.style.setProperty('--overlay-left', `${left}px`);
        frame.style.setProperty('--overlay-width', `${width}px`);
      };
      if (img.complete) {
        requestAnimationFrame(applyBounds);
      } else {
        img.addEventListener('load', applyBounds, { once: true });
      }
    });
  }

  function showPopup(html, evt) {
    popup.innerHTML = html;
    popup.style.display = 'block';
    positionPopup(evt);
    requestAnimationFrame(() => updateOverlayBounds(popup));
  }

  function hidePopup() {
    popup.style.display = 'none';
    popup.innerHTML = '';
  }

  function showModal(html) {
    if (!modalBody) return;
    modalBody.innerHTML = html;
    modal.classList.add('is-open');
    requestAnimationFrame(() => updateOverlayBounds(modalBody));
  }

  function hideModal() {
    if (modalBody) modalBody.innerHTML = '';
    modal.classList.remove('is-open');
  }

  function loadImage(src, cb) {
    if (imageCache.has(src)) {
      cb(imageCache.get(src));
      return;
    }

    const img = new Image();
    img.onload = function () {
      imageCache.set(src, img);
      cb(img);
    };
    img.onerror = function () {
      imageCache.set(src, null);
      cb(null);
    };
    img.src = src;
  }

  function loadImageAsync(src) {
    return new Promise((resolve) => {
      loadImage(src, (img) => resolve(img));
    });
  }

  const mapInstances = {
    world: null,
    americas: null,
    eastAsia: null,
    southeastAsia: null,
    europe: null,
    usaCalifornia: null,
    usaNevada: null,
    usaNewYork: null,
    usaDC: null
  };

  let americasMapPromise = null;
  let eastAsiaMapPromise = null;

  const mapState = {
    active: 'world',
    selectedStates: new Set()
  };

  function bindPaneTransitionTrace(name, el) {
    if (!el || el.__photoMapTraceBound) return;
    el.__photoMapTraceBound = true;
    const onTransition = (evt, stage) => {
      if (!evt) return;
      if (evt.propertyName !== 'opacity' && evt.propertyName !== 'transform' && evt.propertyName !== 'visibility') return;
      traceLog(`pane-${stage}`, {
        pane: name,
        property: evt.propertyName,
        isActiveClass: el.classList.contains('is-active')
      });
    };
    el.addEventListener('transitionstart', (evt) => onTransition(evt, 'transitionstart'));
    el.addEventListener('transitionend', (evt) => onTransition(evt, 'transitionend'));
    el.addEventListener('transitioncancel', (evt) => onTransition(evt, 'transitioncancel'));
  }

  bindPaneTransitionTrace('world', mapEls.world);
  bindPaneTransitionTrace('eastAsia', mapEls.eastAsia);

  const AMERICAS = new Set([
    'CAN', 'USA', 'MEX', 'GTM', 'BLZ', 'HND', 'SLV', 'NIC', 'CRI', 'PAN',
    'BHS', 'CUB', 'HTI', 'DOM', 'JAM', 'TTO', 'BRB', 'ATG', 'DMA', 'GRD',
    'KNA', 'LCA', 'VCT', 'GRL', 'COL', 'VEN', 'GUY', 'SUR', 'ECU', 'PER',
    'BRA', 'BOL', 'PRY', 'URY', 'ARG', 'CHL'
  ]);

  const NORTH_AMERICA = new Set([
    'CAN', 'USA', 'MEX', 'GTM', 'BLZ', 'HND', 'SLV', 'NIC', 'CRI', 'PAN',
    'BHS', 'CUB', 'HTI', 'DOM', 'JAM', 'TTO', 'BRB', 'ATG', 'DMA', 'GRD',
    'KNA', 'LCA', 'VCT', 'GRL'
  ]);

  const bounds = {
    americas: { latMin: -60, latMax: 75, lngMin: -170, lngMax: -30 },
     eastAsia: { latMin: -15, latMax: 65, lngMin: 60, lngMax: 180 },
    southeastAsia: { latMin: -15, latMax: 25, lngMin: 90, lngMax: 140 },
    usa: { latMin: 24, latMax: 50, lngMin: -125, lngMax: -66 },
    europe: { latMin: 34, latMax: 72, lngMin: -25, lngMax: 45 },
    california: { latMin: 32, latMax: 42.5, lngMin: -124.5, lngMax: -114 },
    nevada: { latMin: 35, latMax: 42.2, lngMin: -120.2, lngMax: -114 },
    newYork: { latMin: 40.4, latMax: 45.1, lngMin: -79.9, lngMax: -71.8 },
    dc: { latMin: 38.8, latMax: 39.1, lngMin: -77.2, lngMax: -76.9 }
  };

  const resetControl = document.querySelector('[data-map-action="back-world-inner"]');
  const paneTransitionDuration = 520;
  const chinaZoomDuration = 800;
  const usaZoomDuration = 420;
  const githubUser = 'MicDZ';
  const githubProfileUrl = `https://api.github.com/users/${githubUser}`;
  const githubProfilePageUrl = `https://github.com/${githubUser}`;
  const githubGeocodeUrl = 'https://nominatim.openstreetmap.org/search';
  const githubLocationCacheKey = 'photoMap.githubLocation.v1';
  const githubLocationCacheTtlMs = 6 * 60 * 60 * 1000;
  let githubLiveLocation = null;

  function readGithubLocationCache() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(githubLocationCacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (!parsed.locationText || typeof parsed.locationText !== 'string') return null;
      if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeGithubLocationCache(cache) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(githubLocationCacheKey, JSON.stringify(cache));
    } catch (_) {
      // Ignore cache write failures.
    }
  }

  function toGithubMarker(cache) {
    if (!cache) return null;
    return {
      name: `${githubUser} (GitHub)`,
      locationText: cache.locationText,
      latitude: cache.lat,
      longitude: cache.lng,
      fetchedAt: cache.fetchedAt || Date.now()
    };
  }

  function fetchGithubProfileLocationText() {
    return fetch(githubProfileUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json'
      }
    }).then((res) => {
      if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status}`);
      }
      return res.json();
    }).then((profile) => {
      const text = profile && typeof profile.location === 'string' ? profile.location.trim() : '';
      return text;
    });
  }

  function geocodeLocationText(locationText) {
    const url = `${githubGeocodeUrl}?format=json&limit=1&q=${encodeURIComponent(locationText)}`;
    return fetch(url, {
      cache: 'no-store'
    }).then((res) => {
      if (!res.ok) {
        throw new Error(`Geocode API error: ${res.status}`);
      }
      return res.json();
    }).then((rows) => {
      if (!Array.isArray(rows) || !rows.length) return null;
      const first = rows[0] || {};
      const lat = Number(first.lat);
      const lng = Number(first.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    });
  }

  function updateGithubLocationMarker() {
    const cached = readGithubLocationCache();
    return fetchGithubProfileLocationText()
      .then((locationText) => {
        if (!locationText) return null;
        const isCacheFresh = cached && cached.locationText === locationText && (Date.now() - (cached.fetchedAt || 0) < githubLocationCacheTtlMs);
        if (isCacheFresh) {
          return toGithubMarker(cached);
        }
        return geocodeLocationText(locationText)
          .then((geo) => {
            if (!geo) {
              if (cached && cached.locationText === locationText) return toGithubMarker(cached);
              return null;
            }
            const nextCache = {
              locationText,
              lat: geo.lat,
              lng: geo.lng,
              fetchedAt: Date.now()
            };
            writeGithubLocationCache(nextCache);
            return toGithubMarker(nextCache);
          });
      })
      .catch((err) => {
        console.warn('[photo-map] github location update failed', err);
        return cached ? toGithubMarker(cached) : null;
      })
      .then((marker) => {
        githubLiveLocation = marker;
        return marker;
      });
  }

  function refreshAllMapBubbles() {
    Object.keys(mapInstances).forEach((key) => {
      if (!mapInstances[key]) return;
      if (!mapInstances[key].__bubbleConfig) return;
      refreshMapBubbles(key);
    });
  }

  function scheduleEastAsiaBubbleRefresh(map, delay) {
    if (!map) {
      refreshMapBubbles('eastAsia');
      return;
    }
    if (map.__eastAsiaBubbleRefreshTimer) {
      clearTimeout(map.__eastAsiaBubbleRefreshTimer);
      map.__eastAsiaBubbleRefreshTimer = null;
    }
    map.__eastAsiaBubbleRefreshTimer = setTimeout(() => {
      map.__eastAsiaBubbleRefreshTimer = null;
      refreshMapBubbles('eastAsia');
    }, Math.max(0, delay));
  }

  function scheduleSwitchOnce(map, delay, fn) {
    if (!map) {
      fn();
      return;
    }
    if (map.__paneSwitchTimer) {
      clearTimeout(map.__paneSwitchTimer);
      map.__paneSwitchTimer = null;
    }
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    map.__paneSwitchToken = token;
    map.__paneSwitchTimer = setTimeout(() => {
      if (map.__paneSwitchToken !== token) return;
      map.__paneSwitchTimer = null;
      map.__paneSwitchToken = null;
      fn();
    }, Math.max(0, delay));
  }

  function zoomToGeoAndSwitch(sourceMap, geo, targetPaneKey, startSwitch) {
    if (!sourceMap || !sourceMap.svg || !geo) return startSwitch();
    const projection = sourceMap.projection || (sourceMap.path && sourceMap.path.projection ? sourceMap.path.projection() : null);
    if (!projection) return startSwitch();
    const path = d3.geo.path().projection(projection);
    const boundsBox = path.bounds(geo);
    if (!boundsBox || isNaN(boundsBox[0][0])) return startSwitch();

    const traceId = `${sourceMap.__name || mapState.active || 'unknown'}->${targetPaneKey}:${Date.now()}`;
    
    const svgNode = sourceMap.svg.node();
    const width = svgNode ? svgNode.clientWidth : 0;
    const height = svgNode ? svgNode.clientHeight : 0;
    if (!width || !height) return startSwitch();

    const dx = boundsBox[1][0] - boundsBox[0][0];
    const dy = boundsBox[1][1] - boundsBox[0][1];
    const x = (boundsBox[0][0] + boundsBox[1][0]) / 2;
    const y = (boundsBox[0][1] + boundsBox[1][1]) / 2;
    
    const scale = Math.max(1, Math.min(8, 0.8 / Math.max(dx / width, dy / height)));
    const translate = [width / 2 - scale * x, height / 2 - scale * y];
    const zoomDuration = 500;
    sourceMap.__zoomScale = scale;
    sourceMap.__zoomTranslate = translate;
    traceLog('zoomToGeoAndSwitch-start', {
      traceId,
      sourceMap: sourceMap.__name || 'unknown',
      targetPaneKey,
      geoId: geo && geo.id ? geo.id : null,
      scale,
      translate
    });
    
    const zoomTargets = sourceMap.svg.selectAll('.datamaps-subunits, .datamaps-bubbles, .bubbles, g.china-outline, g.china-outline-hit, g.photo-map-overlay');
    zoomTargets
      .transition().duration(zoomDuration).ease('cubic-in-out')
      .attr('transform', `translate(${translate[0]},${translate[1]})scale(${scale})`);
      
    const bubbles = sourceMap.svg.selectAll('.datamaps-bubble, .bubble');
    bubbles.each(function (d) {
      if (d && d.__baseRadius == null) {
        d.__baseRadius = d.radius || Number(d3.select(this).attr('r')) || 0;
      }
    });
    bubbles.transition().duration(zoomDuration).ease('cubic-in-out').attr('r', (d) => {
        return (d.__baseRadius || d.radius || 0) / scale;
    });

    let switched = false;
    const runSwitch = () => {
      if (switched) return;
      switched = true;
      traceLog('zoomToGeoAndSwitch-beforeSwitch', {
        traceId,
        sourceMap: sourceMap.__name || 'unknown',
        targetPaneKey
      });
      startSwitch();
      traceLog('zoomToGeoAndSwitch-afterSwitch', {
        traceId,
        sourceMap: sourceMap.__name || 'unknown',
        targetPaneKey,
        activeAfterSwitch: mapState.active
      });
      setTimeout(() => {
        // Reset transforms after it's hidden
        sourceMap.svg.selectAll('.datamaps-subunits, .datamaps-bubbles, .bubbles, g.china-outline, g.china-outline-hit, g.photo-map-overlay')
          .attr('transform', '');
        bubbles.attr('r', (d) => d.__baseRadius || d.radius || 0);
        traceLog('zoomToGeoAndSwitch-resetHiddenSource', {
          traceId,
          sourceMap: sourceMap.__name || 'unknown',
          targetPaneKey
        });
      }, 800);
    };

    // Use a single switch trigger to avoid end-of-transition jitter from multi-element end events.
    scheduleSwitchOnce(sourceMap, zoomDuration + 20, runSwitch);
  }

  function zoomOutAndSwitch(sourceMap, targetPaneKey, startSwitch) {
    if (!sourceMap || !sourceMap.svg || !sourceMap.__zoomScale) return startSwitch();
    const zoomDuration = 500;
    sourceMap.__zoomScale = 1;
    sourceMap.__zoomTranslate = null;
    
    const zoomTargets = sourceMap.svg.selectAll('.datamaps-subunits, .datamaps-bubbles, .bubbles, g.china-outline, g.china-outline-hit, g.photo-map-overlay');
    zoomTargets
      .transition().duration(zoomDuration).ease('cubic-in-out')
      .attr('transform', 'translate(0,0)scale(1)');
      
    const bubbles = sourceMap.svg.selectAll('.datamaps-bubble, .bubble');
    bubbles.transition().duration(zoomDuration).ease('cubic-in-out').attr('r', (d) => d.__baseRadius || d.radius || 0);

    let switched = false;
    const runSwitch = () => {
      if (switched) return;
      switched = true;
      startSwitch();
    };

    scheduleSwitchOnce(sourceMap, zoomDuration + 20, runSwitch);
  }

  function bindUsaStateInteractions(datamap, locations, currentMapKey) {
    if (!datamap || !datamap.svg) return;
    let hoverState = null;
    const setStateFill = (stateId, fillKey) => {
      if (!stateId) return;
      datamap.updateChoropleth({ [stateId]: { fillKey } });
    };
    const setHoverState = (stateId) => {
      if (hoverState && hoverState !== stateId) {
        setStateFill(hoverState, 'defaultFill');
      }
      hoverState = stateId;
      setStateFill(stateId, 'stateHighlight');
    };
    const clearHoverState = (stateId) => {
      if (!hoverState) return;
      if (!stateId || hoverState === stateId) {
        setStateFill(hoverState, 'defaultFill');
        hoverState = null;
      }
    };

    datamap.svg.selectAll('.datamaps-subunit')
      .on('mouseover', function (geo) {
        if (!geo || !geo.id) return;
        if (!USA_FOCUS_STATES.has(geo.id)) return;
        setHoverState(geo.id);
      })
      .on('mouseout', function (geo) {
        if (!geo || !geo.id) return;
        if (!USA_FOCUS_STATES.has(geo.id)) return;
        clearHoverState(geo.id);
      })
      .on('click', function (geo) {
        if (d3.event && typeof d3.event.stopPropagation === 'function') {
          d3.event.stopPropagation();
        }
        if (!geo || !geo.id) return;
        const focusConfig = USA_FOCUS_STATES.get(geo.id);
        if (!focusConfig) return;
        zoomUsaState(datamap, geo);
      });

    datamap.svg.on('mouseleave', function () {
      clearHoverState();
    });

    datamap.svg.on('click.usaReset', function () {
      if (d3.event && d3.event.defaultPrevented) return;
      if (!datamap.__usaFocusedState) return;
      resetUsaStateZoom(datamap);
    });
  }

  function applyUsaZoom(map, scale, translate, animate) {
    if (!map || !map.svg) return;
    const tx = translate[0];
    const ty = translate[1];
    const zoomTargets = map.svg.selectAll('.datamaps-subunits, .datamaps-bubbles, .bubbles, g.photo-map-overlay');
    const bubbles = map.svg.selectAll('.datamaps-bubble, .bubble');

    // Stop in-flight transforms so rapid state switching remains smooth.
    zoomTargets.interrupt();
    bubbles.interrupt();

    bubbles.each(function (d) {
      if (d && d.__baseRadius == null) {
        d.__baseRadius = d.radius || Number(d3.select(this).attr('r')) || 0;
      }
    });

    map.__zoomScale = scale;
    map.__zoomTranslate = translate;

    if (animate && usaZoomDuration > 0) {
      zoomTargets
        .transition().duration(usaZoomDuration).ease('cubic-in-out')
        .attr('transform', `translate(${tx},${ty})scale(${scale})`);
      bubbles
        .transition().duration(usaZoomDuration).ease('cubic-in-out')
        .attr('r', (d) => {
          if (!d || !d.__baseRadius) return d && d.radius ? d.radius : 0;
          return d.__baseRadius / scale;
        });
    } else {
      zoomTargets.attr('transform', `translate(${tx},${ty})scale(${scale})`);
      bubbles.attr('r', (d) => {
        if (!d || !d.__baseRadius) return d && d.radius ? d.radius : 0;
        return d.__baseRadius / scale;
      });
    }

    if (map.__bubbleConfig) {
      renderGithubMarkerArrow(map, map.__bubbleConfig.filterFn);
    }
    ensureBubbleOnTop(map);
  }

  function zoomUsaState(map, geo) {
    if (!map || !map.svg || !geo) return;
    const projection = map.projection || (map.path && map.path.projection ? map.path.projection() : null);
    if (!projection) return;
    const path = d3.geo.path().projection(projection);
    const boundsBox = path.bounds(geo);
    if (!boundsBox || isNaN(boundsBox[0][0])) return;

    const svgNode = map.svg.node();
    const width = svgNode ? svgNode.clientWidth : 0;
    const height = svgNode ? svgNode.clientHeight : 0;
    if (!width || !height) return;

    const dx = boundsBox[1][0] - boundsBox[0][0];
    const dy = boundsBox[1][1] - boundsBox[0][1];
    const x = (boundsBox[0][0] + boundsBox[1][0]) / 2;
    const y = (boundsBox[0][1] + boundsBox[1][1]) / 2;
    const scale = Math.max(1, Math.min(8, 0.88 / Math.max(dx / width, dy / height)));
    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    map.__usaFocusedState = geo.id;
    applyUsaZoom(map, scale, translate, true);
  }

  function resetUsaStateZoom(map) {
    if (!map || !map.svg) return;
    map.__usaFocusedState = null;
    applyUsaZoom(map, 1, [0, 0], true);
  }

  function setActivePane(name) {
    traceLog('setActivePane-enter', { nextPane: name });

    if (mapState.active === 'americas' && name !== 'americas' && mapInstances.americas && mapInstances.americas.__usaFocusedState) {
      resetUsaStateZoom(mapInstances.americas);
    }

    mapState.active = name;
    Object.entries(mapEls).forEach(([key, el]) => {
      if (!el) return;
      el.classList.toggle('is-active', key === name);
    });
    if (resetControl) {
      resetControl.style.display = name === 'world' ? 'none' : 'inline-flex';
      resetControl.setAttribute('aria-hidden', name === 'world' ? 'true' : 'false');
    }

    const immediatePaneUpdate = new Set([
      'americas',
      'eastAsia',
      'southeastAsia',
      'europe',
      'usaCalifornia',
      'usaNevada',
      'usaNewYork',
      'usaDC'
    ]);
    const paneUpdateDelay = immediatePaneUpdate.has(name) ? 0 : paneTransitionDuration;

    if (name === 'americas' && mapInstances.americas) {
      setTimeout(() => mapInstances.americas.resize(), paneUpdateDelay);
      setTimeout(() => refreshMapBubbles('americas'), paneUpdateDelay);
    }
    if (name === 'eastAsia' && mapInstances.eastAsia) {
      setTimeout(() => mapInstances.eastAsia.resize(), paneUpdateDelay);
      setTimeout(() => refreshMapBubbles('eastAsia'), paneUpdateDelay);
      setTimeout(() => ensureChinaOutline(mapInstances.eastAsia), paneUpdateDelay);
    }
    if (name === 'southeastAsia' && mapInstances.southeastAsia) {
      setTimeout(() => mapInstances.southeastAsia.resize(), paneUpdateDelay);
      setTimeout(() => refreshMapBubbles('southeastAsia'), paneUpdateDelay);
    }
    if (name === 'europe' && mapInstances.europe) {
      setTimeout(() => mapInstances.europe.resize(), paneUpdateDelay);
      setTimeout(() => refreshMapBubbles('europe'), paneUpdateDelay);
    }
    if (name === 'usaCalifornia' && mapInstances.usaCalifornia) {
      setTimeout(() => mapInstances.usaCalifornia.resize(), paneUpdateDelay);
      setTimeout(() => refreshMapBubbles('usaCalifornia'), paneUpdateDelay);
    }
    if (name === 'usaNevada' && mapInstances.usaNevada) {
      setTimeout(() => mapInstances.usaNevada.resize(), paneUpdateDelay);
      setTimeout(() => refreshMapBubbles('usaNevada'), paneUpdateDelay);
    }
    if (name === 'usaNewYork' && mapInstances.usaNewYork) {
      setTimeout(() => mapInstances.usaNewYork.resize(), paneUpdateDelay);
      setTimeout(() => refreshMapBubbles('usaNewYork'), paneUpdateDelay);
    }
    if (name === 'usaDC' && mapInstances.usaDC) {
      setTimeout(() => mapInstances.usaDC.resize(), paneUpdateDelay);
      setTimeout(() => refreshMapBubbles('usaDC'), paneUpdateDelay);
    }

    const activePanes = Object.entries(mapEls)
      .filter(([, el]) => el && el.classList.contains('is-active'))
      .map(([key]) => key);
    traceLog('setActivePane-exit', {
      nextPane: name,
      activePanes
    });
  }

  function bindControlEvents(locations) {
    if (resetControl) {
      resetControl.addEventListener('click', () => {
        if (mapState.active === 'americas') {
          const americasMap = mapInstances.americas;
          if (americasMap && americasMap.__usaFocusedState) {
            resetUsaStateZoom(americasMap);
            return;
          }
        }

        if (mapState.active === 'usaCalifornia' || mapState.active === 'usaNevada' ||
            mapState.active === 'usaNewYork' || mapState.active === 'usaDC') {
          const map = mapInstances[mapState.active];
          if (map && map.__zoomScale) {
             zoomOutAndSwitch(map, 'americas', () => setActivePane('americas'));
          } else {
             setActivePane('americas');
          }
          return;
        }

        if (mapState.active === 'eastAsia') {
          const eastAsiaMap = mapInstances.eastAsia;
          if (eastAsiaMap && eastAsiaMap.__zoomScale && eastAsiaMap.__zoomScale > 1) {
            resetChinaZoom(eastAsiaMap);
            return;
          }
        }

        const map = mapInstances[mapState.active];
        if (map && map.__zoomScale) {
            zoomOutAndSwitch(map, 'world', () => setActivePane('world'));
        } else {
            zoomOutAndSwitch(mapInstances.americas, 'world', () => setActivePane('world'));
        }
      });
    }
  }

  const EAST_ASIA = new Set([
    'CHN', 'MNG', 'KOR', 'PRK', 'JPN', 'TWN', 'HKG', 'MAC'
  ]);

  const SOUTHEAST_ASIA = new Set([
    'MMR', 'THA', 'LAO', 'KHM', 'VNM', 'MYS', 'SGP', 'IDN', 'PHL', 'BRN',
    'TLS'
  ]);

  const EUROPE = new Set([
    'ALB', 'AND', 'AUT', 'BEL', 'BGR', 'BIH', 'BLR', 'CHE', 'CZE', 'DEU',
    'DNK', 'ESP', 'EST', 'FIN', 'FRA', 'GBR', 'GRC', 'HRV', 'HUN', 'IRL',
    'ISL', 'ITA', 'LTU', 'LUX', 'LVA', 'MCO', 'MDA', 'MKD', 'MLT', 'MNE',
    'NLD', 'NOR', 'POL', 'PRT', 'ROU', 'RUS', 'SRB', 'SVK', 'SVN', 'SWE',
    'UKR'
  ]);

  const USA_FOCUS_STATES = new Map([
    ['CA', { mapKey: 'usaCalifornia', center: [-119.5, 37.8], scale: 4.2, boundsKey: 'california' }],
    ['NV', { mapKey: 'usaNevada', center: [-116.6, 38.6], scale: 4.8, boundsKey: 'nevada' }],
    ['NY', { mapKey: 'usaNewYork', center: [-75.3, 42.9], scale: 5.2, boundsKey: 'newYork' }],
    ['DC', { mapKey: 'usaDC', center: [-77.0, 38.9], scale: 9.5, boundsKey: 'dc' }]
  ]);

  function buildBubbles(locations, filterFn, radius) {
    return locations
      .filter(filterFn || (() => true))
      .map((loc) => ({
        name: loc.name,
        latitude: loc.lat,
        longitude: loc.lng,
        radius: Math.max(2, (radius || 6) * 0.82),
        fillKey: 'pin',
        photo_src: loc.photo_src,
        shot_time: loc.shot_time,
        exposure_time: loc.exposure_time,
        f_number: loc.f_number,
        iso: loc.iso,
        focal_length: loc.focal_length,
        camera_model: loc.camera_model,
        place_name: loc.place_name
      }));
  }

  function getClusterDistance(mapName, width, height, zoomScale) {
    const minDim = Math.min(width, height);
    const ratios = {
      world: 0.05,
      americas: 0.04,
      eastAsia: 0.032,
      southeastAsia: 0.032,
      europe: 0.032,
      usaCalifornia: 0.028,
      usaNevada: 0.028,
      usaNewYork: 0.028,
      usaDC: 0.02,
      usa: 0.03
    };
    const ratio = ratios[mapName] || 0.035;
    const baseDistance = Math.round(minDim * ratio);
    const scale = zoomScale && zoomScale > 1 ? Math.pow(zoomScale, 1.75) : 1;
    return Math.max(1, Math.round(baseDistance / scale));
  }

  function buildClusteredBubbles(locations, mapName, map, filterFn, radius) {
    const projection = map && (map.projection || (map.path && map.path.projection && map.path.projection()));
    if (!projection) {
      return buildBubbles(locations, filterFn, radius);
    }

    const filtered = locations.filter(filterFn || (() => true));
    const svgNode = map.svg && map.svg.node ? map.svg.node() : null;
    const width = svgNode ? svgNode.clientWidth : mapEls[mapName].offsetWidth;
    const height = svgNode ? svgNode.clientHeight : mapEls[mapName].offsetHeight;
    const zoomScale = map && map.__zoomScale ? map.__zoomScale : 1;
    const distance = getClusterDistance(mapName, width || 0, height || 0, zoomScale);
    if (mapName === 'eastAsia' && window.PHOTO_MAP_DEBUG) {
      debugLog('cluster distance', {
        zoomScale,
        distance,
        width: width || 0,
        height: height || 0,
        points: filtered.length
      });
    }
    const clusters = [];

    filtered.forEach((loc) => {
      const coords = projection([loc.lng, loc.lat]);
      if (!coords || Number.isNaN(coords[0]) || Number.isNaN(coords[1])) return;
      let found = null;
      for (let i = 0; i < clusters.length; i += 1) {
        const dx = coords[0] - clusters[i].x;
        const dy = coords[1] - clusters[i].y;
        if ((dx * dx + dy * dy) <= (distance * distance)) {
          found = clusters[i];
          break;
        }
      }
      if (!found) {
        clusters.push({
          x: coords[0],
          y: coords[1],
          lat: loc.lat,
          lng: loc.lng,
          items: [loc]
        });
      } else {
        found.items.push(loc);
        const count = found.items.length;
        found.x = (found.x * (count - 1) + coords[0]) / count;
        found.y = (found.y * (count - 1) + coords[1]) / count;
        found.lat = (found.lat * (count - 1) + loc.lat) / count;
        found.lng = (found.lng * (count - 1) + loc.lng) / count;
      }
    });

    return clusters.map((cluster) => {
      const count = cluster.items.length;
      const zoomScaleFactor = zoomScale && zoomScale > 1 ? Math.pow(zoomScale, 0.9) : 1;
      const baseRadius = Math.max(2, (radius * 0.7) / zoomScaleFactor);
      const bubbleRadius = baseRadius + (count > 1 ? Math.min(5, 0.8 + Math.sqrt(count) * 0.8) : 0);
      const first = cluster.items[0];
      const bubble = {
        name: first.name,
        latitude: cluster.lat,
        longitude: cluster.lng,
        radius: bubbleRadius,
        fillKey: 'pin',
        items: cluster.items
      };
      if (count === 1) {
        bubble.photo_src = first.photo_src;
        bubble.shot_time = first.shot_time;
        bubble.exposure_time = first.exposure_time;
        bubble.f_number = first.f_number;
        bubble.iso = first.iso;
        bubble.focal_length = first.focal_length;
        bubble.camera_model = first.camera_model;
        bubble.place_name = first.place_name;
      }
      return bubble;
    });
  }

  function renderGithubMarkerArrow(map, filterFn) {
    if (!map || !map.svg) return;
    let overlayLayer = map.svg.select('g.photo-map-overlay');
    if (overlayLayer.empty()) {
      overlayLayer = map.svg.append('g').attr('class', 'photo-map-overlay');
    }
    overlayLayer.style('pointer-events', 'none');
    const svgNode = map.svg.node ? map.svg.node() : null;
    if (svgNode && overlayLayer.node()) {
      svgNode.appendChild(overlayLayer.node());
    }

    const arrowGroup = overlayLayer.selectAll('g.photo-map-github-arrow').data(githubLiveLocation ? [githubLiveLocation] : []);
    arrowGroup.exit().remove();
    if (!githubLiveLocation) return;

    const markerPoint = {
      lat: githubLiveLocation.latitude,
      lng: githubLiveLocation.longitude
    };
    if (filterFn && !filterFn(markerPoint)) {
      overlayLayer.selectAll('g.photo-map-github-arrow').remove();
      return;
    }

    const projection = map && (map.projection || (map.path && map.path.projection && map.path.projection()));
    if (!projection) {
      overlayLayer.selectAll('g.photo-map-github-arrow').remove();
      return;
    }
    const projected = projection([markerPoint.lng, markerPoint.lat]);
    if (!projected || Number.isNaN(projected[0]) || Number.isNaN(projected[1])) {
      overlayLayer.selectAll('g.photo-map-github-arrow').remove();
      return;
    }

    const zoomScale = map && map.__zoomScale && map.__zoomScale > 0 ? map.__zoomScale : 1;
    const sizeScale = 1 / Math.pow(zoomScale, 1.12);

    const tipX = projected[0];
    const tipY = projected[1];
    const tailX = tipX + 22 * sizeScale;
    const tailY = tipY + 18 * sizeScale;
    const dx = tipX - tailX;
    const dy = tipY - tailY;
    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const ux = dx / len;
    const uy = dy / len;
    const headSize = 8 * sizeScale;
    const headWidth = 4 * sizeScale;
    const baseX = tipX - ux * headSize;
    const baseY = tipY - uy * headSize;
    const px = -uy * headWidth;
    const py = ux * headWidth;
    const headPath = `M ${tipX} ${tipY} L ${baseX + px} ${baseY + py} L ${baseX - px} ${baseY - py} Z`;

    const enter = arrowGroup.enter()
      .append('g')
      .attr('class', 'photo-map-github-arrow');
    enter.append('line').attr('class', 'photo-map-github-arrow-line');
    enter.append('path').attr('class', 'photo-map-github-arrow-head');
    enter.append('text').attr('class', 'photo-map-github-arrow-label').text('I am here');

    const merged = overlayLayer.selectAll('g.photo-map-github-arrow');
    merged.select('line.photo-map-github-arrow-line')
      .attr('x1', tailX)
      .attr('y1', tailY)
      .attr('x2', tipX)
      .attr('y2', tipY)
      .style('stroke-width', `${2 * sizeScale}px`);
    merged.select('path.photo-map-github-arrow-head')
      .attr('d', headPath);
    merged.select('text.photo-map-github-arrow-label')
      .attr('x', tipX + 10 * sizeScale)
      .attr('y', tipY - 10 * sizeScale)
      .style('font-size', `${12 * sizeScale}px`)
      .style('stroke-width', `${2 * sizeScale}px`);
  }

  function renderMapBubbles(mapName, map, locations, filterFn, radius) {
    const bubbles = buildClusteredBubbles(locations, mapName, map, filterFn, radius);
    map.svg.selectAll('.datamaps-bubble, .bubble').remove();
    map.bubbles(bubbles, { popupOnHover: false });
    const bubbleLayer = map.svg.select('.datamaps-bubbles, .bubbles');
    if (!bubbleLayer.empty()) {
      bubbleLayer.style('pointer-events', 'all');
      ensureBubbleOnTop(map);
    }
    renderGithubMarkerArrow(map, filterFn);
    map.svg.selectAll('.datamaps-bubble, .bubble')
      .style('pointer-events', 'all');
    bindBubbleEvents(map);
    map.__bubbleConfig = { mapName, locations, filterFn, radius };
    map.__name = mapName;

    if (mapName === 'eastAsia' && window.PHOTO_MAP_DEBUG) {
      const bubbleNodes = [];
      map.svg.selectAll('.datamaps-bubble, .bubble').each(function () {
        bubbleNodes.push(this);
      });
      const first = bubbleNodes && bubbleNodes.length ? bubbleNodes[0] : null;
      const bbox = first && typeof first.getBBox === 'function' ? first.getBBox() : null;
      const peLayer = bubbleLayer.empty() ? null : bubbleLayer.style('pointer-events');
      const peBubble = first && first.style ? first.style.pointerEvents : null;
      debugLog('eastAsia bubble dom', {
        bubbleCount: bubbleNodes.length,
        layerPointerEvents: peLayer,
        bubblePointerEvents: peBubble,
        firstBBox: bbox ? { x: Math.round(bbox.x), y: Math.round(bbox.y), w: Math.round(bbox.width), h: Math.round(bbox.height) } : null
      });
    }

    if (mapName === 'eastAsia' && map && map.__zoomScale && map.__zoomScale !== 1 && map.__zoomTranslate) {
      applyChinaZoomImmediate(map, map.__zoomScale, map.__zoomTranslate);
      if (window.PHOTO_MAP_DEBUG) {
        debugLog('reapply china zoom after bubbles render', {
          zoomScale: map.__zoomScale,
          translate: map.__zoomTranslate
        });
      }
    }

    if (mapName === 'eastAsia' && window.PHOTO_MAP_DEBUG) {
      const projection = map && (map.projection || (map.path && map.path.projection && map.path.projection()));
      const sample = bubbles.slice(0, 3).map((b) => {
        const proj = projection ? projection([b.longitude, b.latitude]) : null;
        return {
          lat: b.latitude,
          lng: b.longitude,
          projX: proj ? Math.round(proj[0]) : null,
          projY: proj ? Math.round(proj[1]) : null,
          radius: b.radius,
          count: Array.isArray(b.items) ? b.items.length : 1
        };
      });
      debugLog('eastAsia bubbles rendered', {
        zoomScale: map.__zoomScale || 1,
        bubbleCount: bubbles.length,
        sample
      });

      setTimeout(() => {
        const bubbleLayer = map.svg.select('.datamaps-bubbles, .bubbles');
        debugLog('eastAsia bubble layer transform', {
          transform: bubbleLayer.empty() ? null : bubbleLayer.attr('transform')
        });
      }, 0);
    }
  }

  function refreshMapBubbles(mapName) {
    const map = mapInstances[mapName];
    if (!map || !map.__bubbleConfig) return;
    renderMapBubbles(mapName, map, map.__bubbleConfig.locations, map.__bubbleConfig.filterFn, map.__bubbleConfig.radius);
  }

  function bindBubbleEvents(map) {
    if (window.PHOTO_MAP_DEBUG && map && map.svg) {
      const svgNode = map.svg.node();
      if (svgNode && !svgNode.__photoMapDebugBound) {
        svgNode.__photoMapDebugBound = true;
        let lastLog = 0;
        map.svg.on('mousemove.photoMapDebug', function () {
          const now = Date.now();
          if (now - lastLog < 400) return;
          lastLog = now;
          const evt = d3.event;
          if (!evt) return;
          const x = evt.clientX;
          const y = evt.clientY;
          const topEl = document.elementFromPoint(x, y);
          const topClass = topEl && topEl.getAttribute ? topEl.getAttribute('class') : '';
          debugLog('pointer target', {
            map: map.__name || 'unknown',
            tag: topEl ? topEl.tagName : null,
            className: topClass
          });
        });
      }
    }
    map.svg.selectAll('.datamaps-bubble, .bubble')
      .on('mouseover', function (d) {
        const evt = d3.event;
        if (!d) return;
        if (d.__isGithubMarker) {
          const label = d.place_name ? String(d.place_name) : 'Unknown';
          showPopup(`<div class="photo-map-github-popup"><strong>${githubUser}</strong><div>${label}</div></div>`, evt);
          return;
        }
        if (window.PHOTO_MAP_DEBUG) {
          debugLog('bubble mouseover', {
            map: map && map.__name ? map.__name : 'unknown',
            targetClass: this && this.getAttribute ? this.getAttribute('class') : ''
          });
        }
        const items = Array.isArray(d.items) && d.items.length ? d.items : [d];
        const validItems = items.filter((item) => item && item.photo_src);
        if (!validItems.length) return;
        const token = ++popupToken;
        showPopup('<div class="photo-map-loading">Loading...</div>', evt);
        Promise.all(validItems.map((item) => loadImageAsync(item.photo_src)))
          .then((images) => {
            if (token !== popupToken) return;
            const html = buildClusterHtml(validItems, images, { limit: 6, showMoreNote: true });
            if (!html) {
              showPopup('<div class="photo-map-loading">Failed to load image.</div>', evt);
              return;
            }
            showPopup(html, evt);
          });
      })
      .on('click', function (d) {
        if (d3.event && typeof d3.event.stopPropagation === 'function') {
          d3.event.stopPropagation();
        }
        if (!d) return;
        if (d.__isGithubMarker) {
          if (typeof window !== 'undefined' && typeof window.open === 'function') {
            window.open(githubProfilePageUrl, '_blank', 'noopener,noreferrer');
          }
          return;
        }
        const items = Array.isArray(d.items) && d.items.length ? d.items : [d];
        const validItems = items.filter((item) => item && item.photo_src);
        if (!validItems.length) return;
        const token = ++popupToken;
        hidePopup();
        Promise.all(validItems.map((item) => loadImageAsync(item.photo_src)))
          .then((images) => {
            if (token !== popupToken) return;
            const html = buildClusterHtml(validItems, images, { limit: null, showMoreNote: false, frameLayout: 'card' });
            if (!html) return;
            showModal(html);
          });
      })
      .on('mousemove', function () {
        if (popup.style.display === 'none') return;
        positionPopup(d3.event);
      })
      .on('mouseout', function () {
        popupToken += 1;
        hidePopup();
      });
  }

  function buildClusterHtml(items, images, options) {
    const opts = options || {};
    const limit = typeof opts.limit === 'number' ? opts.limit : null;
    const showMoreNote = Boolean(opts.showMoreNote);
    const frameLayout = opts.frameLayout || 'overlay';
    const itemClass = frameLayout === 'card' ? 'photo-map-cluster-item photo-map-cluster-item-card' : 'photo-map-cluster-item';
    const totalCount = items.length;
    const displayCount = limit && totalCount > limit ? limit : totalCount;
    const blocks = [];
    items.slice(0, displayCount).forEach((item, idx) => {
      const img = images[idx];
      if (!img) return;
      const imgHtml = buildPhotoFrameHtml(item, { layout: frameLayout });
      blocks.push(`<div class="${itemClass}">${imgHtml}</div>`);
    });
    if (!blocks.length) return '';
    if (blocks.length === 1) return blocks[0];
    const extraClass = blocks.length > 4 ? ' photo-map-cluster-double' : '';
    const noteHtml = showMoreNote && totalCount > displayCount
      ? `<div class="photo-map-cluster-note">${totalCount - displayCount} more photos. Click to view all.</div>`
      : '';
    return `<div class="photo-map-cluster${extraClass}">${blocks.join('')}${noteHtml}</div>`;
  }

  function renderWorldMap(locations) {
    const map = new WorldDatamap({
      element: mapEls.world,
      fills: {
        defaultFill: '#d9d9d9',
        pin: '#c12f2f',
        githubPin: '#2ea043',
        naHighlight: '#bdbdbd',
        eastHighlight: '#c7c7c7',
        seaHighlight: '#cfcfcf',
        euHighlight: '#c3c3c3'
      },
      geographyConfig: {
        highlightOnHover: false,
        popupOnHover: false,
        borderColor: 'transparent',
        borderWidth: 0
      }
    });

    renderMapBubbles('world', map, locations, null, 6);

    const naHighlightData = {};
    const eastHighlightData = {};
    const seaHighlightData = {};
    const euHighlightData = {};
    NORTH_AMERICA.forEach((id) => {
      naHighlightData[id] = { fillKey: 'naHighlight' };
    });
    EAST_ASIA.forEach((id) => {
      eastHighlightData[id] = { fillKey: 'eastHighlight' };
    });
    SOUTHEAST_ASIA.forEach((id) => {
      seaHighlightData[id] = { fillKey: 'seaHighlight' };
    });
    EUROPE.forEach((id) => {
      euHighlightData[id] = { fillKey: 'euHighlight' };
    });

    map.svg.selectAll('.datamaps-subunit')
      .on('mouseover', function (geo) {
        if (!geo || !geo.id) return;
        if (AMERICAS.has(geo.id)) {
          map.updateChoropleth(naHighlightData);
        } else if (EAST_ASIA.has(geo.id)) {
          map.updateChoropleth(eastHighlightData);
        } else if (SOUTHEAST_ASIA.has(geo.id)) {
          map.updateChoropleth(seaHighlightData);
        } else if (EUROPE.has(geo.id)) {
          map.updateChoropleth(euHighlightData);
        }
      })
      .on('mouseout', function () {
        map.updateChoropleth({}, { reset: true });
      })
      .on('click', function (geo) {
        if (!geo || !geo.id) return;
        if (AMERICAS.has(geo.id)) {
          const startSwitch = () => {
            zoomToGeoAndSwitch(map, geo, 'americas', () => {
              setActivePane('americas');
            });
          };
          ensureAmericasMap(locations).then(startSwitch);
        } else if (EAST_ASIA.has(geo.id)) {
          traceLog('world-click-eastAsia', { geoId: geo.id });
          ensureEastAsiaMap(locations)
            .then(() => {
              setActivePane('eastAsia');
            })
            .catch((err) => {
              console.warn('[photo-map] ensure eastAsia map failed', err);
              setActivePane('eastAsia');
            });
        } else if (SOUTHEAST_ASIA.has(geo.id)) {
          ensureSoutheastAsiaMap(locations);
          zoomToGeoAndSwitch(map, geo, 'southeastAsia', () => {
            setActivePane('southeastAsia');
          });
        } else if (EUROPE.has(geo.id)) {
          ensureEuropeMap(locations);
          zoomToGeoAndSwitch(map, geo, 'europe', () => {
            setActivePane('europe');
          });
        }
      });

    mapInstances.world = map;
    setTimeout(() => map.resize(), 0);
  }

  let resizeTimer = null;

  function resizeActiveMap() {
    const activeMap = mapInstances[mapState.active];
    if (activeMap && typeof activeMap.resize === 'function') {
      activeMap.resize();
    }
    refreshMapBubbles(mapState.active);
    if (mapState.active === 'eastAsia') {
      ensureChinaOutline(mapInstances.eastAsia);
    }
    if (popup.style.display !== 'none') {
      updateOverlayBounds(popup);
    }
    if (modal.classList.contains('is-open')) {
      updateOverlayBounds(modalBody);
    }
  }

  function scheduleResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeActiveMap();
    }, 150);
  }

  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', scheduleResize);

  function ensureAmericasMap(locations) {
    if (mapInstances.americas) return Promise.resolve(mapInstances.americas);
    if (americasMapPromise) return americasMapPromise;

    americasMapPromise = loadUsaDatamap().then((UsaDatamap) => {
      const map = new UsaDatamap({
        element: mapEls.americas,
        scope: 'usa',
        fills: {
          defaultFill: '#d9d9d9',
          pin: '#c12f2f',
          githubPin: '#2ea043',
          stateHighlight: '#bdbdbd'
        },
        geographyConfig: {
          highlightOnHover: false,
          highlightBorderColor: 'transparent',
          popupOnHover: false,
          borderColor: '#b8b8b8',
          borderWidth: 0.6
        },
        done: function (datamap) {
          bindUsaStateInteractions(datamap, locations, null);
        }
      });

      const filterFn = (loc) => {
        return loc.lat >= bounds.usa.latMin && loc.lat <= bounds.usa.latMax &&
          loc.lng >= bounds.usa.lngMin && loc.lng <= bounds.usa.lngMax;
      };

      renderMapBubbles('americas', map, locations, filterFn, 8);

      mapInstances.americas = map;
      setTimeout(() => map.resize(), 0);
      return map;
    }).catch((err) => {
      americasMapPromise = null;
      throw err;
    });

    return americasMapPromise;
  }

  function ensureEastAsiaMap(locations) {
    if (mapInstances.eastAsia) {
      traceLog('ensureEastAsiaMap-hit-cache', { hasMap: true });
      return ensureChinaOutline(mapInstances.eastAsia).then(() => mapInstances.eastAsia);
    }
    if (eastAsiaMapPromise) return eastAsiaMapPromise;

    traceLog('ensureEastAsiaMap-create-start', { hasMap: false });

    const map = new WorldDatamap({
      element: mapEls.eastAsia,
      fills: {
        defaultFill: '#d9d9d9',
        pin: '#c12f2f',
        githubPin: '#2ea043'
      },
      geographyConfig: {
        highlightOnHover: false,
        popupOnHover: false,
        borderColor: 'transparent',
        borderWidth: 0
      },
      setProjection: function (element) {
        const width = element.offsetWidth;
        const height = element.offsetHeight;
        const projection = d3.geo.mercator()
          .center([103, 32])
          .scale(Math.min(width, height) * 1.45)
          .translate([width / 2, height / 2]);
        const path = d3.geo.path().projection(projection);
        return { path, projection };
      }
    });

    const filterFn = (loc) => {
      return loc.lat >= bounds.eastAsia.latMin && loc.lat <= bounds.eastAsia.latMax &&
        loc.lng >= bounds.eastAsia.lngMin && loc.lng <= bounds.eastAsia.lngMax;
    };

    renderMapBubbles('eastAsia', map, locations, filterFn, 7);

    mapInstances.eastAsia = map;
    traceLog('ensureEastAsiaMap-create-done', { hasMap: true });
    setTimeout(() => map.resize(), 0);

    eastAsiaMapPromise = ensureChinaOutline(map)
      .then(() => map)
      .catch((err) => {
        eastAsiaMapPromise = null;
        throw err;
      });

    return eastAsiaMapPromise;
  }

  function prewarmEastAsiaMap(locations) {
    if (!Array.isArray(locations) || !locations.length) return;
    const runner = () => {
      if (mapInstances.eastAsia) return;
      traceLog('prewarm-eastAsia-start', { hasMap: false });
      ensureEastAsiaMap(locations);
      traceLog('prewarm-eastAsia-end', { hasMap: Boolean(mapInstances.eastAsia) });
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(runner, { timeout: 1200 });
    } else {
      setTimeout(runner, 200);
    }
  }

  function ensureChinaOutline(map) {
    if (!map) return Promise.resolve(false);
    if (map.__chinaOutlinePromise) return map.__chinaOutlinePromise;

    map.__chinaOutlinePromise = loadChinaGeo()
      .then((geoData) => {
        if (!geoData) return false;
        drawChinaOutline(map, geoData);
        return true;
      })
      .catch((err) => {
        console.warn('[photo-map] ensure china outline failed', err);
        return false;
      })
      .then((result) => {
        map.__chinaOutlinePromise = null;
        return result;
      });

    return map.__chinaOutlinePromise;
  }

  function drawChinaOutline(map, geoData) {
    if (!map || !map.svg || !geoData) return;
    const projection = map.projection || (map.path && map.path.projection && map.path.projection());
    if (!projection) return;
    const path = d3.geo.path().projection(projection);
    let outlineLayer = map.svg.select('g.china-outline');
    let hitLayer = map.svg.select('g.china-outline-hit');
    if (outlineLayer.empty()) {
      const bubbleLayer = map.svg.select('.datamaps-bubbles, .bubbles');
      if (bubbleLayer.empty()) {
        hitLayer = map.svg.append('g').attr('class', 'china-outline-hit');
        outlineLayer = map.svg.append('g').attr('class', 'china-outline');
      } else {
        hitLayer = map.svg.insert('g', '.datamaps-bubbles, .bubbles').attr('class', 'china-outline-hit');
        outlineLayer = map.svg.insert('g', '.datamaps-bubbles, .bubbles').attr('class', 'china-outline');
      }
    }
    if (hitLayer.empty()) {
      const bubbleLayer = map.svg.select('.datamaps-bubbles, .bubbles');
      hitLayer = bubbleLayer.empty()
        ? map.svg.insert('g', 'g.china-outline').attr('class', 'china-outline-hit')
        : map.svg.insert('g', '.datamaps-bubbles, .bubbles').attr('class', 'china-outline-hit');
    }

    let features = [];
    if (geoData.type === 'Topology') {
      const objects = geoData.objects || {};
      const objectKey = Object.keys(objects)[0];
      if (window.PHOTO_MAP_DEBUG) {
        console.log('[photo-map] china topojson object', { objectKey });
      }
      if (objectKey && window.topojson && typeof window.topojson.feature === 'function') {
        features = (window.topojson.feature(geoData, objects[objectKey]) || {}).features || [];
      }
    } else {
      features = geoData.features || [];
    }
    const isTaiwanProps = (props) => {
      const id = String((props && props.id) || '');
      return /^09\d{3}$/.test(id) || /^100\d{2}$/.test(id) || /^(63|64|65|66|67|68)000$/.test(id);
    };

    if (window.topojson && typeof window.topojson.merge === 'function') {
      const objects = geoData.objects || {};
      const objectKey = Object.keys(objects)[0];
      if (objectKey) {
        const geoms = (objects[objectKey] && objects[objectKey].geometries) || [];
        const taiwanGeoms = geoms.filter((g) => isTaiwanProps(g && g.properties ? g.properties : {}));
        if (taiwanGeoms.length) {
          const merged = window.topojson.merge(geoData, taiwanGeoms);
          features = features.filter((f) => !isTaiwanProps(f && f.properties ? f.properties : {}));
          features.push({
            type: 'Feature',
            properties: { name: 'Taiwan', adcode: 'TW-PROV' },
            geometry: merged
          });
        }
      }
    }
    features.forEach((feature) => {
      if (!feature || !feature.properties) return;
      const props = feature.properties;
      if (!props.name) {
        props.name = props.NAME_1 || props.NL_NAME_1 || props.name || '';
      }
      if (!props.adcode) {
        props.adcode = props.id || props.ID_1 || props.adcode || '';
      }
    });
    if (window.PHOTO_MAP_DEBUG) {
      const taiwanCount = features.filter((f) => {
        const name = f && f.properties ? String(f.properties.name || '') : '';
        return /台湾|台灣|Taiwan/i.test(name);
      }).length;
      console.log('[photo-map] china outline draw', { features: features.length, taiwanCount });
    }
    const outlines = outlineLayer.selectAll('path.china-province-outline')
      .data(features, (d, i) => {
        const props = d && d.properties ? d.properties : null;
        const adcode = props && props.adcode ? String(props.adcode) : '';
        const name = props && props.name ? String(props.name) : '';
        return adcode || name || `idx-${i}`;
      });

    outlines.enter().append('path').attr('class', 'china-province-outline');
    outlines
      .attr('d', path)
      .attr('stroke', '#b8b8b8')
      .style('stroke', '#b8b8b8', 'important')
      .style('pointer-events', 'none');
    outlines.exit().remove();

    const hits = hitLayer.selectAll('path.china-province-hit')
      .data(features, (d, i) => {
        const props = d && d.properties ? d.properties : null;
        const adcode = props && props.adcode ? String(props.adcode) : '';
        const name = props && props.name ? String(props.name) : '';
        return adcode || name || `idx-${i}`;
      });

    hits.enter().append('path').attr('class', 'china-province-hit');
    hits
      .attr('d', path)
      .on('mouseover', function (d) {
        outlineLayer.selectAll('path.china-province-outline')
          .filter(function (d2) { return d2 === d; })
          .classed('is-hover', true);
      })
      .on('mouseout', function (d) {
        outlineLayer.selectAll('path.china-province-outline')
          .filter(function (d2) { return d2 === d; })
          .classed('is-hover', false);
      })
      .on('click', function (d) {
        d3.event.stopPropagation();
        zoomChinaProvince(map, path, d);
      });
    hits.exit().remove();

    map.svg.on('click', function () {
      resetChinaZoom(map);
    });

    const bubbleLayer = map.svg.select('.datamaps-bubbles, .bubbles');
    if (!bubbleLayer.empty()) {
      ensureBubbleOnTop(map);
    }
  }

  function zoomChinaProvince(map, path, feature) {
    if (!map || !map.svg || !feature) return;
    const svgNode = map.svg.node();
    const width = svgNode ? svgNode.clientWidth : 0;
    const height = svgNode ? svgNode.clientHeight : 0;
    if (!width || !height) return;
    const boundsBox = path.bounds(feature);
    const dx = boundsBox[1][0] - boundsBox[0][0];
    const dy = boundsBox[1][1] - boundsBox[0][1];
    const x = (boundsBox[0][0] + boundsBox[1][0]) / 2;
    const y = (boundsBox[0][1] + boundsBox[1][1]) / 2;
    const scale = Math.max(1, Math.min(6, 0.9 / Math.max(dx / width, dy / height)));
    const translate = [width / 2 - scale * x, height / 2 - scale * y];
    if (window.PHOTO_MAP_DEBUG) {
      const props = feature && feature.properties ? feature.properties : {};
      debugLog('china zoom', {
        name: props.name || props.NAME_1 || '',
        adcode: props.adcode || props.id || '',
        bounds: boundsBox,
        scale,
        translate
      });
    }
    map.__zoomScale = scale;
    map.__zoomTranslate = translate;
    applyChinaZoom(map, scale, translate);
    scheduleEastAsiaBubbleRefresh(map, chinaZoomDuration + 20);
  }

  function resetChinaZoom(map) {
    if (!map || !map.svg) return;
    map.__zoomScale = 1;
    map.__zoomTranslate = null;
    if (window.PHOTO_MAP_DEBUG) {
      debugLog('china zoom reset');
    }
    applyChinaZoom(map, 1, [0, 0]);
    scheduleEastAsiaBubbleRefresh(map, chinaZoomDuration + 20);
  }

  function applyChinaZoom(map, scale, translate) {
    const zoomDuration = chinaZoomDuration;
    const tx = translate[0];
    const ty = translate[1];
    map.svg.selectAll('.datamaps-subunits, g.china-outline, g.china-outline-hit, .datamaps-bubbles, .bubbles, g.photo-map-overlay')
      .transition().duration(zoomDuration).ease('cubic-in-out')
      .attr('transform', `translate(${tx},${ty})scale(${scale})`);

    if (window.PHOTO_MAP_DEBUG) {
      debugLog('apply china zoom', { scale, translate });
    }

    const bubbles = map.svg.selectAll('.datamaps-bubble, .bubble');
    bubbles.each(function (d) {
      if (d && d.__baseRadius == null) {
        d.__baseRadius = d.radius || Number(d3.select(this).attr('r')) || 0;
      }
    });

    bubbles
      .transition().duration(zoomDuration).ease('cubic-in-out')
      .attr('r', (d) => {
        if (!d || !d.__baseRadius) return d && d.radius ? d.radius : 0;
        return d.__baseRadius / scale;
      });
    if (map.__bubbleConfig) {
      renderGithubMarkerArrow(map, map.__bubbleConfig.filterFn);
    }
    ensureBubbleOnTop(map);
  }

  function applyChinaZoomImmediate(map, scale, translate) {
    const tx = translate[0];
    const ty = translate[1];
    map.svg.selectAll('.datamaps-subunits, g.china-outline, g.china-outline-hit, .datamaps-bubbles, .bubbles, g.photo-map-overlay')
      .attr('transform', `translate(${tx},${ty})scale(${scale})`);

    const bubbles = map.svg.selectAll('.datamaps-bubble, .bubble');
    bubbles.each(function (d) {
      if (d && d.__baseRadius == null) {
        d.__baseRadius = d.radius || Number(d3.select(this).attr('r')) || 0;
      }
    });
    bubbles
      .attr('r', (d) => {
        if (!d || !d.__baseRadius) return d && d.radius ? d.radius : 0;
        return d.__baseRadius / scale;
      });
    if (map.__bubbleConfig) {
      renderGithubMarkerArrow(map, map.__bubbleConfig.filterFn);
    }
    ensureBubbleOnTop(map);
  }

  function ensureSoutheastAsiaMap(locations) {
    if (mapInstances.southeastAsia) return;

    const map = new WorldDatamap({
      element: mapEls.southeastAsia,
      fills: {
        defaultFill: '#d9d9d9',
        pin: '#c12f2f',
        githubPin: '#2ea043'
      },
      geographyConfig: {
        highlightOnHover: false,
        popupOnHover: false,
        borderColor: 'transparent',
        borderWidth: 0
      },
      setProjection: function (element) {
        const width = element.offsetWidth;
        const height = element.offsetHeight;
        const projection = d3.geo.mercator()
          .center([115, 8])
          .scale(Math.min(width, height) * 1.65)
          .translate([width / 2, height / 2]);
        const path = d3.geo.path().projection(projection);
        return { path, projection };
      }
    });

    const filterFn = (loc) => {
      return loc.lat >= bounds.southeastAsia.latMin && loc.lat <= bounds.southeastAsia.latMax &&
        loc.lng >= bounds.southeastAsia.lngMin && loc.lng <= bounds.southeastAsia.lngMax;
    };

    renderMapBubbles('southeastAsia', map, locations, filterFn, 7);

    mapInstances.southeastAsia = map;
    setTimeout(() => map.resize(), 0);
  }

  function ensureEuropeMap(locations) {
    if (mapInstances.europe) return;

    const map = new WorldDatamap({
      element: mapEls.europe,
      fills: {
        defaultFill: '#d9d9d9',
        pin: '#c12f2f',
        githubPin: '#2ea043'
      },
      geographyConfig: {
        highlightOnHover: false,
        popupOnHover: false,
        borderColor: 'transparent',
        borderWidth: 0
      },
      setProjection: function (element) {
        const width = element.offsetWidth;
        const height = element.offsetHeight;
        const projection = d3.geo.mercator()
          .center([15, 52])
          .scale(Math.min(width, height) * 1.75)
          .translate([width / 2, height / 2]);
        const path = d3.geo.path().projection(projection);
        return { path, projection };
      }
    });

    const filterFn = (loc) => {
      return loc.lat >= bounds.europe.latMin && loc.lat <= bounds.europe.latMax &&
        loc.lng >= bounds.europe.lngMin && loc.lng <= bounds.europe.lngMax;
    };

    renderMapBubbles('europe', map, locations, filterFn, 7);

    mapInstances.europe = map;
    setTimeout(() => map.resize(), 0);
  }

  function ensureUsaFocusMap(locations, config) {
    if (!config || mapInstances[config.mapKey]) return Promise.resolve();

    return loadUsaDatamap().then((UsaDatamap) => {
      const map = new UsaDatamap({
        element: mapEls[config.mapKey],
        scope: 'usa',
        fills: {
          defaultFill: '#d9d9d9',
          pin: '#c12f2f',
          githubPin: '#2ea043',
          stateHighlight: '#bdbdbd'
        },
        geographyConfig: {
          highlightOnHover: false,
          popupOnHover: false,
          borderColor: '#b8b8b8',
          borderWidth: 0.6
        },
        done: function (datamap) {
          bindUsaStateInteractions(datamap, locations, config.mapKey);
        },
        setProjection: function (element) {
          const width = element.offsetWidth;
          const height = element.offsetHeight;
          const projection = d3.geo.mercator()
            .center(config.center)
            .scale(Math.min(width, height) * config.scale)
            .translate([width / 2, height / 2]);
          const path = d3.geo.path().projection(projection);
          return { path, projection };
        }
      });

      const filterFn = (loc) => {
        const range = bounds[config.boundsKey];
        return loc.lat >= range.latMin && loc.lat <= range.latMax &&
          loc.lng >= range.lngMin && loc.lng <= range.lngMax;
      };

      renderMapBubbles(config.mapKey, map, locations, filterFn, 8);

      mapInstances[config.mapKey] = map;
      setTimeout(() => map.resize(), 0);
    });
  }


  function formatShotTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const pad = (num) => String(num).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }

  function formatExposure(value) {
    if (!value) return '';
    if (typeof value === 'number') {
      if (value >= 1) return `${value}s`;
      const denom = Math.round(1 / value);
      return denom > 0 ? `1/${denom}s` : `${value}s`;
    }
    return String(value);
  }

  function formatFNumber(value) {
    if (!value) return '';
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isNaN(num)) return `f/${num.toFixed(1).replace(/\.0$/, '')}`;
    return String(value);
  }

  function formatFocalLength(value) {
    if (!value) return '';
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isNaN(num)) return `${num.toFixed(0)}mm`;
    return String(value);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildPlaceHtml(data) {
    const place = data.place_name || '';
    if (!place) return '';
    return `<div class="photo-map-place">${escapeHtml(place)}</div>`;
  }

  function buildMetaText(data) {
    const parts = [];
    const timeLabel = data.shot_time ? formatShotTime(data.shot_time) : '';
    const exposure = formatExposure(data.exposure_time);
    const fNumber = formatFNumber(data.f_number);
    const iso = data.iso ? `ISO ${data.iso}` : '';
    const focal = formatFocalLength(data.focal_length);
    const camera = data.camera_model || '';

    if (timeLabel) parts.push(timeLabel);
    if (exposure) parts.push(exposure);
    if (fNumber) parts.push(fNumber);
    if (iso) parts.push(iso);
    if (focal) parts.push(focal);
    if (camera) parts.push(camera);

    return parts.join(' | ');
  }

  function buildMetaHtml(data) {
    const text = buildMetaText(data);
    if (!text) return '';
    return `<div class="photo-map-meta">${escapeHtml(text)}</div>`;
  }

  function buildPhotoFrameHtml(data, options) {
    const opts = options || {};
    const layout = opts.layout || 'overlay';
    const frameClass = opts.frameClass || (layout === 'card' ? 'photo-map-frame photo-map-frame-card' : 'photo-map-frame');
    const imgClass = opts.imgClass || 'photo-map-img';
    const imgLoading = opts.imgLoading ? ` loading="${opts.imgLoading}"` : '';
    const imgDecoding = opts.imgDecoding ? ` decoding="${opts.imgDecoding}"` : '';
    const src = data && data.photo_src ? String(data.photo_src) : '';
    const alt = data && data.name ? String(data.name) : 'photo';
    if (!src) return '';
    const placeHtml = buildPlaceHtml(data || {});
    const metaHtml = buildMetaHtml(data || {});
    return `<div class="${frameClass}"><img class="${imgClass}"${imgLoading}${imgDecoding} src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">${placeHtml}${metaHtml}</div>`;
  }

  window.PhotoMapSharedUI = window.PhotoMapSharedUI || {};
  window.PhotoMapSharedUI.escapeHtml = escapeHtml;
  window.PhotoMapSharedUI.buildMetaText = buildMetaText;
  window.PhotoMapSharedUI.buildPhotoFrameHtml = buildPhotoFrameHtml;
  window.PhotoMapSharedUI.showModalHtml = showModal;
  window.PhotoMapSharedUI.hideModal = hideModal;

  fetch(dataUrl, { cache: 'no-store' })
    .then((res) => res.json())
    .then((data) => {
      const locations = Array.isArray(data.locations) ? data.locations : [];
      if (!locations.length) {
        mapEls.world.innerHTML = '<div class="photo-map-empty">No geotagged photos yet.</div>';
        return;
      }

      renderWorldMap(locations);
      bindControlEvents(locations);
      prewarmEastAsiaMap(locations);
      updateGithubLocationMarker().then(() => {
        refreshAllMapBubbles();
      });
    })
    .catch((err) => {
      console.warn('[photo-map] locations fetch failed', err);
      mapEls.world.innerHTML = '<div class="photo-map-empty">Failed to load map data.</div>';
    });
})();
