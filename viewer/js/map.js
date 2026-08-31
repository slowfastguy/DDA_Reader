/**
 * map.js - GPS Track Map, Heatmap Overlays, Speed Extrema, and Corner Comparison Engine
 * Ducati DDA Telemetry & GPS Visualizer
 */

function initMap() {
  state.map = L.map('map-container', {
    zoomControl: true,
    attributionControl: false
  }).setView([38.1615, -122.4580], 15);

  state.mapLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
  state.mapLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd' });
  state.mapLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });

  const activeL = state.mapLayers[state.currentLayer] || state.mapLayers.dark;
  activeL.addTo(state.map);

  state.trackPolylineGroup = L.featureGroup().addTo(state.map);
  state.gatesLayerGroup = L.featureGroup().addTo(state.map);
  state.extremaLayerGroup = L.featureGroup().addTo(state.map);
  state.sectionHighlightLayer = L.featureGroup().addTo(state.map);
  state.sectionHandlesLayer = L.featureGroup().addTo(state.map);
  state.sectionGhostsLayer = L.featureGroup().addTo(state.map);

  const bikeIcon = L.divIcon({
    className: 'bike-marker-icon',
    html: `
      <div class="bike-marker-pulse">
        <svg id="bike-marker-svg" class="bike-arrow-svg" viewBox="0 0 24 24" width="20" height="20">
          <path d="M12 2 L20 20 L12 16 L4 20 Z" fill="#ffffff" stroke="#e10600" stroke-width="1.5"/>
        </svg>
      </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
  state.bikeMarker = L.marker([38.1615, -122.4580], { icon: bikeIcon, zIndexOffset: 1000 }).addTo(state.map);

  const ghostIcon = L.divIcon({
    className: 'bike-marker-icon',
    html: `
      <div class="bike-marker-ghost">
        <svg id="ghost-marker-svg" class="bike-arrow-svg" viewBox="0 0 24 24" width="18" height="18">
          <path d="M12 2 L20 20 L12 16 L4 20 Z" fill="#ffd600" stroke="#000000" stroke-width="1.5"/>
        </svg>
      </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
  state.ghostMarker = L.marker([38.1615, -122.4580], { icon: ghostIcon, zIndexOffset: 990 });

  state.map.on('click', (e) => {
    if (state.gateEditMode && typeof handleGateMapClick === 'function') {
      handleGateMapClick(e.latlng);
    }
  });

  initSectionDragInteractions();
}

function renderMapTrack(shouldFitBounds = false) {
  if (!state.activeRecords || state.activeRecords.length === 0) return;
  state.trackPolylineGroup.clearLayers();

  // If in section comparison mode, section highlights handle map rendering
  if (state.sectionSelection && state.sectionSelection.active) {
    renderSectionHighlight();
    return;
  }

  const gpsPoints = state.activeRecords.filter(r => r.gps_lat !== null && r.gps_lon !== null);
  if (gpsPoints.length === 0) return;

  const maxSpeed = state.sessionData?.stats?.max_speed_kmh || 180;
  const maxLean = 45.0;

  for (let i = 0; i < gpsPoints.length - 1; i++) {
    const p1 = gpsPoints[i];
    const p2 = gpsPoints[i + 1];

    let color = '#e10600';
    if (state.heatmapMode === 'speed') {
      const ratio = Math.min(1.0, (p1.speed_kmh || 0) / maxSpeed);
      color = getHeatmapColor(ratio);
    } else if (state.heatmapMode === 'phases') {
      // 🟢 Accel (#00e676) | 🟡 Maint (#ffd600) | 🔴 Brake (#ff1744) | ⚪ Coast (#ff9100)
      const tps = p1.tps_pct || 0;
      const gLong = p1.accel_long_g !== undefined ? p1.accel_long_g : 0;
      if (tps >= 60) {
        color = '#00e676'; // Full Power / Acceleration
      } else if (tps >= 5) {
        color = '#ffd600'; // Maintenance Throttle
      } else if (gLong < -0.35) {
        color = '#ff1744'; // Heavy Braking
      } else {
        color = '#ff9100'; // Coasting / Roll Time
      }
    } else if (state.heatmapMode === 'throttle') {
      const ratio = (p1.tps_pct || 0) / 100.0;
      color = getHeatmapColor(ratio);
    } else if (state.heatmapMode === 'lean') {
      const ratio = Math.min(1.0, Math.abs(p1.lean_angle_deg || 0) / maxLean);
      color = getHeatmapColor(ratio);
    } else if (state.heatmapMode === 'gear') {
      const gearColors = ['#9e9e9e', '#00e5ff', '#00e676', '#ffd600', '#ff9100', '#ff0055', '#d500f9'];
      color = gearColors[p1.gear || 0] || '#e10600';
    }

    const poly = L.polyline([[p1.gps_lat, p1.gps_lon], [p2.gps_lat, p2.gps_lon]], {
      color: color,
      weight: 4.5,
      opacity: 0.85
    });

    const targetIdx = p1.local_index !== undefined ? p1.local_index : i;
    poly.on('click', () => {
      if (!state.sectionSelection.isSelecting && !state.sectionSelection.isDragging) {
        if (typeof seekToIndex === 'function') seekToIndex(targetIdx);
      }
    });

    state.trackPolylineGroup.addLayer(poly);
  }

  if (dom.legendMin && dom.legendMax) {
    if (state.heatmapMode === 'speed') {
      dom.legendMin.textContent = state.unitMph ? '0 mph' : '0 km/h';
      dom.legendMax.textContent = state.unitMph ? `${(maxSpeed * 0.621371).toFixed(0)} mph` : `${maxSpeed.toFixed(0)} km/h`;
    } else if (state.heatmapMode === 'phases') {
      dom.legendMin.textContent = '🔴 Brake / ⚪ Coast';
      dom.legendMax.textContent = '🟢 Accel / 🟡 Maint';
    } else if (state.heatmapMode === 'throttle') {
      dom.legendMin.textContent = '0% TPS';
      dom.legendMax.textContent = '100% TPS';
    } else if (state.heatmapMode === 'lean') {
      dom.legendMin.textContent = '0° Upright';
      dom.legendMax.textContent = '45° Full Lean';
    }
  }

  if (shouldFitBounds && state.map) {
    state.map.fitBounds(state.trackPolylineGroup.getBounds(), { padding: [30, 30] });
  }

  renderSpeedExtremaMarkers();
  updateRidingPhasesBreakdown();
}

function updateRidingPhasesBreakdown() {
  if (!dom.phaseBarAccel || !state.activeRecords || state.activeRecords.length === 0) return;
  const recs = state.activeRecords;

  let accelFrames = 0;
  let maintFrames = 0;
  let brakeFrames = 0;
  let coastFrames = 0;
  const total = recs.length;

  for (let i = 0; i < total; i++) {
    const r = recs[i];
    const tps = r.tps_pct || 0;
    const gLong = r.accel_long_g !== undefined ? r.accel_long_g : 0;

    if (tps >= 60) {
      accelFrames++;
    } else if (tps >= 5) {
      maintFrames++;
    } else if (gLong < -0.35) {
      brakeFrames++;
    } else {
      coastFrames++;
    }
  }

  const pAccel = ((accelFrames / total) * 100).toFixed(0);
  const pMaint = ((maintFrames / total) * 100).toFixed(0);
  const pBrake = ((brakeFrames / total) * 100).toFixed(0);
  const pCoast = ((coastFrames / total) * 100).toFixed(0);
  const coastTimeSec = (coastFrames * 0.1).toFixed(1);

  if (dom.phaseBarAccel) dom.phaseBarAccel.style.width = `${pAccel}%`;
  if (dom.phaseBarMaint) dom.phaseBarMaint.style.width = `${pMaint}%`;
  if (dom.phaseBarBrake) dom.phaseBarBrake.style.width = `${pBrake}%`;
  if (dom.phaseBarCoast) dom.phaseBarCoast.style.width = `${pCoast}%`;

  if (dom.valPhaseAccelPct) dom.valPhaseAccelPct.textContent = `${pAccel}%`;
  if (dom.valPhaseMaintPct) dom.valPhaseMaintPct.textContent = `${pMaint}%`;
  if (dom.valPhaseBrakePct) dom.valPhaseBrakePct.textContent = `${pBrake}%`;
  if (dom.valPhaseCoastPct) dom.valPhaseCoastPct.textContent = `${pCoast}%`;

  if (dom.valCoastSummary) {
    dom.valCoastSummary.textContent = `${coastTimeSec}s Coast`;
  }
}

function getHeatmapColor(ratio) {
  const colors = [
    { r: 0, g: 229, b: 255 },
    { r: 0, g: 230, b: 118 },
    { r: 255, g: 214, b: 0 },
    { r: 255, g: 145, b: 0 },
    { r: 225, g: 6, b: 0 }
  ];

  const scaled = Math.max(0, Math.min(1, ratio)) * (colors.length - 1);
  const idx = Math.floor(scaled);
  const frac = scaled - idx;

  if (idx >= colors.length - 1) {
    const c = colors[colors.length - 1];
    return `rgb(${c.r}, ${c.g}, ${c.b})`;
  }

  const c1 = colors[idx];
  const c2 = colors[idx + 1];
  const r = Math.round(c1.r + (c2.r - c1.r) * frac);
  const g = Math.round(c1.g + (c2.g - c1.g) * frac);
  const b = Math.round(c1.b + (c2.b - c1.b) * frac);
  return `rgb(${r}, ${g}, ${b})`;
}

function renderSpeedExtremaMarkers() {
  state.extremaLayerGroup.clearLayers();
  if (!state.showSpeedExtrema || !state.activeRecords || state.activeRecords.length < 30) return;
  if (state.sectionSelection && state.sectionSelection.active) return; // Hide global extrema in corner comparison mode

  const recs = state.activeRecords;
  const n = recs.length;
  const extrema = [];
  const win = 18;

  for (let i = win; i < n - win; i += 4) {
    const spd = recs[i].speed_kmh || 0;
    if (spd < 15.0) continue;

    let isMin = true;
    let isMax = true;
    for (let k = i - win; k <= i + win; k++) {
      if (k === i) continue;
      const otherSpd = recs[k].speed_kmh || 0;
      if (otherSpd <= spd) isMin = false;
      if (otherSpd >= spd) isMax = false;
    }

    if (isMin && spd < 140.0) {
      extrema.push({ type: 'min', index: i, record: recs[i], speed: spd });
    } else if (isMax && spd > 90.0) {
      extrema.push({ type: 'max', index: i, record: recs[i], speed: spd });
    }
  }

  const filtered = [];
  for (const cand of extrema) {
    const tooClose = filtered.some(f => {
      const d = haversineDistanceM(f.record.gps_lat, f.record.gps_lon, cand.record.gps_lat, cand.record.gps_lon);
      return d < 45.0;
    });
    if (!tooClose && cand.record.gps_lat !== null && cand.record.gps_lon !== null) {
      filtered.push(cand);
    }
  }

  filtered.forEach(ext => {
    const spdDisplay = state.unitMph ? `${(ext.speed * 0.621371).toFixed(0)}` : `${ext.speed.toFixed(0)}`;
    const unitLabel = state.unitMph ? 'mph' : 'km/h';
    const isMin = ext.type === 'min';

    const pillIcon = L.divIcon({
      className: 'speed-extrema-icon',
      html: `
        <div class="speed-extrema-pill ${isMin ? 'speed-extrema-min' : 'speed-extrema-max'}">
          <span>${isMin ? '🔻' : '🔺'} ${spdDisplay}</span><small>${unitLabel}</small>
        </div>
      `,
      iconSize: [60, 20],
      iconAnchor: [30, 10]
    });

    const marker = L.marker([ext.record.gps_lat, ext.record.gps_lon], { icon: pillIcon });
    marker.on('click', () => {
      if (typeof seekToIndex === 'function') seekToIndex(ext.index);
    });
    state.extremaLayerGroup.addLayer(marker);
  });
}

function findClosestTrackPoint(lat, lon) {
  if (!state.records || state.records.length === 0) return null;
  let minD = Infinity;
  let best = null;

  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    if (r.gps_lat === null || r.gps_lon === null) continue;
    const d = haversineDistanceM(lat, lon, r.gps_lat, r.gps_lon);
    if (d < minD) {
      minD = d;
      best = {
        lat: r.gps_lat,
        lon: r.gps_lon,
        distance_m: r.distance_m || 0,
        time_s: r.time_s || 0,
        speed_kmh: r.speed_kmh || 0,
        orig_index: r.orig_index !== undefined ? r.orig_index : i,
        distToClick: d
      };
    }
  }
  return best;
}

function updateGhostMarker(interpDistA, interpTimeA, rA) {
  if (!state.isCompareMode || !state.ghostMarker) return;
  const lapB = state.laps.find(l => l.lap_number === state.compareLapB);
  if (!lapB) return;
  const recsB = state.records.slice(lapB.start_index, lapB.end_index);
  if (recsB.length < 2) return;

  const relDist = interpDistA - state.activeRecords[0].distance_m;
  let idxB0 = 0;
  for (let i = 0; i < recsB.length - 1; i++) {
    const d0 = recsB[i].distance_m - recsB[0].distance_m;
    const d1 = recsB[i + 1].distance_m - recsB[0].distance_m;
    if (relDist >= d0 && relDist <= d1) {
      idxB0 = i;
      break;
    } else if (relDist < d0) {
      idxB0 = i;
      break;
    }
  }
  const idxB1 = Math.min(recsB.length - 1, idxB0 + 1);
  const b0 = recsB[idxB0];
  const b1 = recsB[idxB1];
  const span = Math.max(0.001, (b1.distance_m || 0) - (b0.distance_m || 0));
  const fracB = Math.max(0, Math.min(1, (relDist - ((b0.distance_m || 0) - recsB[0].distance_m)) / span));

  if (b0.gps_lat !== null && b1.gps_lat !== null) {
    const gLat = b0.gps_lat + (b1.gps_lat - b0.gps_lat) * fracB;
    const gLon = b0.gps_lon + (b1.gps_lon - b0.gps_lon) * fracB;
    state.ghostMarker.setLatLng([gLat, gLon]);

    for (let f = idxB0 + 1; f < Math.min(recsB.length, idxB0 + 10); f++) {
      const nextB = recsB[f];
      if (nextB && nextB.gps_lat !== null && nextB.gps_lon !== null) {
        const d = haversineDistanceM(gLat, gLon, nextB.gps_lat, nextB.gps_lon);
        if (d >= 0.4) {
          const targetGBrg = calculateBearing(gLat, gLon, nextB.gps_lat, nextB.gps_lon);
          let diffG = (targetGBrg - state.lastGhostHeading) % 360;
          if (diffG > 180) diffG -= 360;
          if (diffG < -180) diffG += 360;
          state.lastGhostHeading = (state.lastGhostHeading + diffG * 0.4 + 360) % 360;
          break;
        }
      }
    }

    const gEl = state.ghostMarker.getElement();
    const gArrow = gEl ? gEl.querySelector('.bike-arrow-svg') : document.getElementById('ghost-marker-svg');
    if (gArrow) {
      gArrow.style.transform = `rotate(${state.lastGhostHeading}deg)`;
    }

    // Time Delta (Δt)
    if (dom.valDeltaTime) {
      const elapsedA = interpTimeA - state.activeRecords[0].time_s;
      const elapsedB = ((b0.time_s || 0) + ((b1.time_s || 0) - (b0.time_s || 0)) * fracB) - recsB[0].time_s;
      const deltaT = elapsedB - elapsedA;
      dom.valDeltaTime.textContent = `${deltaT >= 0 ? '+' : ''}${deltaT.toFixed(2)}s`;
      dom.valDeltaTime.className = `val-mono ${deltaT >= 0 ? 'text-green' : 'text-red'}`;
    }

    // Speed Delta (Δv)
    if (dom.valDeltaSpeed) {
      const interpSpdB = (b0.speed_kmh || 0) + ((b1.speed_kmh || 0) - (b0.speed_kmh || 0)) * fracB;
      const spdA = state.unitMph ? ((rA.speed_kmh || 0) * 0.621371) : (rA.speed_kmh || 0);
      const spdB = state.unitMph ? (interpSpdB * 0.621371) : interpSpdB;
      const deltaSpd = spdA - spdB;
      dom.valDeltaSpeed.textContent = `${deltaSpd >= 0 ? '+' : ''}${deltaSpd.toFixed(1)} ${state.unitMph ? 'mph' : 'km/h'}`;
      dom.valDeltaSpeed.className = `val-mono ${deltaSpd >= 0 ? 'text-green' : 'text-red'}`;
    }

    // TPS Delta (ΔTPS)
    if (dom.valDeltaTps) {
      const interpTpsB = (b0.tps_pct || 0) + ((b1.tps_pct || 0) - (b0.tps_pct || 0)) * fracB;
      const deltaTps = (rA.tps_pct || 0) - interpTpsB;
      dom.valDeltaTps.textContent = `${deltaTps >= 0 ? '+' : ''}${deltaTps.toFixed(0)}%`;
      dom.valDeltaTps.className = `val-mono ${deltaTps >= 0 ? 'text-green' : 'text-orange'}`;
    }
  }
}

// =========================================================
// Track Section Drag Selection & Multi-Lap Stacking Engine
// =========================================================

function initSectionDragInteractions() {
  if (!state.map) return;

  state.map.on('mousedown', (e) => {
    if (state.gateEditMode) return;
    if (e.originalEvent.shiftKey || state.sectionSelection.isSelecting) {
      const closest = findClosestTrackPoint(e.latlng.lat, e.latlng.lng);
      if (closest && closest.distToClick < 60.0) {
        state.sectionSelection.isDragging = true;
        state.sectionSelection.startPoint = closest;
        state.sectionSelection.endPoint = closest;
        state.map.dragging.disable();
        renderLiveDragSelection();
      }
    }
  });

  state.map.on('mousemove', (e) => {
    if (state.sectionSelection.isDragging && state.sectionSelection.startPoint) {
      const closest = findClosestTrackPoint(e.latlng.lat, e.latlng.lng);
      if (closest) {
        state.sectionSelection.endPoint = closest;
        renderLiveDragSelection();
      }
    }
  });

  state.map.on('mouseup', () => {
    if (state.sectionSelection.isDragging) {
      state.sectionSelection.isDragging = false;
      state.map.dragging.enable();
      finalizeSectionSelection();
    }
  });
}

function toggleSectionSelectMode() {
  state.sectionSelection.isSelecting = !state.sectionSelection.isSelecting;
  if (dom.btnSelectSection) {
    dom.btnSelectSection.classList.toggle('active', state.sectionSelection.isSelecting);
  }
  const container = document.getElementById('map-container');
  if (container) {
    container.style.cursor = state.sectionSelection.isSelecting ? 'crosshair' : '';
  }
  if (state.sectionSelection.isSelecting) {
    if (dom.gateToastMsg) dom.gateToastMsg.textContent = 'Click and drag along track path to select a corner or section...';
    if (dom.gateInstructionToast) dom.gateInstructionToast.style.display = 'flex';
  } else {
    if (dom.gateInstructionToast && !state.gateEditMode) dom.gateInstructionToast.style.display = 'none';
  }
}

function renderLiveDragSelection() {
  if (!state.sectionSelection.startPoint || !state.sectionSelection.endPoint) return;
  state.sectionHighlightLayer.clearLayers();

  const startP = state.sectionSelection.startPoint;
  const endP = state.sectionSelection.endPoint;

  const latLngs = getTrackLatLngsBetween(startP, endP);
  if (latLngs.length < 2) return;

  const haloPoly = L.polyline(latLngs, {
    color: '#00e5ff',
    weight: 10,
    opacity: 0.45,
    lineCap: 'round',
    lineJoin: 'round'
  });
  const corePoly = L.polyline(latLngs, {
    color: '#ffffff',
    weight: 4,
    opacity: 0.95,
    lineCap: 'round',
    lineJoin: 'round'
  });

  state.sectionHighlightLayer.addLayer(haloPoly);
  state.sectionHighlightLayer.addLayer(corePoly);
}

function finalizeSectionSelection() {
  if (!state.sectionSelection.startPoint || !state.sectionSelection.endPoint) return;
  const startP = state.sectionSelection.startPoint;
  const endP = state.sectionSelection.endPoint;

  const directDist = haversineDistanceM(startP.lat, startP.lon, endP.lat, endP.lon);
  if (directDist < 10.0) {
    clearSectionSelection();
    return;
  }

  state.sectionSelection.active = true;
  state.sectionSelection.isSelecting = false;
  if (dom.btnSelectSection) dom.btnSelectSection.classList.remove('active');
  if (dom.btnClearSection) dom.btnClearSection.style.display = 'inline-flex';
  if (dom.gateInstructionToast && !state.gateEditMode) dom.gateInstructionToast.style.display = 'none';

  const container = document.getElementById('map-container');
  if (container) container.style.cursor = '';

  extractMultiLapSection();
  if (typeof updateWorkspaceLayout === 'function') updateWorkspaceLayout();
}

function getTrackLatLngsBetween(startP, endP) {
  if (!state.records || state.records.length === 0) return [];
  const idxA = Math.min(startP.orig_index, endP.orig_index);
  const idxB = Math.max(startP.orig_index, endP.orig_index);

  const pts = [];
  for (let i = idxA; i <= idxB; i++) {
    const r = state.records[i];
    if (r.gps_lat !== null && r.gps_lon !== null) {
      pts.push([r.gps_lat, r.gps_lon]);
    }
  }
  return pts;
}

function renderSectionHighlight() {
  if (!state.sectionSelection.startPoint || !state.sectionSelection.endPoint) return;
  state.sectionHighlightLayer.clearLayers();
  state.sectionHandlesLayer.clearLayers();

  const startP = state.sectionSelection.startPoint;
  const endP = state.sectionSelection.endPoint;

  // 1. Hide full-circuit track or show subtle background trace
  if (state.trackPolylineGroup) {
    state.trackPolylineGroup.clearLayers();
    if (state.activeRecords && state.activeRecords.length > 1) {
      const allPts = state.activeRecords.filter(r => r.gps_lat !== null && r.gps_lon !== null).map(r => [r.gps_lat, r.gps_lon]);
      if (allPts.length > 1) {
        const bgRef = L.polyline(allPts, {
          color: '#ffffff',
          weight: 2,
          opacity: 0.12,
          dashArray: '4, 6'
        });
        state.trackPolylineGroup.addLayer(bgRef);
      }
    }
  }

  // 2. Render each lap's GPS path through this corner with 60% opacity & create ghost marker
  state.sectionGhostsLayer.clearLayers();
  const sData = state.sectionSelection.lapsData || [];
  const activeLaps = sData.filter(l => state.sectionSelection.activeLapsFilter.has(l.lapNumber));

  if (activeLaps.length > 0) {
    activeLaps.forEach(lap => {
      const pts = lap.records
        .filter(r => r.gps_lat !== null && r.gps_lon !== null)
        .map(r => [r.gps_lat, r.gps_lon]);

      if (pts.length > 1) {
        // Trace line
        const poly = L.polyline(pts, {
          color: lap.color,
          weight: lap.isSectionBest ? 5 : 4,
          opacity: 0.60,
          lineCap: 'round',
          lineJoin: 'round'
        });

        const minSpdStr = state.unitMph ? `${(lap.minSpeed * 0.621371).toFixed(1)} mph` : `${lap.minSpeed.toFixed(1)} km/h`;
        poly.bindTooltip(`<strong>${lap.lapName}</strong>: ${lap.duration_s.toFixed(2)}s | Min: ${minSpdStr} | Lean: ${lap.maxLean.toFixed(0)}°`, {
          sticky: true
        });

        lap.polylineLayer = poly;
        state.sectionHighlightLayer.addLayer(poly);

        // Ghost marker for synchronized scrubbing
        const startRec = lap.records[0];
        const ghostIcon = L.divIcon({
          className: 'section-ghost-icon',
          html: `
            <div class="section-ghost-marker" style="background: ${lap.color};">
              <span class="ghost-lap-lbl">${lap.lapNumber}</span>
              <svg class="ghost-arrow-svg" viewBox="0 0 24 24" width="13" height="13">
                <path d="M12 2 L20 20 L12 16 L4 20 Z" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
              </svg>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const marker = L.marker([startRec.gps_lat, startRec.gps_lon], {
          icon: ghostIcon,
          zIndexOffset: lap.isSectionBest ? 1000 : 900
        });

        lap.marker = marker;
        state.sectionGhostsLayer.addLayer(marker);
      }
    });
  } else {
    // Fallback: draw single selection slice if no multi-laps loaded
    const latLngs = getTrackLatLngsBetween(startP, endP);
    if (latLngs.length >= 2) {
      const ribbon = L.polyline(latLngs, {
        color: '#00e5ff',
        weight: 5,
        opacity: 0.60,
        lineCap: 'round',
        lineJoin: 'round'
      });
      state.sectionHighlightLayer.addLayer(ribbon);
    }
  }

  // 3. Draggable Start Flag Handle (🚩 Entry)
  const startIcon = L.divIcon({
    className: 'section-handle-icon',
    html: `<div class="section-handle-pill section-handle-start">🚩 Entry</div>`,
    iconSize: [70, 24],
    iconAnchor: [35, 12]
  });
  const startMarker = L.marker([startP.lat, startP.lon], { icon: startIcon, draggable: true });
  startMarker.on('dragend', (e) => {
    const closest = findClosestTrackPoint(e.target.getLatLng().lat, e.target.getLatLng().lng);
    if (closest) {
      state.sectionSelection.startPoint = closest;
      extractMultiLapSection();
    }
  });
  state.sectionHandlesLayer.addLayer(startMarker);

  // 4. Draggable End Flag Handle (🏁 Exit)
  const endIcon = L.divIcon({
    className: 'section-handle-icon',
    html: `<div class="section-handle-pill section-handle-end">🏁 Exit</div>`,
    iconSize: [66, 24],
    iconAnchor: [33, 12]
  });
  const endMarker = L.marker([endP.lat, endP.lon], { icon: endIcon, draggable: true });
  endMarker.on('dragend', (e) => {
    const closest = findClosestTrackPoint(e.target.getLatLng().lat, e.target.getLatLng().lng);
    if (closest) {
      state.sectionSelection.endPoint = closest;
      extractMultiLapSection();
    }
  });
  state.sectionHandlesLayer.addLayer(endMarker);

  // 5. Auto-focus and zoom to the selected corner
  if (state.map && state.sectionHighlightLayer.getLayers().length > 0) {
    try {
      state.map.fitBounds(state.sectionHighlightLayer.getBounds(), { padding: [40, 40], maxZoom: 18 });
    } catch (_) {}
  }
}

function updateSectionGhostsAtTime(relTime_s) {
  if (!state.sectionSelection || !state.sectionSelection.active || !state.sectionSelection.lapsData) return;

  const sData = state.sectionSelection.lapsData;
  const activeLaps = sData.filter(l => state.sectionSelection.activeLapsFilter.has(l.lapNumber));

  activeLaps.forEach(lap => {
    if (!lap.marker) return;
    const recs = lap.records;
    if (!recs || recs.length === 0) return;

    const t0 = recs[0].time_s || 0;
    const targetT = t0 + Math.max(0, relTime_s);

    let r0 = recs[0];
    let r1 = recs[recs.length - 1];

    if (targetT <= (recs[0].time_s || 0)) {
      r0 = recs[0];
      r1 = recs.length > 1 ? recs[1] : recs[0];
    } else if (targetT >= (recs[recs.length - 1].time_s || 0)) {
      r0 = recs[recs.length - 1];
      r1 = recs[recs.length - 1];
    } else {
      for (let i = 0; i < recs.length - 1; i++) {
        if ((recs[i].time_s || 0) <= targetT && targetT <= (recs[i + 1].time_s || 0)) {
          r0 = recs[i];
          r1 = recs[i + 1];
          break;
        }
      }
    }

    const tSpan = Math.max(0.001, (r1.time_s || 0) - (r0.time_s || 0));
    const alpha = Math.max(0, Math.min(1, (targetT - (r0.time_s || 0)) / tSpan));

    if (r0.gps_lat !== null && r1.gps_lat !== null) {
      const gLat = r0.gps_lat + (r1.gps_lat - r0.gps_lat) * alpha;
      const gLon = r0.gps_lon + (r1.gps_lon - r0.gps_lon) * alpha;
      lap.marker.setLatLng([gLat, gLon]);

      const brg = calculateBearing(r0.gps_lat, r0.gps_lon, r1.gps_lat, r1.gps_lon);
      const mEl = lap.marker.getElement();
      if (mEl) {
        const svgArrow = mEl.querySelector('.ghost-arrow-svg');
        if (svgArrow) svgArrow.style.transform = `rotate(${brg}deg)`;
      }
    }
  });
}

function updateSectionGhostsAtDistance(relDist_m) {
  if (!state.sectionSelection || !state.sectionSelection.active || !state.sectionSelection.lapsData) return;

  const sData = state.sectionSelection.lapsData;
  const activeLaps = sData.filter(l => state.sectionSelection.activeLapsFilter.has(l.lapNumber));

  activeLaps.forEach(lap => {
    if (!lap.marker) return;
    const recs = lap.records;
    if (!recs || recs.length === 0) return;

    const d0 = recs[0].distance_m || 0;
    const targetD = d0 + Math.max(0, relDist_m);

    let r0 = recs[0];
    let r1 = recs[recs.length - 1];

    if (targetD <= (recs[0].distance_m || 0)) {
      r0 = recs[0];
      r1 = recs.length > 1 ? recs[1] : recs[0];
    } else if (targetD >= (recs[recs.length - 1].distance_m || 0)) {
      r0 = recs[recs.length - 1];
      r1 = recs[recs.length - 1];
    } else {
      for (let i = 0; i < recs.length - 1; i++) {
        if ((recs[i].distance_m || 0) <= targetD && targetD <= (recs[i + 1].distance_m || 0)) {
          r0 = recs[i];
          r1 = recs[i + 1];
          break;
        }
      }
    }

    const dSpan = Math.max(0.001, (r1.distance_m || 0) - (r0.distance_m || 0));
    const alpha = Math.max(0, Math.min(1, (targetD - (r0.distance_m || 0)) / dSpan));

    if (r0.gps_lat !== null && r1.gps_lat !== null) {
      const gLat = r0.gps_lat + (r1.gps_lat - r0.gps_lat) * alpha;
      const gLon = r0.gps_lon + (r1.gps_lon - r0.gps_lon) * alpha;
      lap.marker.setLatLng([gLat, gLon]);

      const brg = calculateBearing(r0.gps_lat, r0.gps_lon, r1.gps_lat, r1.gps_lon);
      const mEl = lap.marker.getElement();
      if (mEl) {
        const svgArrow = mEl.querySelector('.ghost-arrow-svg');
        if (svgArrow) svgArrow.style.transform = `rotate(${brg}deg)`;
      }
    }
  });
}

function clearSectionSelection() {
  state.sectionSelection.active = false;
  state.sectionSelection.isDragging = false;
  state.sectionSelection.isSelecting = false;
  state.sectionSelection.startPoint = null;
  state.sectionSelection.endPoint = null;
  state.sectionSelection.lapsData = [];
  state.sectionSelection.activeLapsFilter.clear();

  state.sectionHighlightLayer.clearLayers();
  state.sectionHandlesLayer.clearLayers();
  if (state.sectionGhostsLayer) state.sectionGhostsLayer.clearLayers();

  if (dom.btnSelectSection) dom.btnSelectSection.classList.remove('active');
  if (dom.btnClearSection) dom.btnClearSection.style.display = 'none';
  if (dom.sectionAnalysisDrawer) dom.sectionAnalysisDrawer.style.display = 'none';

  // Restore full circuit track on map
  renderMapTrack(true);

  if (typeof updateWorkspaceLayout === 'function') updateWorkspaceLayout();
  if (typeof resizeCanvas === 'function') resizeCanvas();
  if (typeof renderCharts === 'function') renderCharts();
}

function extractMultiLapSection() {
  if (!state.sectionSelection.startPoint || !state.sectionSelection.endPoint) return;
  const startP = state.sectionSelection.startPoint;
  const endP = state.sectionSelection.endPoint;

  const lapsToSearch = (state.laps && state.laps.length > 0)
    ? state.laps.filter(l => l.duration_s > 10.0)
    : [{ lap_number: 1, name: 'Full Session', start_index: 0, end_index: state.records.length - 1, is_best: true }];

  const sectionLaps = [];

  lapsToSearch.forEach((lap, idx) => {
    const lapRecs = state.records.slice(lap.start_index, lap.end_index + 1);
    if (lapRecs.length < 5) return;

    let bestStartIdx = -1;
    let minStartDist = Infinity;
    let bestEndIdx = -1;
    let minEndDist = Infinity;

    for (let i = 0; i < lapRecs.length; i++) {
      const r = lapRecs[i];
      if (r.gps_lat === null || r.gps_lon === null) continue;

      const dS = haversineDistanceM(r.gps_lat, r.gps_lon, startP.lat, startP.lon);
      if (dS < minStartDist) {
        minStartDist = dS;
        bestStartIdx = i;
      }

      const dE = haversineDistanceM(r.gps_lat, r.gps_lon, endP.lat, endP.lon);
      if (dE < minEndDist) {
        minEndDist = dE;
        bestEndIdx = i;
      }
    }

    if (minStartDist < 90 && minEndDist < 90 && bestStartIdx !== -1 && bestEndIdx !== -1) {
      let sliceStart = bestStartIdx;
      let sliceEnd = bestEndIdx;

      if (sliceStart > sliceEnd) {
        const temp = sliceStart;
        sliceStart = sliceEnd;
        sliceEnd = temp;
      }

      const slice = lapRecs.slice(sliceStart, sliceEnd + 1);
      if (slice.length >= 3) {
        const dur = (slice[slice.length - 1].time_s || 0) - (slice[0].time_s || 0);
        const dist = (slice[slice.length - 1].distance_m || 0) - (slice[0].distance_m || 0);

        let minSpd = Infinity;
        let maxSpd = -Infinity;
        let maxLean = 0;
        let apexIdx = 0;
        let throttlePickupDist = null;

        for (let j = 0; j < slice.length; j++) {
          const spd = slice[j].speed_kmh || 0;
          if (spd < minSpd) {
            minSpd = spd;
            apexIdx = j;
          }
          if (spd > maxSpd) maxSpd = spd;

          const lean = Math.abs(slice[j].lean_angle_deg || 0);
          if (lean > maxLean) maxLean = lean;

          if (throttlePickupDist === null && (slice[j].tps_pct || 0) >= 20.0 && j > 0) {
            throttlePickupDist = (slice[j].distance_m || 0) - (slice[0].distance_m || 0);
          }
        }

        const entrySpd = slice[0].speed_kmh || 0;
        const exitSpd = slice[slice.length - 1].speed_kmh || 0;

        sectionLaps.push({
          lapNumber: lap.lap_number,
          lapName: lap.name,
          color: state.sectionSelection.palette[idx % state.sectionSelection.palette.length],
          records: slice,
          duration_s: dur,
          distance_m: dist,
          entrySpeed: entrySpd,
          exitSpeed: exitSpd,
          minSpeed: minSpd,
          maxSpeed: maxSpd,
          maxLean: maxLean,
          apexDistance: (slice[apexIdx].distance_m || 0) - (slice[0].distance_m || 0),
          throttlePickupDist: throttlePickupDist,
          isBestLap: lap.is_best || false
        });
      }
    }
  });

  // Keep in natural chronological Lap Number order (1, 2, 3...)
  sectionLaps.sort((a, b) => a.lapNumber - b.lapNumber);

  // Identify the fastest lap through the section
  let bestSection = null;
  let minDur = Infinity;
  sectionLaps.forEach(l => {
    if (l.duration_s < minDur) {
      minDur = l.duration_s;
      bestSection = l;
    }
  });
  if (bestSection) {
    bestSection.isSectionBest = true;
  }

  state.sectionSelection.lapsData = sectionLaps;
  state.sectionSelection.activeLapsFilter = new Set(sectionLaps.map(l => l.lapNumber));

  renderSectionHighlight();
  updateSectionUI();
  if (typeof resizeCanvas === 'function') resizeCanvas();
  if (typeof renderCharts === 'function') renderCharts();
}

function updateSectionUI() {
  const sData = state.sectionSelection.lapsData;
  if (!sData || sData.length === 0) return;

  if (dom.sectionAnalysisDrawer) {
    dom.sectionAnalysisDrawer.style.display = 'flex';
  }

  const bestSection = sData.find(l => l.isSectionBest) || sData[0];
  const avgApex = sData.reduce((acc, l) => acc + l.minSpeed, 0) / sData.length;
  const avgLen = sData.reduce((acc, l) => acc + l.distance_m, 0) / sData.length;

  if (dom.sectionBadgeLength) {
    dom.sectionBadgeLength.textContent = `${avgLen.toFixed(0)} m`;
  }
  if (dom.sectionBadgeBestTime) {
    dom.sectionBadgeBestTime.textContent = `${bestSection.duration_s.toFixed(2)}s`;
  }
  if (dom.sectionBadgeBestLap) {
    dom.sectionBadgeBestLap.textContent = `${bestSection.lapName}`;
  }
  if (dom.sectionBadgeApexAvg) {
    const spd = state.unitMph ? (avgApex * 0.621371) : avgApex;
    dom.sectionBadgeApexAvg.textContent = `${spd.toFixed(1)} ${state.unitMph ? 'mph' : 'km/h'}`;
  }

  if (dom.sectionTableBody) {
    dom.sectionTableBody.innerHTML = '';
    sData.forEach((l) => {
      const tr = document.createElement('tr');
      tr.dataset.lap = l.lapNumber;
      if (l.isSectionBest) tr.classList.add('best-section-row');

      const deltaToBest = l.duration_s - bestSection.duration_s;
      const deltaStr = l.isSectionBest ? '🏆 Best' : `+${deltaToBest.toFixed(2)}s`;
      const deltaClass = l.isSectionBest ? 'text-purple' : (deltaToBest < 0.3 ? 'text-green' : 'text-orange');

      const entrySpd = state.unitMph ? (l.entrySpeed * 0.621371).toFixed(1) : l.entrySpeed.toFixed(1);
      const minSpd = state.unitMph ? (l.minSpeed * 0.621371).toFixed(1) : l.minSpeed.toFixed(1);
      const exitSpd = state.unitMph ? (l.exitSpeed * 0.621371).toFixed(1) : l.exitSpeed.toFixed(1);

      tr.innerHTML = `
        <td>
          <span class="lap-color-indicator" style="background: ${l.color};"></span>
          <strong>${escapeHTML(l.lapName)}</strong>
        </td>
        <td><strong>${l.duration_s.toFixed(2)}s</strong></td>
        <td class="${deltaClass}"><strong>${deltaStr}</strong></td>
        <td>${entrySpd}</td>
        <td><strong class="text-cyan">${minSpd}</strong></td>
        <td>${exitSpd}</td>
        <td>${l.maxLean.toFixed(1)}°</td>
      `;

      // Hover on table row highlights that lap's GPS path on map
      tr.addEventListener('mouseenter', () => {
        if (l.polylineLayer) {
          l.polylineLayer.setStyle({ opacity: 1.0, weight: 7 });
          l.polylineLayer.bringToFront();
        }
      });
      tr.addEventListener('mouseleave', () => {
        if (l.polylineLayer) {
          l.polylineLayer.setStyle({ opacity: 0.60, weight: l.isSectionBest ? 5 : 4 });
        }
      });

      tr.addEventListener('click', () => {
        if (state.sectionSelection.activeLapsFilter.has(l.lapNumber)) {
          if (state.sectionSelection.activeLapsFilter.size > 1) {
            state.sectionSelection.activeLapsFilter.delete(l.lapNumber);
            tr.classList.add('lap-row-disabled');
            if (l.polylineLayer) state.sectionHighlightLayer.removeLayer(l.polylineLayer);
          }
        } else {
          state.sectionSelection.activeLapsFilter.add(l.lapNumber);
          tr.classList.remove('lap-row-disabled');
          if (l.polylineLayer) state.sectionHighlightLayer.addLayer(l.polylineLayer);
        }
        if (typeof renderCharts === 'function') renderCharts();
      });

      dom.sectionTableBody.appendChild(tr);
    });
  }
}
