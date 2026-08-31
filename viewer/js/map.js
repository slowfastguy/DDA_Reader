/**
 * map.js - GPS Track Map, Heatmap Overlays, and Speed Extrema Engine
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
}

function renderMapTrack(shouldFitBounds = false) {
  if (!state.activeRecords || state.activeRecords.length === 0) return;
  state.trackPolylineGroup.clearLayers();

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
      if (typeof seekToIndex === 'function') seekToIndex(targetIdx);
    });
    state.trackPolylineGroup.addLayer(poly);
  }

  if (dom.legendMin && dom.legendMax) {
    if (state.heatmapMode === 'speed') {
      dom.legendMin.textContent = state.unitMph ? '0 mph' : '0 km/h';
      dom.legendMax.textContent = state.unitMph ? `${(maxSpeed * 0.621371).toFixed(0)} mph` : `${maxSpeed.toFixed(0)} km/h`;
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

  const recs = state.activeRecords;
  const n = recs.length;
  const extrema = [];
  const windowHalf = 15;

  for (let i = windowHalf; i < n - windowHalf; i++) {
    const r = recs[i];
    if (r.gps_lat === null || r.gps_lon === null) continue;

    const spd = r.speed_kmh || 0;
    if (spd < 15.0) continue;

    let isMin = true;
    let isMax = true;

    for (let k = i - windowHalf; k <= i + windowHalf; k++) {
      if (k === i) continue;
      const otherSpd = recs[k].speed_kmh || 0;
      if (otherSpd <= spd) isMin = false;
      if (otherSpd >= spd) isMax = false;
    }

    if (isMin && spd < 150.0) {
      const diff1 = (recs[i - windowHalf].speed_kmh || 0) - spd;
      const diff2 = (recs[i + windowHalf].speed_kmh || 0) - spd;
      if (diff1 >= 5.0 && diff2 >= 5.0) {
        extrema.push({ type: 'min', record: r, index: i, speed_kmh: spd });
      }
    } else if (isMax && spd > 50.0) {
      const diff1 = spd - (recs[i - windowHalf].speed_kmh || 0);
      const diff2 = spd - (recs[i + windowHalf].speed_kmh || 0);
      if (diff1 >= 5.0 && diff2 >= 5.0) {
        extrema.push({ type: 'max', record: r, index: i, speed_kmh: spd });
      }
    }
  }

  const filtered = [];
  extrema.forEach(item => {
    const tooClose = filtered.some(f => haversineDistanceM(f.record.gps_lat, f.record.gps_lon, item.record.gps_lat, item.record.gps_lon) < 35.0);
    if (!tooClose) filtered.push(item);
  });

  filtered.forEach(item => {
    const isMin = item.type === 'min';
    const displaySpd = state.unitMph ? (item.speed_kmh * 0.621371).toFixed(0) : item.speed_kmh.toFixed(0);
    const unitLabel = state.unitMph ? 'mph' : 'km/h';
    const badgeText = isMin ? `▼ ${displaySpd}` : `▲ ${displaySpd}`;
    const badgeClass = isMin ? 'speed-extrema-min' : 'speed-extrema-max';

    const icon = L.divIcon({
      className: 'bike-marker-icon',
      html: `<div class="speed-extrema-pill ${badgeClass}" title="${isMin ? 'Apex Min Speed' : 'Straight Top Speed'}: ${displaySpd} ${unitLabel}">
               <span>${badgeText}</span>
             </div>`,
      iconSize: [46, 18],
      iconAnchor: [23, 9]
    });

    const marker = L.marker([item.record.gps_lat, item.record.gps_lon], { icon, zIndexOffset: 700 });
    marker.on('click', () => {
      if (typeof seekToIndex === 'function') {
        seekToIndex(item.record.local_index !== undefined ? item.record.local_index : item.index);
      }
    });
    state.extremaLayerGroup.addLayer(marker);
  });
}

function findClosestTrackPoint(lat, lon) {
  let closestIdx = -1;
  let minDist = 999999;
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    if (r.gps_lat !== null && r.gps_lon !== null) {
      const d = haversineDistanceM(lat, lon, r.gps_lat, r.gps_lon);
      if (d < minDist) {
        minDist = d;
        closestIdx = i;
      }
    }
  }

  if (closestIdx === -1 || minDist > 150) return null;

  const pPrev = state.records[Math.max(0, closestIdx - 2)];
  const pNext = state.records[Math.min(state.records.length - 1, closestIdx + 2)];

  let tangentBearing = 0;
  if (pPrev && pNext && pPrev.gps_lat !== null && pNext.gps_lat !== null) {
    tangentBearing = calculateBearing(pPrev.gps_lat, pPrev.gps_lon, pNext.gps_lat, pNext.gps_lon);
  }

  return {
    record: state.records[closestIdx],
    index: closestIdx,
    distanceM: minDist,
    tangentBearing
  };
}

function updateGhostMarker(interpDistA, interpTimeA, rA) {
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
    const elapsedA = interpTimeA - state.activeRecords[0].time_s;
    const elapsedB = ((b0.time_s || 0) + ((b1.time_s || 0) - (b0.time_s || 0)) * fracB) - recsB[0].time_s;
    const deltaT = elapsedB - elapsedA;
    dom.valDeltaTime.textContent = `${deltaT >= 0 ? '+' : ''}${deltaT.toFixed(2)}s`;
    dom.valDeltaTime.className = `val-mono ${deltaT >= 0 ? 'text-green' : 'text-red'}`;

    // Speed Delta (Δv)
    const interpSpdB = (b0.speed_kmh || 0) + ((b1.speed_kmh || 0) - (b0.speed_kmh || 0)) * fracB;
    const spdA = state.unitMph ? ((rA.speed_kmh || 0) * 0.621371) : (rA.speed_kmh || 0);
    const spdB = state.unitMph ? (interpSpdB * 0.621371) : interpSpdB;
    const deltaSpd = spdA - spdB;
    dom.valDeltaSpeed.textContent = `${deltaSpd >= 0 ? '+' : ''}${deltaSpd.toFixed(1)} ${state.unitMph ? 'mph' : 'km/h'}`;
    dom.valDeltaSpeed.className = `val-mono ${deltaSpd >= 0 ? 'text-green' : 'text-red'}`;

    // TPS Delta (ΔTPS)
    const interpTpsB = (b0.tps_pct || 0) + ((b1.tps_pct || 0) - (b0.tps_pct || 0)) * fracB;
    const deltaTps = (rA.tps_pct || 0) - interpTpsB;
    dom.valDeltaTps.textContent = `${deltaTps >= 0 ? '+' : ''}${deltaTps.toFixed(0)}%`;
    dom.valDeltaTps.className = `val-mono ${deltaTps >= 0 ? 'text-green' : 'text-orange'}`;
  }
}
