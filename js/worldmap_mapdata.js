var simplemaps_worldmap_mapdata = {
  "main_settings": {
    "div": "simplemaps_worldmap",
    "width": "responsive",
    "zoom": "yes",
    "zoom_click": "yes",
    "state_zoom": "yes",
    "zoom_max": 6,
    "zoom_min": 1,
    "background_color": "#f7f6f2",
    "border_color": "#c7c4bb",
    "popups": "off"
  },
  "locations": JSON.parse(document.getElementById('origin-public-config')?.textContent || '{}').legacy_map_locations || {}
};
