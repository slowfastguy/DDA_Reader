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
    showApexMarkers: true,
    showChartTurnMarkers: true,
    redlineRpm: 12000,
    shiftLightStartRpm: 9600,
    shiftLightEndRpm: 12000,
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
      gear: true,
      deltaT: true,
      gLong: false,
      gLat: false,
      elevation: false,
      lineDelta: true
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
      ],
      turns: [
        { id: "t1", number: 1, name: "Turn 1", direction: "left", lat: 38.162168, lon: -122.455656, radius_m: 45, bearing: 320.0, description: "Uphill left sweep from front straight" },
        { id: "t2", number: 2, name: "Turn 2", direction: "right", lat: 38.161114, lon: -122.458717, radius_m: 45, bearing: 280.0, description: "Turn 2 crest & blind downhill right" },
        { id: "t3", number: 3, name: "Turn 3", direction: "left", lat: 38.162484, lon: -122.460971, radius_m: 40, bearing: 315.0, description: "Turn 3 off-camber uphill left" },
        { id: "t3a", number: "3A", name: "Turn 3A", direction: "right", lat: 38.162663, lon: -122.462052, radius_m: 40, bearing: 340.0, description: "Turn 3A transition crest right" },
        { id: "t4", number: 4, name: "Turn 4", direction: "right", lat: 38.164039, lon: -122.463375, radius_m: 45, bearing: 30.0, description: "Turn 4 downhill right chute" },
        { id: "t6", number: 6, name: "Turn 6 (Carousel)", direction: "right", lat: 38.164446, lon: -122.461381, radius_m: 55, bearing: 115.0, description: "High-speed sweeping Carousel" },
        { id: "t7", number: 7, name: "Turn 7", direction: "left", lat: 38.162654, lon: -122.459171, radius_m: 45, bearing: 155.0, description: "Turn 7 heavy braking hairpin left" },
        { id: "t8", number: 8, name: "Turn 8 (Esses)", direction: "left", lat: 38.162933, lon: -122.458235, radius_m: 40, bearing: 45.0, description: "Turn 8 uphill Esses entry left" },
        { id: "t8a", number: "8A", name: "Turn 8A (Esses)", direction: "right", lat: 38.163750, lon: -122.458050, radius_m: 40, bearing: 30.0, description: "Turn 8A Esses crest right" },
        { id: "t9", number: 9, name: "Turn 9", direction: "right", lat: 38.166251, lon: -122.462596, radius_m: 45, bearing: 290.0, description: "Turn 9 downhill right kink" },
        { id: "t10", number: 10, name: "Turn 10", direction: "right", lat: 38.165677, lon: -122.460327, radius_m: 50, bearing: 120.0, description: "Turn 10 fast sweeping right" },
        { id: "t11", number: 11, name: "Turn 11 (Hairpin)", direction: "right", lat: 38.160052, lon: -122.452472, radius_m: 40, bearing: 220.0, description: "Turn 11 slow hairpin onto front straight" }
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
      ],
      turns: [
        { id: "t1", number: 1, name: "Turn 1", direction: "left", lat: 36.585700, lon: -121.755800, radius_m: 45, bearing: 250.0, description: "Fast crest kink on front straight" },
        { id: "t2", number: 2, name: "Turn 2 (Andretti)", direction: "left", lat: 36.586400, lon: -121.758700, radius_m: 50, bearing: 140.0, description: "Andretti Hairpin double-apex left" },
        { id: "t3", number: 3, name: "Turn 3", direction: "right", lat: 36.587800, lon: -121.755400, radius_m: 40, bearing: 95.0, description: "90-degree right onto short chute" },
        { id: "t4", number: 4, name: "Turn 4", direction: "right", lat: 36.588000, lon: -121.753400, radius_m: 45, bearing: 120.0, description: "Fast sweeping right" },
        { id: "t5", number: 5, name: "Turn 5", direction: "left", lat: 36.585500, lon: -121.749500, radius_m: 45, bearing: 155.0, description: "Uphill sweeping banking left" },
        { id: "t6", number: 6, name: "Turn 6", direction: "left", lat: 36.584100, lon: -121.748700, radius_m: 45, bearing: 175.0, description: "Fast uphill left toward Rahal Straight" },
        { id: "t7", number: 7, name: "Turn 7", direction: "right", lat: 36.583300, lon: -121.749500, radius_m: 45, bearing: 235.0, description: "Rahal Straight uphill crest right" },
        { id: "t8", number: 8, name: "Turn 8 (Corkscrew)", direction: "left", lat: 36.582800, lon: -121.751100, radius_m: 40, bearing: 210.0, description: "Blind crest & 59ft downhill drop left" },
        { id: "t8a", number: "8A", name: "Turn 8A (Corkscrew Exit)", direction: "right", lat: 36.582500, lon: -121.751500, radius_m: 40, bearing: 230.0, description: "Corkscrew compression right transition" },
        { id: "t9", number: 9, name: "Turn 9 (Rainey Curve)", direction: "left", lat: 36.581600, lon: -121.753500, radius_m: 50, bearing: 290.0, description: "High-speed sweeping downhill left" },
        { id: "t10", number: 10, name: "Turn 10", direction: "right", lat: 36.582300, lon: -121.756200, radius_m: 45, bearing: 335.0, description: "Positive camber fast downhill right" },
        { id: "t11", number: 11, name: "Turn 11", direction: "left", lat: 36.583900, lon: -121.756800, radius_m: 40, bearing: 55.0, description: "Slow 90-degree left onto front straight" }
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
      ],
      turns: [
        { id: "t1", number: 1, name: "Turn 1", direction: "left", lat: 39.540800, lon: -122.331700, radius_m: 45, bearing: 340.0, description: "Fast entry left off front straight" },
        { id: "t2", number: 2, name: "Turn 2", direction: "left", lat: 39.544100, lon: -122.332700, radius_m: 55, bearing: 270.0, description: "Long continuous sweeping carousel left" },
        { id: "t3", number: 3, name: "Turn 3", direction: "right", lat: 39.545800, lon: -122.333800, radius_m: 45, bearing: 235.0, description: "Off-camber downhill right" },
        { id: "t4", number: 4, name: "Turn 4", direction: "left", lat: 39.545200, lon: -122.334900, radius_m: 40, bearing: 180.0, description: "Uphill transition left" },
        { id: "t5", number: 5, name: "Turn 5 (The Cyclone)", direction: "left", lat: 39.544000, lon: -122.336300, radius_m: 45, bearing: 205.0, description: "Steep blind crest & compression drop left" },
        { id: "t6", number: 6, name: "Turn 6", direction: "right", lat: 39.542200, lon: -122.336700, radius_m: 45, bearing: 175.0, description: "Fast sweeping right" },
        { id: "t7", number: 7, name: "Turn 7", direction: "left", lat: 39.541000, lon: -122.337000, radius_m: 40, bearing: 165.0, description: "Left kink onto back straight" },
        { id: "t8", number: 8, name: "Turn 8", direction: "left", lat: 39.538500, lon: -122.337800, radius_m: 50, bearing: 155.0, description: "High-speed 100+ mph sweeping left" },
        { id: "t9", number: 9, name: "Turn 9", direction: "left", lat: 39.536000, lon: -122.337500, radius_m: 45, bearing: 85.0, description: "Uphill blind crest left" },
        { id: "t10", number: 10, name: "Turn 10", direction: "right", lat: 39.535000, lon: -122.336500, radius_m: 45, bearing: 120.0, description: "Fast downhill right sweep" },
        { id: "t11", number: 11, name: "Turn 11", direction: "left", lat: 39.534800, lon: -122.334500, radius_m: 40, bearing: 40.0, description: "Heavy braking tight left hairpin" },
        { id: "t12", number: 12, name: "Turn 12", direction: "right", lat: 39.535300, lon: -122.334000, radius_m: 40, bearing: 30.0, description: "Esses right transition" },
        { id: "t13", number: 13, name: "Turn 13", direction: "right", lat: 39.535800, lon: -122.333500, radius_m: 40, bearing: 350.0, description: "Esses right kink" },
        { id: "t14", number: 14, name: "Turn 14", direction: "left", lat: 39.536200, lon: -122.332800, radius_m: 40, bearing: 330.0, description: "Approach left before final turn" },
        { id: "t15", number: 15, name: "Turn 15", direction: "left", lat: 39.536700, lon: -122.332000, radius_m: 45, bearing: 10.0, description: "Final fast left onto front straight" }
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
  showApexMarkers: true,
  showChartTurnMarkers: true,
  redlineRpm: 12000,
  shiftLightStartRpm: 9600,
  shiftLightEndRpm: 12000,
  heatmapMode: 'speed',
  smoothingLevel: 'med',
  gateEditMode: null,
  turnEditMode: false,
  isCompareMode: false,
  compareLapA: 8,
  compareLapB: 2,
  map: null,
  mapLayers: {},
  currentLayer: 'dark',
  trackPolylineGroup: null,
  gatesLayerGroup: null,
  extremaLayerGroup: null,
  apexesLayerGroup: null,
  highlightedTurnId: null,
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
    gear: true,
    deltaT: true,
    gLong: false,
    gLat: false
  },
  video: {
    hasVideo: false,
    file: null,
    videoUrl: null,
    offsetSeconds: 0.0,    // t_video = t_telemetry + offsetSeconds
    viewMode: 'split',     // 'map-only', 'split', 'video-only', 'pip'
    overlayEnabled: true,
    overlayTheme: 'motogp', // 'motogp', 'panigale_dash', 'minimal'
    audioMuted: false,
    volume: 1.0,
    pipPosition: { x: 20, y: 20 },
    videoLapB: {
      hasVideo: false,
      file: null,
      videoUrl: null,
      offsetSeconds: 0.0
    }
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
  threeColLayout: false,
  layout: {
    sidebarWidth: 420,
    chartsHeight: 280,
    topSplitPct: 50,
    sidebarCollapsed: false,
    chartsCollapsed: false,
    maximizedPanel: null
  },
  cardsConfig: {
    order: ['laptimes', 'timing', 'cluster', 'lean', 'gg', 'phases'],
    collapsed: {},
    hidden: {},
    compactDensity: false
  }
};

// DOM Elements Cache
const dom = {
  mainWorkspace: document.getElementById('main-workspace'),
  workspaceLayoutRow: document.getElementById('workspace-layout-row'),
  workspaceLeft: document.getElementById('workspace-left'),
  workspaceTopRow: document.getElementById('workspace-top-row'),
  panelMap: document.getElementById('panel-map'),
  panelCharts: document.getElementById('panel-charts'),
  panelData: document.getElementById('panel-data'),
  dataBodyScroll: document.getElementById('data-body-scroll'),
  btnCustomizeCards: document.getElementById('btn-customize-cards'),
  btnToggleDensity: document.getElementById('btn-toggle-density'),
  lblDensityMode: document.getElementById('lbl-density-mode'),
  btnCollapseAllCards: document.getElementById('btn-collapse-all-cards'),
  btnExpandAllCards: document.getElementById('btn-expand-all-cards'),
  btnResetCardsOrder: document.getElementById('btn-reset-cards-order'),
  headerClusterSpeed: document.getElementById('header-cluster-speed'),
  btnPresetDefault: document.getElementById('btn-preset-default'),
  btnPresetTrackFocus: document.getElementById('btn-preset-track-focus'),
  btnPresetTelemetryFocus: document.getElementById('btn-preset-telemetry-focus'),
  btnPresetLaptop: document.getElementById('btn-preset-laptop'),
  btnResetEntireLayout: document.getElementById('btn-reset-entire-layout'),
  resizerSidebar: document.getElementById('resizer-sidebar'),
  resizerCharts: document.getElementById('resizer-charts'),
  resizerTopSplit: document.getElementById('resizer-top-split'),
  btnMaximizeMap: document.getElementById('btn-maximize-map'),
  btnMaximizeCharts: document.getElementById('btn-maximize-charts'),
  btnCollapseCharts: document.getElementById('btn-collapse-charts'),
  btnCollapseSidebar: document.getElementById('btn-collapse-sidebar'),
  btnFloatingSidebarExpand: document.getElementById('btn-floating-sidebar-expand'),
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
  btnDropdownAnalysis: document.getElementById('btn-dropdown-analysis'),
  btnDropdownView: document.getElementById('btn-dropdown-view'),
  btnDropdownVideo: document.getElementById('btn-dropdown-video'),
  btnMenuSelectSection: document.getElementById('btn-menu-select-section'),
  btnMenuOptimalLap: document.getElementById('btn-menu-optimal-lap'),
  btnMenuAddTurn: document.getElementById('btn-menu-add-turn'),
  btnMenuExtrema: document.getElementById('btn-menu-extrema'),
  lblMenuExtrema: document.getElementById('lbl-menu-extrema'),
  btnToggleApexMarkers: document.getElementById('btn-toggle-apex-markers'),
  lblMenuApexes: document.getElementById('lbl-menu-apexes'),
  btnToggleChartTurns: document.getElementById('btn-toggle-chart-turns'),
  lblMenuChartTurns: document.getElementById('lbl-menu-chart-turns'),
  btnChartTurnsToggle: document.getElementById('btn-chart-turns-toggle'),
  prefShowChartTurns: document.getElementById('pref-show-chart-turns'),
  btnMenuFitBounds: document.getElementById('btn-menu-fit-bounds'),
  btnMenuOpenSync: document.getElementById('btn-menu-open-sync'),
  lblMotogpStatus: document.getElementById('lbl-motogp-status'),
  btnOpenSettings: document.getElementById('btn-open-settings'),
  btnLoadFile: document.getElementById('btn-load-file'),
  fileInput: document.getElementById('file-input'),
  settingsFileInput: document.getElementById('settings-file-input'),
  mapPanelTitle: document.getElementById('map-panel-title'),
  chartsPanelTitle: document.getElementById('charts-panel-title'),
  btnGateSf: document.getElementById('btn-gate-sf'),
  btnGateSplit: document.getElementById('btn-gate-split'),
  btnAddTurn: document.getElementById('btn-add-turn'),
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
  lblTachRedline: document.getElementById('lbl-tach-redline'),
  lblScaleRedline: document.getElementById('lbl-scale-redline'),
  tachScaleRow: document.getElementById('tach-scale-row'),
  btnQuickRedline: document.getElementById('btn-quick-redline'),
  prefRedlineSlider: document.getElementById('pref-redline-slider'),
  prefRedlineInput: document.getElementById('pref-redline-input'),
  prefShiftStartSlider: document.getElementById('pref-shift-start-slider'),
  prefShiftStartInput: document.getElementById('pref-shift-start-input'),
  prefShiftEndSlider: document.getElementById('pref-shift-end-slider'),
  prefShiftEndInput: document.getElementById('pref-shift-end-input'),
  dataMenuRedlineSlider: document.getElementById('data-menu-redline-slider'),
  dataMenuRedlineInput: document.getElementById('data-menu-redline-input'),
  dataMenuShiftStartSlider: document.getElementById('data-menu-shift-start-slider'),
  dataMenuShiftStartInput: document.getElementById('data-menu-shift-start-input'),
  dataMenuShiftEndSlider: document.getElementById('data-menu-shift-end-slider'),
  dataMenuShiftEndInput: document.getElementById('data-menu-shift-end-input'),
  lblBandGreen: document.getElementById('lbl-band-green'),
  lblBandYellow: document.getElementById('lbl-band-yellow'),
  lblBandRed: document.getElementById('lbl-band-red'),
  valSpeedNumeric: document.getElementById('val-speed-numeric'),
  lblSpeedUnit: document.getElementById('lbl-speed-unit'),
  valGear: document.getElementById('val-gear'),
  tpsMeterFill: document.getElementById('tps-meter-fill'),
  valTpsNumeric: document.getElementById('val-tps-numeric'),
  valDtcSlow: document.getElementById('val-dtc-slow'),
  dtcSlowPill: document.getElementById('dtc-slow-pill'),
  valDtcFast: document.getElementById('val-dtc-fast'),
  dtcFastPill: document.getElementById('dtc-fast-pill'),
  valGlongNumeric: document.getElementById('val-glong-numeric'),
  valGlatNumeric: document.getElementById('val-glat-numeric'),
  valAltNumeric: document.getElementById('val-alt-numeric'),
  valDistNumeric: document.getElementById('val-dist-numeric'),
  telemetryCanvas: document.getElementById('telemetry-canvas'),
  chartScrubberLine: document.getElementById('chart-scrubber-line'),
  chartTooltip: document.getElementById('chart-tooltip'),
  btnResetZoom: document.getElementById('btn-reset-zoom'),
  legCompareSpd: document.getElementById('leg-compare-spd'),
  legCompareDelta: document.getElementById('leg-compare-delta'),
  legCompareLineDelta: document.getElementById('leg-compare-linedelta'),
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

  // G-G Friction Circle Elements
  ggCanvas: document.getElementById('gg-canvas'),
  valGgTotal: document.getElementById('val-gg-total'),
  valMaxBrakeG: document.getElementById('val-max-brake-g'),
  valMaxAccelG: document.getElementById('val-max-accel-g'),
  valMaxLatG: document.getElementById('val-max-lat-g'),

  // Lean vs Throttle Matrix Elements
  btnOpenMatrix: document.getElementById('btn-open-matrix'),
  modalLeanThrottle: document.getElementById('modal-lean-throttle'),
  btnCloseMatrix: document.getElementById('btn-close-matrix'),
  selectMatrixLap: document.getElementById('select-matrix-lap'),
  leanThrottleTable: document.getElementById('lean-throttle-table'),
  kpiPickupLean: document.getElementById('kpi-pickup-lean'),
  kpiUprightGas: document.getElementById('kpi-upright-gas'),
  kpiLeanRisk: document.getElementById('kpi-lean-risk'),

  // Riding Phases Elements
  valCoastSummary: document.getElementById('val-coast-summary'),
  phaseBarAccel: document.getElementById('phase-bar-accel'),
  phaseBarMaint: document.getElementById('phase-bar-maint'),
  phaseBarBrake: document.getElementById('phase-bar-brake'),
  phaseBarCoast: document.getElementById('phase-bar-coast'),
  valPhaseAccelPct: document.getElementById('val-phase-accel-pct'),
  valPhaseMaintPct: document.getElementById('val-phase-maint-pct'),
  valPhaseBrakePct: document.getElementById('val-phase-brake-pct'),
  valPhaseCoastPct: document.getElementById('val-phase-coast-pct'),

  // Turn-by-Turn Scorecard Elements
  btnOpenScorecard: document.getElementById('btn-open-scorecard'),
  modalScorecard: document.getElementById('modal-scorecard'),
  btnCloseScorecard: document.getElementById('btn-close-scorecard'),
  selectScorecardLap: document.getElementById('select-scorecard-lap'),
  kpiScorecardTurns: document.getElementById('kpi-scorecard-turns'),
  kpiScorecardTurns: document.getElementById('kpi-scorecard-turns'),
  kpiScorecardApexSpd: document.getElementById('kpi-scorecard-apex-spd'),
  kpiScorecardCoast: document.getElementById('kpi-scorecard-coast'),
  kpiScorecardConsistency: document.getElementById('kpi-scorecard-consistency'),
  kpiScorecardBestApex: document.getElementById('kpi-scorecard-best-apex'),
  scorecardTableBody: document.getElementById('scorecard-table-body'),
  btnCopyScorecard: document.getElementById('btn-copy-scorecard'),
  btnExportScorecardCsv: document.getElementById('btn-export-scorecard-csv'),
  btnToggleApexMarkers: document.getElementById('btn-toggle-apex-markers'),
  lblMenuApexes: document.getElementById('lbl-menu-apexes'),

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

  // Video Integration Elements
  panelVideo: document.getElementById('panel-video'),
  videoPlayer: document.getElementById('video-player'),
  videoOverlayCanvas: document.getElementById('video-overlay-canvas'),
  videoDropzone: document.getElementById('video-dropzone'),
  videoFileInput: document.getElementById('video-file-input'),
  videoLapBFileInput: document.getElementById('video-lap-b-file-input'),
  videoSyncDrawer: document.getElementById('video-sync-drawer'),
  lblVideoOffset: document.getElementById('lbl-video-offset'),
  btnSyncSF: document.getElementById('btn-sync-sf'),
  btnSyncReset: document.getElementById('btn-sync-reset'),
  btnCloseSyncDrawer: document.getElementById('btn-close-sync-drawer'),
  btnNudgeBack10: document.getElementById('btn-nudge-back-10'),
  btnNudgeBack1: document.getElementById('btn-nudge-back-1'),
  btnNudgeFwd1: document.getElementById('btn-nudge-fwd-1'),
  btnNudgeFwd10: document.getElementById('btn-nudge-fwd-10'),
  btnVideoViewMap: document.getElementById('btn-video-view-map'),
  btnVideoViewSplit: document.getElementById('btn-video-view-split'),
  btnVideoViewVideo: document.getElementById('btn-video-view-video'),
  btnVideoViewPip: document.getElementById('btn-video-view-pip'),
  btnMenuViewMap: document.getElementById('btn-menu-view-map'),
  btnMenuViewSplit: document.getElementById('btn-menu-view-split'),
  btnMenuViewVideo: document.getElementById('btn-menu-view-video'),
  btnMenuViewPip: document.getElementById('btn-menu-view-pip'),
  btnToggleVideoMute: document.getElementById('btn-toggle-video-mute'),
  btnToggleVideoOverlay: document.getElementById('btn-toggle-video-overlay'),
  btnOpenVideoSync: document.getElementById('btn-open-video-sync'),
  btnHeaderLoadVideo: document.getElementById('btn-header-load-video'),
  lblHeaderVideoStatus: document.getElementById('lbl-header-video-status'),
  videoLapBPlayer: document.getElementById('video-lap-b-player'),
  dualVideoWrapper: document.getElementById('dual-video-wrapper'),
  singleVideoWrapper: document.getElementById('single-video-wrapper'),
  lblVideoLapATitle: document.getElementById('lbl-video-lap-a-title'),
  lblVideoLapBTitle: document.getElementById('lbl-video-lap-b-title'),
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
  btnRenderVideo: document.getElementById('btn-render-video'),
  prefShowApexMarkers: document.getElementById('pref-show-apex-markers')
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
    if (loaded.tracks) {
      for (const trackKey in loaded.tracks) {
        if (base.tracks[trackKey]) {
          const loadedTrk = loaded.tracks[trackKey];
          if (!loadedTrk.turns && base.tracks[trackKey].turns) {
            loadedTrk.turns = base.tracks[trackKey].turns;
          }
          base.tracks[trackKey] = Object.assign(base.tracks[trackKey], loadedTrk);
        } else {
          base.tracks[trackKey] = loaded.tracks[trackKey];
        }
      }
    }
  }

  state.tracks = base.tracks;
  const p = base.preferences;
  state.unitMph = p.unitMph !== undefined ? p.unitMph : true;
  state.currentLayer = p.currentLayer || 'dark';
  state.heatmapMode = p.heatmapMode || 'speed';
  state.smoothingLevel = p.smoothingLevel || 'med';
  state.showSpeedExtrema = p.showSpeedExtrema !== undefined ? p.showSpeedExtrema : true;
  state.showApexMarkers = p.showApexMarkers !== undefined ? p.showApexMarkers : true;
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
  if (dom.btnToggleApexMarkers) {
    dom.btnToggleApexMarkers.classList.toggle('active', state.showApexMarkers);
    dom.btnToggleApexMarkers.textContent = state.showApexMarkers ? '📍 Apexes: ON' : '📍 Apexes: OFF';
  }
  if (dom.lblMenuApexes) {
    dom.lblMenuApexes.textContent = state.showApexMarkers ? 'Turn Apex Markers: ON' : 'Turn Apex Markers: OFF';
  }
  if (dom.btnFollowBike) dom.btnFollowBike.classList.toggle('active', state.followBike);

  // Sync Preferences Tab Inputs
  if (dom.prefSpeedUnit) dom.prefSpeedUnit.value = state.unitMph ? 'mph' : 'kmh';
  if (dom.prefMapLayer) dom.prefMapLayer.value = state.currentLayer;
  if (dom.prefSmoothing) dom.prefSmoothing.value = state.smoothingLevel;
  if (dom.prefHeatmap) dom.prefHeatmap.value = state.heatmapMode;
  if (dom.prefFollowBike) dom.prefFollowBike.checked = state.followBike;
  if (dom.prefShowExtrema) dom.prefShowExtrema.checked = state.showSpeedExtrema;
  if (dom.prefShowApexMarkers) dom.prefShowApexMarkers.checked = state.showApexMarkers;
  if (dom.prefShowChartTurns) dom.prefShowChartTurns.checked = state.showChartTurnMarkers !== false;
  if (dom.prefRedlineSlider) dom.prefRedlineSlider.value = state.redlineRpm || 12000;
  if (dom.prefRedlineInput) dom.prefRedlineInput.value = state.redlineRpm || 12000;
  if (dom.prefShiftStartSlider) dom.prefShiftStartSlider.value = state.shiftLightStartRpm || Math.round((state.redlineRpm || 12000) * 0.80);
  if (dom.prefShiftStartInput) dom.prefShiftStartInput.value = state.shiftLightStartRpm || Math.round((state.redlineRpm || 12000) * 0.80);
  if (dom.prefShiftEndSlider) dom.prefShiftEndSlider.value = state.shiftLightEndRpm || (state.redlineRpm || 12000);
  if (dom.prefShiftEndInput) dom.prefShiftEndInput.value = state.shiftLightEndRpm || (state.redlineRpm || 12000);
  if (dom.dataMenuRedlineSlider) dom.dataMenuRedlineSlider.value = state.redlineRpm || 12000;
  if (dom.dataMenuRedlineInput) dom.dataMenuRedlineInput.value = state.redlineRpm || 12000;
  if (dom.dataMenuShiftStartSlider) dom.dataMenuShiftStartSlider.value = state.shiftLightStartRpm || Math.round((state.redlineRpm || 12000) * 0.80);
  if (dom.dataMenuShiftStartInput) dom.dataMenuShiftStartInput.value = state.shiftLightStartRpm || Math.round((state.redlineRpm || 12000) * 0.80);
  if (dom.dataMenuShiftEndSlider) dom.dataMenuShiftEndSlider.value = state.shiftLightEndRpm || (state.redlineRpm || 12000);
  if (dom.dataMenuShiftEndInput) dom.dataMenuShiftEndInput.value = state.shiftLightEndRpm || (state.redlineRpm || 12000);
  if (dom.lblTachRedline) dom.lblTachRedline.textContent = (state.redlineRpm || 12000).toLocaleString();
  if (typeof updateTachScale === 'function') updateTachScale(state.redlineRpm || 12000);
  if (typeof updateShiftLightBandsUI === 'function') updateShiftLightBandsUI();
  if (dom.btnChartTurnsToggle) {
    dom.btnChartTurnsToggle.classList.toggle('active', state.showChartTurnMarkers !== false);
    dom.btnChartTurnsToggle.textContent = state.showChartTurnMarkers !== false ? '📍 Turns: ON' : '📍 Turns: OFF';
  }
  if (dom.lblMenuChartTurns) {
    dom.lblMenuChartTurns.textContent = state.showChartTurnMarkers !== false ? 'Chart Turn Markers: ON' : 'Chart Turn Markers: OFF';
  }

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
      showApexMarkers: state.showApexMarkers,
      showChartTurnMarkers: state.showChartTurnMarkers !== false,
      redlineRpm: state.redlineRpm || 12000,
      shiftLightStartRpm: state.shiftLightStartRpm || Math.round((state.redlineRpm || 12000) * 0.80),
      shiftLightEndRpm: state.shiftLightEndRpm || (state.redlineRpm || 12000),
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
      showApexMarkers: state.showApexMarkers,
      showChartTurnMarkers: state.showChartTurnMarkers !== false,
      redlineRpm: state.redlineRpm || 12000,
      shiftLightStartRpm: state.shiftLightStartRpm || Math.round((state.redlineRpm || 12000) * 0.80),
      shiftLightEndRpm: state.shiftLightEndRpm || (state.redlineRpm || 12000),
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
        if (data.preferences.showChartTurnMarkers !== undefined) state.showChartTurnMarkers = data.preferences.showChartTurnMarkers;
        if (data.preferences.redlineRpm !== undefined) state.redlineRpm = data.preferences.redlineRpm;
        if (data.preferences.shiftLightStartRpm !== undefined) state.shiftLightStartRpm = data.preferences.shiftLightStartRpm;
        if (data.preferences.shiftLightEndRpm !== undefined) state.shiftLightEndRpm = data.preferences.shiftLightEndRpm;
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

function escapeHTML(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
