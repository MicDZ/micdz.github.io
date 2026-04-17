(function () {
  const mapEls = {
    world: document.getElementById('photoMapWorld'),
    americas: document.getElementById('photoMapAmericas'),
    usa: document.getElementById('photoMapUSA'),
    eastAsia: document.getElementById('photoMapEastAsia'),
    southeastAsia: document.getElementById('photoMapSoutheastAsia'),
    europe: document.getElementById('photoMapEurope')
  };

  if (!mapEls.world || !mapEls.americas || !mapEls.usa || !mapEls.eastAsia || !mapEls.southeastAsia || !mapEls.europe) return;

  const dataUrl = mapEls.world.getAttribute('data-locations-url') || '/assets/maps/locations.json';

  if (!window.Datamap || !window.d3) {
    console.warn('Datamaps or d3 is not loaded.');
    return;
  }

  const WorldDatamap = window.Datamap;
  let usaLoadPromise = null;

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

  function showPopup(html, evt) {
    popup.innerHTML = html;
    popup.style.display = 'block';
    positionPopup(evt);
  }

  function hidePopup() {
    popup.style.display = 'none';
    popup.innerHTML = '';
  }

  function showModal(html) {
    if (!modalBody) return;
    modalBody.innerHTML = html;
    modal.classList.add('is-open');
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
    usa: null,
    eastAsia: null,
    southeastAsia: null,
    europe: null
  };

  const mapState = {
    active: 'world',
    selectedStates: new Set()
  };

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
    eastAsia: { latMin: 0, latMax: 55, lngMin: 95, lngMax: 155 },
    southeastAsia: { latMin: -15, latMax: 25, lngMin: 90, lngMax: 140 },
    usa: { latMin: 24, latMax: 50, lngMin: -125, lngMax: -66 },
    europe: { latMin: 34, latMax: 72, lngMin: -25, lngMax: 45 }
  };

  const resetControl = document.querySelector('[data-map-action="back-world-inner"]');

  function setActivePane(name) {
    mapState.active = name;
    Object.entries(mapEls).forEach(([key, el]) => {
      if (!el) return;
      el.classList.toggle('is-active', key === name);
    });
    if (resetControl) {
      resetControl.style.display = name === 'world' ? 'none' : 'inline-flex';
      resetControl.setAttribute('aria-hidden', name === 'world' ? 'true' : 'false');
    }

    if (name === 'americas' && mapInstances.americas) {
      setTimeout(() => mapInstances.americas.resize(), 0);
      setTimeout(() => refreshMapBubbles('americas'), 0);
    }
    if (name === 'usa' && mapInstances.usa) {
      setTimeout(() => mapInstances.usa.resize(), 0);
      setTimeout(() => refreshMapBubbles('usa'), 0);
    }
    if (name === 'eastAsia' && mapInstances.eastAsia) {
      setTimeout(() => mapInstances.eastAsia.resize(), 0);
      setTimeout(() => refreshMapBubbles('eastAsia'), 0);
    }
    if (name === 'southeastAsia' && mapInstances.southeastAsia) {
      setTimeout(() => mapInstances.southeastAsia.resize(), 0);
      setTimeout(() => refreshMapBubbles('southeastAsia'), 0);
    }
    if (name === 'europe' && mapInstances.europe) {
      setTimeout(() => mapInstances.europe.resize(), 0);
      setTimeout(() => refreshMapBubbles('europe'), 0);
    }
  }

  function bindControlEvents(locations) {
    if (resetControl) {
      resetControl.addEventListener('click', () => {
        setActivePane('world');
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

  function buildBubbles(locations, filterFn, radius) {
    return locations
      .filter(filterFn || (() => true))
      .map((loc) => ({
        name: loc.name,
        latitude: loc.lat,
        longitude: loc.lng,
        radius: radius || 6,
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

  function getClusterDistance(mapName, width, height) {
    const minDim = Math.min(width, height);
    const ratios = {
      world: 0.05,
      americas: 0.04,
      eastAsia: 0.032,
      southeastAsia: 0.032,
      europe: 0.032,
      usa: 0.03
    };
    const ratio = ratios[mapName] || 0.035;
    return Math.max(10, Math.round(minDim * ratio));
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
    const distance = getClusterDistance(mapName, width || 0, height || 0);
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
      const bubbleRadius = radius + (count > 1 ? Math.min(10, 2 + Math.sqrt(count) * 1.6) : 0);
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

  function renderMapBubbles(mapName, map, locations, filterFn, radius) {
    const bubbles = buildClusteredBubbles(locations, mapName, map, filterFn, radius);
    map.svg.selectAll('.datamaps-bubble').remove();
    map.bubbles(bubbles, { popupOnHover: false });
    bindBubbleEvents(map);
    map.__bubbleConfig = { mapName, locations, filterFn, radius };
  }

  function refreshMapBubbles(mapName) {
    const map = mapInstances[mapName];
    if (!map || !map.__bubbleConfig) return;
    renderMapBubbles(mapName, map, map.__bubbleConfig.locations, map.__bubbleConfig.filterFn, map.__bubbleConfig.radius);
  }

  function bindBubbleEvents(map) {
    map.svg.selectAll('.datamaps-bubble')
      .on('mouseover', function (d) {
        const evt = d3.event;
        if (!d) return;
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
        if (!d) return;
        const items = Array.isArray(d.items) && d.items.length ? d.items : [d];
        const validItems = items.filter((item) => item && item.photo_src);
        if (!validItems.length) return;
        const token = ++popupToken;
        hidePopup();
        Promise.all(validItems.map((item) => loadImageAsync(item.photo_src)))
          .then((images) => {
            if (token !== popupToken) return;
            const html = buildClusterHtml(validItems, images, { limit: null, showMoreNote: false });
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
    const totalCount = items.length;
    const displayCount = limit && totalCount > limit ? limit : totalCount;
    const blocks = [];
    items.slice(0, displayCount).forEach((item, idx) => {
      const img = images[idx];
      if (!img) return;
      const placeHtml = buildPlaceHtml(item);
      const metaHtml = buildMetaHtml(item);
      const imgHtml = `<div class="photo-map-frame"><img class="photo-map-img" src="${item.photo_src}" alt="${item.name || 'photo'}">${placeHtml}${metaHtml}</div>`;
      blocks.push(`<div class="photo-map-cluster-item">${imgHtml}</div>`);
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
          setActivePane('americas');
          ensureAmericasMap(locations);
        } else if (EAST_ASIA.has(geo.id)) {
          setActivePane('eastAsia');
          ensureEastAsiaMap(locations);
        } else if (SOUTHEAST_ASIA.has(geo.id)) {
          setActivePane('southeastAsia');
          ensureSoutheastAsiaMap(locations);
        } else if (EUROPE.has(geo.id)) {
          setActivePane('europe');
          ensureEuropeMap(locations);
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
    if (mapInstances.americas) return;

    const map = new WorldDatamap({
      element: mapEls.americas,
      fills: {
        defaultFill: '#d9d9d9',
        pin: '#c12f2f'
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
          .center([-100, 40])
          .scale(Math.min(width, height) * 1.35)
          .translate([width / 2, height / 2]);
        const path = d3.geo.path().projection(projection);
        return { path, projection };
      }
    });

    const filterFn = (loc) => {
      return loc.lat >= bounds.americas.latMin && loc.lat <= bounds.americas.latMax &&
        loc.lng >= bounds.americas.lngMin && loc.lng <= bounds.americas.lngMax;
    };

    renderMapBubbles('americas', map, locations, filterFn, 7);

    map.svg.selectAll('.datamaps-subunit')
      .on('click', function (geo) {
        if (!geo || !geo.id) return;
        if (geo.id === 'USA') {
          ensureUsaMap(locations).then(() => {
            setActivePane('usa');
          }).catch((err) => {
            console.warn(err);
          });
        }
      });

    mapInstances.americas = map;
    setTimeout(() => map.resize(), 0);
  }

  function ensureEastAsiaMap(locations) {
    if (mapInstances.eastAsia) return;

    const map = new WorldDatamap({
      element: mapEls.eastAsia,
      fills: {
        defaultFill: '#d9d9d9',
        pin: '#c12f2f'
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
    setTimeout(() => map.resize(), 0);
  }

  function ensureSoutheastAsiaMap(locations) {
    if (mapInstances.southeastAsia) return;

    const map = new WorldDatamap({
      element: mapEls.southeastAsia,
      fills: {
        defaultFill: '#d9d9d9',
        pin: '#c12f2f'
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
        pin: '#c12f2f'
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

  function ensureUsaMap(locations) {
    if (mapInstances.usa) return Promise.resolve();

    return loadUsaDatamap().then((UsaDatamap) => {
      const map = new UsaDatamap({
        element: mapEls.usa,
        scope: 'usa',
        fills: {
          defaultFill: '#d9d9d9',
          pin: '#c12f2f',
          selected: '#b0b0b0'
        },
        geographyConfig: {
          highlightOnHover: true,
          highlightFillColor: '#c7c7c7',
          highlightBorderColor: 'transparent',
          popupOnHover: false,
          borderColor: 'transparent',
          borderWidth: 0
        },
        done: function (datamap) {
          datamap.svg.selectAll('.datamaps-subunit')
            .on('click', function (geo) {
              if (!geo || !geo.id) return;
              const isSelected = mapState.selectedStates.has(geo.id);
              if (isSelected) {
                mapState.selectedStates.delete(geo.id);
                datamap.updateChoropleth({ [geo.id]: null });
              } else {
                mapState.selectedStates.add(geo.id);
                datamap.updateChoropleth({ [geo.id]: { fillKey: 'selected' } });
              }
            });
        }
      });

      const filterFn = (loc) => {
        return loc.lat >= bounds.usa.latMin && loc.lat <= bounds.usa.latMax &&
          loc.lng >= bounds.usa.lngMin && loc.lng <= bounds.usa.lngMax;
      };

      renderMapBubbles('usa', map, locations, filterFn, 8);

      mapInstances.usa = map;
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

  function buildPlaceHtml(data) {
    const place = data.place_name || '';
    if (!place) return '';
    return `<div class="photo-map-place">${place}</div>`;
  }

  function buildMetaHtml(data) {
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

    if (!parts.length) return '';
    return `<div class="photo-map-meta">${parts.join(' \u00b7 ')}</div>`;
  }

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
      scheduleResize();
    })
    .catch((err) => {
      console.warn('Failed to load photo map data.', err);
      mapEls.world.innerHTML = '<div class="photo-map-empty">Failed to load map data.</div>';
    });
})();
