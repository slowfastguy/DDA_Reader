/**
 * state.js - Central State Store & Geometry Utilities
 * Ducati DDA Telemetry & GPS Visualizer
 */

// Default Factory Settings & Track Profiles
const DEFAULT_SETTINGS = {
  version: "1.0",
  preferences: {
    unitMph: true,
    currentLayer: "dark",
    heatmapMode: "speed",
    smoothingLevel: "med",
    showSpeedExtrema: true,
    followBike: true,
    playbackSpeed: 1.0,
    motogp: {
      showCard: true,
      riderName: "M FISCHER",
      bikeName: "Panigale V4 R",
      riderNum: "14",
      tyreFront: "M",
      tyreRear: "S",
      badgeColor: "#6f2dbd",
      bgFormat: "dual_matte",
      fps: 60,
      scale: 1.5
    },
    channels: {
      speedA: true,
      speedB: true,
      rpm: true,
      tps: true,
      lean: true,
      dtc: true,
      gear: true
    }
  },
  tracks: {
    sonoma_raceway: {
      id: "sonoma_raceway",
      name: "Sonoma Raceway",
      location: "Sonoma, CA",
      center_lat: 38.161580,
      center_lon: -122.454640,
      radius_m: 3500,
      gates: [
        { id: "sf", name: "Start / Finish", type: "sf", lat: 38.161580, lon: -122.454640, bearing: 310.0 },
        { id: "s1", name: "Sector 1 (Carousel)", type: "split", lat: 38.164320, lon: -122.458900, bearing: 265.0 },
        { id: "s2", name: "Sector 2 (Esses)", type: "split", lat: 38.158210, lon: -122.457800, bearing: 180.0 }
      ]
    },
    laguna_seca: {
      id: "laguna_seca",
      name: "WeatherTech Raceway Laguna Seca",
      location: "Monterey, CA",
      center_lat: 36.584444,
      center_lon: -121.753611,
      radius_m: 3500,
      gates: [
        { id: "sf", name: "Start / Finish", type: "sf", lat: 36.585500, lon: -121.754000, bearing: 240.0 },
        { id: "s1", name: "Sector 1 (Andretti Hairpin)", type: "split", lat: 36.586200, lon: -121.758500, bearing: 135.0 },
        { id: "s2", name: "Sector 2 (Corkscrew)", type: "split", lat: 36.582800, lon: -121.751200, bearing: 210.0 }
      ]
    },
    thunderhill_east: {
      id: "thunderhill_east",
      name: "Thunderhill Raceway Park (East 3-Mile)",
      location: "Willows, CA",
      center_lat: 39.539700,
      center_lon: -122.332500,
      radius_m: 4000,
      gates: [
        { id: "sf", name: "Start / Finish", type: "sf", lat: 39.537200, lon: -122.331500, bearing: 355.0 },
        { id: "s1", name: "Sector 1 (The Cyclone)", type: "split", lat: 39.544100, lon: -122.336200, bearing: 270.0 },
        { id: "s2", name: "Sector 2 (Turn 9/10)", type: "split", lat: 39.538500, lon: -122.337800, bearing: 160.0 }
      ]
    }
  }
};

// Application State
const state = {
  sessionData: null,
  rawRecords: [],
  records: [],
  laps: [],
  gates: [],
  tracks: {},
  selectedLapNum: -1,
  activeRecords: [],
  currentIndex: 0,
  isPlaying: false,
  playbackSpeed: 1.0,
  animationFrameId: null,
  lastFrameTime: 0,
  unitMph: true,
  followBike: true,
  showSpeedExtrema: true,
  heatmapMode: 'speed',
  smoothingLevel: 'med',
  gateEditMode: null,
  isCompareMode: false,
  compareLapA: 8,
  compareLapB: 2,
  map: null,
  mapLayers: {},
  currentLayer: 'dark',
  trackPolylineGroup: null,
  gatesLayerGroup: null,
  extremaLayerGroup: null,
  bikeMarker: null,
  ghostMarker: null,
  lastBikeHeading: 0,
  lastGhostHeading: 0,
  bestSectors: [null, null, null],
  motogp: {
    showCard: true,
    riderName: "M FISCHER",
    bikeName: "Panigale V4 R",
    riderNum: "14",
    tyreFront: "M",
    tyreRear: "S",
    badgeColor: "#6f2dbd",
    bgFormat: "dual_matte",
    fps: 60,
    scale: 1.5
  },
  channels: {
    speedA: true,
    speedB: true,
    rpm: true,
    tps: true,
    lean: true,
    dtc: true,
    gear: true
  },
  zoomRange: [0, 1],
  sectionSelection: {
    active: false,
    isSelecting: false,
    startIdx: null,
    endIdx: null,
    startPoint: null, // { lat, lon, dist, orig_index }
    endPoint: null,   // { lat, lon, dist, orig_index }
    lapsData: [],     // Array of lap slices with calculated metrics
    activeLapsFilter: new Set(),
    syncMode: 'time', // 'time' or 'dist'
    hoverSectionDist: null,
    hoverRelTime: null,
    palette: [
      '#ffd600', '#00e5ff', '#ff0055', '#00e676', '#ff9100',
      '#d500f9', '#2979ff', '#ff1744', '#76ff03', '#f50057',
      '#00b0ff', '#ffea00', '#651fff', '#1de9b6', '#ff3d00'
    ]
  },
  sectionHighlightLayer: null,
  sectionHandlesLayer: null,
  sectionGhostsLayer: null,
  threeColLayout: false
};

// DOM Elements Cache
const dom = {
  metaTrackName: document.getElementById('meta-track-name'),
  metaRiderName: document.getElementById('meta-rider-name'),
  metaDuration: document.getElementById('meta-duration'),
  dataBestLapBadge: document.getElementById('data-best-lap-badge'),
  dataOptLapBadge: document.getElementById('data-opt-lap-badge'),
  btnToggleCompare: document.getElementById('btn-toggle-compare'),
  lblCompareBtn: document.getElementById('lbl-compare-btn'),
  compareControlsBar: document.getElementById('compare-controls-bar'),
  selectLapA: document.getElementById('select-lap-a'),
  selectLapB: document.getElementById('select-lap-b'),
  valDeltaTime: document.getElementById('val-delta-time'),
  valDeltaSpeed: document.getElementById('val-delta-speed'),
  valDeltaTps: document.getElementById('val-delta-tps'),
  lapTableBody: document.getElementById('lap-table-body'),
  btnToggleLayout: document.getElementById('btn-toggle-layout'),
  lblLayoutToggle: document.getElementById('lbl-layout-toggle'),
  btnToggleUnit: document.getElementById('btn-toggle-unit'),
  lblUnitToggle: document.getElementById('lbl-unit-toggle'),
  btnOpenSettings: document.getElementById('btn-open-settings'),
  btnLoadFile: document.getElementById('btn-load-file'),
  fileInput: document.getElementById('file-input'),
  settingsFileInput: document.getElementById('settings-file-input'),
  mapPanelTitle: document.getElementById('map-panel-title'),
  chartsPanelTitle: document.getElementById('charts-panel-title'),
  btnGateSf: document.getElementById('btn-gate-sf'),
  btnGateSplit: document.getElementById('btn-gate-split'),
  btnGateReset: document.getElementById('btn-gate-reset'),
  btnSaveTrackGates: document.getElementById('btn-save-track-gates'),
  btnToggleExtrema: document.getElementById('btn-toggle-extrema'),
  gateInstructionToast: document.getElementById('gate-instruction-toast'),
  gateToastMsg: document.getElementById('gate-toast-msg'),
  btnCancelGate: document.getElementById('btn-cancel-gate'),
  selectSmoothing: document.getElementById('select-smoothing'),
  selectMapLayer: document.getElementById('select-map-layer'),
  selectHeatmapColor: document.getElementById('select-heatmap-color'),
  btnFollowBike: document.getElementById('btn-follow-bike'),
  btnFitBounds: document.getElementById('btn-fit-bounds'),
  lblLapName: document.getElementById('lbl-lap-name'),
  valLapElapsed: document.getElementById('val-lap-elapsed'),
  valLapTarget: document.getElementById('val-lap-target'),
  valLapStatusText: document.getElementById('val-lap-status-text'),
  valSec1: document.getElementById('val-sec-1'),
  valSec2: document.getElementById('val-sec-2'),
  valSec3: document.getElementById('val-sec-3'),
  sec1Badge: document.getElementById('sec-1-badge'),
  sec2Badge: document.getElementById('sec-2-badge'),
  sec3Badge: document.getElementById('sec-3-badge'),
  valLeanDeg: document.getElementById('val-lean-deg'),
  motoTiltGroup: document.getElementById('moto-tilt-group'),
  peakLeanLeft: document.getElementById('peak-lean-left'),
  peakLeanRight: document.getElementById('peak-lean-right'),
  valRpmNumeric: document.getElementById('val-rpm-numeric'),
  tachBarFill: document.getElementById('tach-bar-fill'),
  valSpeedNumeric: document.getElementById('val-speed-numeric'),
  lblSpeedUnit: document.getElementById('lbl-speed-unit'),
  valGear: document.getElementById('val-gear'),
  tpsMeterFill: document.getElementById('tps-meter-fill'),
  valTpsNumeric: document.getElementById('val-tps-numeric'),
  valDtcSlow: document.getElementById('val-dtc-slow'),
  dtcSlowPill: document.getElementById('dtc-slow-pill'),
  valDtcFast: document.getElementById('val-dtc-fast'),
  dtcFastPill: document.getElementById('dtc-fast-pill'),
  valAltNumeric: document.getElementById('val-alt-numeric'),
  valDistNumeric: document.getElementById('val-dist-numeric'),
  telemetryCanvas: document.getElementById('telemetry-canvas'),
  chartScrubberLine: document.getElementById('chart-scrubber-line'),
  chartTooltip: document.getElementById('chart-tooltip'),
  btnResetZoom: document.getElementById('btn-reset-zoom'),
  legCompareSpd: document.getElementById('leg-compare-spd'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  iconPlay: document.getElementById('icon-play'),
  iconPause: document.getElementById('icon-pause'),
  btnStepPrev: document.getElementById('btn-step-prev'),
  btnStepNext: document.getElementById('btn-step-next'),
  selectPlaybackSpeed: document.getElementById('select-playback-speed'),
  lblTimeCurrent: document.getElementById('lbl-time-current'),
  lblTimeTotal: document.getElementById('lbl-time-total'),
  timelineSlider: document.getElementById('timeline-slider'),
  selectLapJump: document.getElementById('select-lap-jump'),
  modalShortcuts: document.getElementById('modal-shortcuts'),
  btnHelpShortcuts: document.getElementById('btn-help-shortcuts'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  modalSettings: document.getElementById('modal-settings'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  tracksListContainer: document.getElementById('tracks-list-container'),
  btnAddCurrentTrack: document.getElementById('btn-add-current-track'),
  btnExportSettings: document.getElementById('btn-export-settings'),
  btnTriggerSettingsImport: document.getElementById('btn-trigger-settings-import'),
  btnResetAllSettings: document.getElementById('btn-reset-all-settings'),
  prefSpeedUnit: document.getElementById('pref-speed-unit'),
  prefMapLayer: document.getElementById('pref-map-layer'),
  prefSmoothing: document.getElementById('pref-smoothing'),
  prefHeatmap: document.getElementById('pref-heatmap'),
  prefFollowBike: document.getElementById('pref-follow-bike'),
  prefShowExtrema: document.getElementById('pref-show-extrema'),
  dropOverlay: document.getElementById('drop-overlay'),
  legendMin: document.getElementById('legend-min'),
  legendMax: document.getElementById('legend-max'),
  leds: Array.from({ length: 10 }, (_, i) => document.getElementById(`led-${i + 1}`)),

  // Section Drag Comparison Elements
  btnSelectSection: document.getElementById('btn-select-section'),
  btnClearSection: document.getElementById('btn-clear-section'),
  sectionAnalysisDrawer: document.getElementById('section-analysis-drawer'),
  sectionBadgeLength: document.getElementById('section-badge-length'),
  sectionBadgeBestTime: document.getElementById('section-badge-best-time'),
  sectionBadgeBestLap: document.getElementById('section-badge-best-lap'),
  sectionBadgeApexAvg: document.getElementById('section-badge-apex-avg'),
  btnSyncTime: document.getElementById('btn-sync-time'),
  btnSyncDist: document.getElementById('btn-sync-dist'),
  sectionTableBody: document.getElementById('section-table-body'),
  sectionTableCard: document.getElementById('section-table-card'),
  btnToggleSectionDrawer: document.getElementById('btn-toggle-section-drawer'),
  sectionLegendRow: document.getElementById('section-legend-row'),

  // MotoGP Elements
  btnToggleMotoGP: document.getElementById('btn-toggle-motogp'),
  btnOpenVideoExport: document.getElementById('btn-open-video-export'),
  motogpLiveCard: document.getElementById('motogp-live-card'),
  motogpBody: document.getElementById('motogp-body'),
  motogpNameDisplay: document.getElementById('motogp-name-display'),
  motogpBikeDisplay: document.getElementById('motogp-bike-display'),
  motogpNumBadge: document.getElementById('motogp-num-badge'),
  motogpNumDisplay: document.getElementById('motogp-num-display'),
  motogpTimeDisplay: document.getElementById('motogp-time-display'),
  motogpDeltaDisplay: document.getElementById('motogp-delta-display'),
  motogpTyreFront: document.getElementById('motogp-tyre-front'),
  motogpTyreRear: document.getElementById('motogp-tyre-rear'),
  motogpSec1: document.getElementById('motogp-sec-1'),
  motogpSec2: document.getElementById('motogp-sec-2'),
  motogpSec3: document.getElementById('motogp-sec-3'),
  motogpTicCursor: document.getElementById('motogp-tic-cursor'),
  motogpFooter: document.getElementById('motogp-footer'),
  motogpFooterDelta: document.getElementById('motogp-footer-delta'),
  motogpFastestBanner: document.getElementById('motogp-fastest-banner'),
  motogpFastestSlider: document.getElementById('motogp-fastest-slider'),
  modalVideoExport: document.getElementById('modal-video-export'),
  btnCloseVideoModal: document.getElementById('btn-close-video-modal'),
  previewBody: document.getElementById('preview-body'),
  previewNameDisplay: document.getElementById('preview-name-display'),
  previewBikeDisplay: document.getElementById('preview-bike-display'),
  previewNumBadge: document.getElementById('preview-num-badge'),
  previewNumDisplay: document.getElementById('preview-num-display'),
  previewTimeDisplay: document.getElementById('preview-time-display'),
  previewDeltaDisplay: document.getElementById('preview-delta-display'),
  previewTyreFront: document.getElementById('preview-tyre-front'),
  previewTyreRear: document.getElementById('preview-tyre-rear'),
  previewFooter: document.getElementById('preview-footer'),
  previewFooterDelta: document.getElementById('preview-footer-delta'),
  previewFastestBanner: document.getElementById('preview-fastest-banner'),
  previewFastestSlider: document.getElementById('preview-fastest-slider'),
  inputRiderName: document.getElementById('input-rider-name'),
  inputBikeName: document.getElementById('input-bike-name'),
  inputRiderNum: document.getElementById('input-rider-num'),
  inputTyreFront: document.getElementById('input-tyre-front'),
  inputTyreRear: document.getElementById('input-tyre-rear'),
  inputNumberColor: document.getElementById('input-number-color'),
  selectExportLap: document.getElementById('select-export-lap'),
  selectVideoBg: document.getElementById('select-video-bg'),
  selectVideoFps: document.getElementById('select-video-fps'),
  selectVideoScale: document.getElementById('select-video-scale'),
  selectVideoIntro: document.getElementById('select-video-intro'),
  inputVideoLeadInOut: document.getElementById('input-video-leadinout'),
  valVideoLeadInOut: document.getElementById('val-video-leadinout'),
  btnPreviewIntro: document.getElementById('btn-preview-intro'),
  btnPreviewFastest: document.getElementById('btn-preview-fastest'),
  renderProgressBarWrap: document.getElementById('render-progress-bar-wrap'),
  renderProgressFill: document.getElementById('render-progress-fill'),
  renderProgressText: document.getElementById('render-progress-text'),
  btnRenderVideo: document.getElementById('btn-render-video')
};

// Settings Initialization & Sync
function initSettings() {
  let loaded = null;
  try {
    const raw = localStorage.getItem('dda_settings');
    if (raw) loaded = JSON.parse(raw);
  } catch (e) {
    console.warn('LocalStorage settings parse error:', e);
  }

  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (loaded) {
    if (loaded.preferences) Object.assign(base.preferences, loaded.preferences);
    if (loaded.preferences && loaded.preferences.channels) Object.assign(base.preferences.channels, loaded.preferences.channels);
    if (loaded.preferences && loaded.preferences.motogp) Object.assign(base.preferences.motogp, loaded.preferences.motogp);
    if (loaded.tracks) Object.assign(base.tracks, loaded.tracks);
  }

  state.tracks = base.tracks;
  const p = base.preferences;
  state.unitMph = p.unitMph !== undefined ? p.unitMph : true;
  state.currentLayer = p.currentLayer || 'dark';
  state.heatmapMode = p.heatmapMode || 'speed';
  state.smoothingLevel = p.smoothingLevel || 'med';
  state.showSpeedExtrema = p.showSpeedExtrema !== undefined ? p.showSpeedExtrema : true;
  state.followBike = p.followBike !== undefined ? p.followBike : true;
  state.playbackSpeed = p.playbackSpeed || 1.0;
  if (p.motogp) Object.assign(state.motogp, p.motogp);
  if (p.channels) Object.assign(state.channels, p.channels);

  // Sync UI controls
  if (dom.lblUnitToggle) dom.lblUnitToggle.textContent = state.unitMph ? 'MPH' : 'KM/H';
  if (dom.selectSmoothing) dom.selectSmoothing.value = state.smoothingLevel;
  if (dom.selectMapLayer) dom.selectMapLayer.value = state.currentLayer;
  if (dom.selectHeatmapColor) dom.selectHeatmapColor.value = state.heatmapMode;
  if (dom.btnToggleExtrema) {
    dom.btnToggleExtrema.classList.toggle('active', state.showSpeedExtrema);
    dom.btnToggleExtrema.textContent = state.showSpeedExtrema ? '⚡ Speeds: ON' : '⚡ Speeds: OFF';
  }
  if (dom.btnFollowBike) dom.btnFollowBike.classList.toggle('active', state.followBike);

  // Sync Preferences Tab Inputs
  if (dom.prefSpeedUnit) dom.prefSpeedUnit.value = state.unitMph ? 'mph' : 'kmh';
  if (dom.prefMapLayer) dom.prefMapLayer.value = state.currentLayer;
  if (dom.prefSmoothing) dom.prefSmoothing.value = state.smoothingLevel;
  if (dom.prefHeatmap) dom.prefHeatmap.value = state.heatmapMode;
  if (dom.prefFollowBike) dom.prefFollowBike.checked = state.followBike;
  if (dom.prefShowExtrema) dom.prefShowExtrema.checked = state.showSpeedExtrema;

  // Sync channel toggle buttons
  document.querySelectorAll('.channel-toggle-btn').forEach(btn => {
    const ch = btn.dataset.channel;
    if (ch && state.channels[ch] !== undefined) {
      btn.classList.toggle('active', state.channels[ch]);
      btn.classList.toggle('channel-off', !state.channels[ch]);
    }
  });

  if (typeof renderTrackLibrary === 'function') renderTrackLibrary();
}

function saveSettingsToStorage() {
  const payload = {
    version: "1.0",
    preferences: {
      unitMph: state.unitMph,
      currentLayer: state.currentLayer,
      heatmapMode: state.heatmapMode,
      smoothingLevel: state.smoothingLevel,
      showSpeedExtrema: state.showSpeedExtrema,
      followBike: state.followBike,
      playbackSpeed: state.playbackSpeed,
      motogp: state.motogp,
      channels: state.channels
    },
    tracks: state.tracks
  };
  try {
    localStorage.setItem('dda_settings', JSON.stringify(payload, null, 2));
  } catch (e) {
    console.warn('Failed to save dda_settings to localStorage:', e);
  }
}

function exportSettingsFile() {
  const payload = {
    version: "1.0",
    preferences: {
      unitMph: state.unitMph,
      currentLayer: state.currentLayer,
      heatmapMode: state.heatmapMode,
      smoothingLevel: state.smoothingLevel,
      showSpeedExtrema: state.showSpeedExtrema,
      followBike: state.followBike,
      playbackSpeed: state.playbackSpeed,
      motogp: state.motogp,
      channels: state.channels
    },
    tracks: state.tracks
  };
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dda_settings.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importSettingsFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.preferences) {
        Object.assign(state.channels, data.preferences.channels || {});
        state.unitMph = data.preferences.unitMph !== undefined ? data.preferences.unitMph : state.unitMph;
        state.smoothingLevel = data.preferences.smoothingLevel || state.smoothingLevel;
        state.currentLayer = data.preferences.currentLayer || state.currentLayer;
        state.heatmapMode = data.preferences.heatmapMode || state.heatmapMode;
        if (data.preferences.motogp) Object.assign(state.motogp, data.preferences.motogp);
      }
      if (data.tracks) {
        Object.assign(state.tracks, data.tracks);
      }
      saveSettingsToStorage();
      initSettings();
      if (typeof applySmoothingToRecords === 'function') applySmoothingToRecords();
      alert('Successfully imported and merged settings & track library!');
    } catch (err) {
      alert(`Invalid settings JSON file: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

// Math & Navigation Utilities
function calculateBearing(lat1, lon1, lat2, lon2) {
  const radLat1 = lat1 * Math.PI / 180.0;
  const radLat2 = lat2 * Math.PI / 180.0;
  const dLon = (lon2 - lon1) * Math.PI / 180.0;
  const y = Math.sin(dLon) * Math.cos(radLat2);
  const x = Math.cos(radLat1) * Math.sin(radLat2) - Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180.0 / Math.PI + 360.0) % 360.0;
}

function moveCoordinate(lat, lon, bearingDeg, distMeters) {
  const R = 6371000.0;
  const dByR = distMeters / R;
  const radLat = lat * Math.PI / 180.0;
  const radLon = lon * Math.PI / 180.0;
  const radBrg = bearingDeg * Math.PI / 180.0;

  const lat2 = Math.asin(Math.sin(radLat) * Math.cos(dByR) + Math.cos(radLat) * Math.sin(dByR) * Math.cos(radBrg));
  const lon2 = radLon + Math.atan2(Math.sin(radBrg) * Math.sin(dByR) * Math.cos(radLat), Math.cos(dByR) - Math.sin(radLat) * Math.sin(lat2));

  return { lat: lat2 * 180.0 / Math.PI, lon: lon2 * 180.0 / Math.PI };
}

function haversineDistanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000.0;
  const dLat = (lat2 - lat1) * Math.PI / 180.0;
  const dLon = (lon2 - lon1) * Math.PI / 180.0;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180.0) * Math.cos(lat2 * Math.PI / 180.0) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2.0 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
}

function formatTime(sec) {
  if (sec === undefined || sec === null || isNaN(sec)) return '00:00.0';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

function formatLapTime(sec) {
  if (sec === undefined || sec === null || isNaN(sec)) return '00:00.00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function updateWorkspaceLayout(forceState = null) {
  const grid = document.querySelector('.workspace-grid');
  if (!grid) return;

  const isComparing = forceState !== null
    ? forceState
    : (state.threeColLayout || state.isCompareMode || (state.sectionSelection && state.sectionSelection.active));

  grid.classList.toggle('compare-layout-active', isComparing);
  if (dom.btnToggleLayout) dom.btnToggleLayout.classList.toggle('active', isComparing);
  if (dom.lblLayoutToggle) dom.lblLayoutToggle.textContent = isComparing ? '2-Col Layout' : '3-Col Split';

  setTimeout(() => {
    if (typeof resizeCanvas === 'function') resizeCanvas();
    if (typeof renderCharts === 'function') renderCharts();
    if (state.map) {
      state.map.invalidateSize();
      if (state.trackPolylineGroup && state.trackPolylineGroup.getLayers().length > 0) {
        state.map.fitBounds(state.trackPolylineGroup.getBounds(), { padding: [25, 25] });
      }
    }
  }, 120);
}

function toggleWorkspaceLayout() {
  state.threeColLayout = !state.threeColLayout;
  updateWorkspaceLayout(state.threeColLayout);
}
