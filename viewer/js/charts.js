/**
 * charts.js - Multi-Channel Waveforms, Stacked Section Analysis, and Shift Lights Engine
 * Ducati DDA Telemetry & GPS Visualizer
 */

let canvasCtx = null;
let canvasWidth = 0;
let canvasHeight = 0;

const CHANNEL_METADATA = [
  { key: 'speedA', label: 'Speed (Wheel)', color: '#00e5ff', compareOnly: false },
  { key: 'speedGps', label: 'Speed (GPS)', color: '#388bfd', compareOnly: false },
  { key: 'speedB', label: 'Speed (Lap B)', color: '#79c0ff', compareOnly: true },
  { key: 'rpm', label: 'RPM', color: '#ff9f0a', compareOnly: false },
  { key: 'tps', label: 'Throttle %', color: '#00e676', compareOnly: false },
  { key: 'dtc', label: 'DTC %', color: '#ffee58', compareOnly: false },
  { key: 'lean', label: 'Lean °', color: '#ff2eb6', compareOnly: false, centered: true },
  { key: 'gLong', label: 'G-Long', color: '#ff3b30', compareOnly: false, centered: true },
  { key: 'gLat', label: 'G-Lat', color: '#818cf8', compareOnly: false, centered: true },
  { key: 'gear', label: 'Gear', color: '#e2e8f0', compareOnly: false },
  { key: 'elevation', label: 'Elev (m)', color: '#2dd4bf', compareOnly: false },
  { key: 'temp', label: 'Temp (°C)', color: '#fbbf24', compareOnly: false },
  { key: 'deltaT', label: 'Δt Time Delta', color: '#a3e635', compareOnly: true, centered: true },
  { key: 'lineDelta', label: 'Line Δ (m)', color: '#c084fc', compareOnly: true, centered: true }
];

function updateChannelsStripeUI() {
  const bar = dom.channelsStripeBar || document.getElementById('channels-stripe-bar');
  if (!bar) return;
  const isCompare = !!state.isCompareMode;
  const visibleMeta = CHANNEL_METADATA.filter(m => !m.compareOnly || isCompare);
  bar.innerHTML = visibleMeta.map(m => {
    const isActive = !!state.channels[m.key];
    return `<span class="ch-stripe-seg ${isActive ? 'active' : 'inactive'}" style="--c: ${m.color};" title="${m.label}: ${isActive ? 'ON' : 'OFF'}"></span>`;
  }).join('');
}

function getActiveLanes(isCompare = false) {
  const laneMap = new Map();
  CHANNEL_METADATA.forEach(meta => {
    if (meta.compareOnly && !isCompare) return;
    if (!state.channels[meta.key]) return;
    const laneNum = Math.max(1, Math.min(6, parseInt((state.channelLanes && state.channelLanes[meta.key]) || 1, 10)));
    if (!laneMap.has(laneNum)) laneMap.set(laneNum, []);
    laneMap.get(laneNum).push(meta);
  });
  return Array.from(laneMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([laneNum, channels]) => ({ laneNum, channels }));
}

function drawLaneChannelLabels(ctx, yTop, laneNum, channels) {
  ctx.save();
  ctx.font = '800 8.5px "Outfit", sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  let curX = 8;
  const yLbl = yTop + 4;

  // Subtle lane tag
  ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
  const lanePrefix = `L${laneNum}:`;
  ctx.fillText(lanePrefix, curX, yLbl);
  curX += ctx.measureText(lanePrefix).width + 6;

  channels.forEach((meta, idx) => {
    ctx.fillStyle = meta.color;
    const txt = meta.label.toUpperCase();
    ctx.fillText(txt, curX, yLbl);
    curX += ctx.measureText(txt).width;
    if (idx < channels.length - 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillText(' · ', curX, yLbl);
      curX += ctx.measureText(' · ').width;
    }
  });
  ctx.restore();
}

function initCanvas() {
  const c = dom.telemetryCanvas;
  if (!c) return;
  canvasCtx = c.getContext('2d');
  resizeCanvas();
  updateChannelsStripeUI();
  window.addEventListener('resize', () => {
    resizeCanvas();
    renderCharts();
  });
}

function resizeCanvas() {
  const c = dom.telemetryCanvas;
  if (!c) return;
  const rect = c.parentElement ? c.parentElement.getBoundingClientRect() : { width: 800, height: 180 };
  const dpr = window.devicePixelRatio || 1;

  canvasWidth = Math.max(200, Math.floor(rect.width));
  canvasHeight = Math.max(120, Math.floor(rect.height));

  c.width = canvasWidth * dpr;
  c.height = canvasHeight * dpr;
  c.style.width = `${canvasWidth}px`;
  c.style.height = `${canvasHeight}px`;

  if (canvasCtx) {
    canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function renderCharts() {
  if (!canvasCtx || canvasWidth === 0 || canvasHeight === 0) return;
  const ctx = canvasCtx;
  const w = canvasWidth;
  const h = canvasHeight;

  ctx.clearRect(0, 0, w, h);

  // 1. Stacked Multi-Lap Section Comparison Mode
  if (state.sectionSelection && state.sectionSelection.active && state.sectionSelection.lapsData && state.sectionSelection.lapsData.length > 0) {
    renderStackedSectionCharts(ctx, w, h);
    return;
  }

  // 2. Dual-Lap Compare Mode
  if (state.isCompareMode) {
    renderCompareCharts(ctx, w, h);
    return;
  }

  // 3. Standard Single Lap / Full Session Telemetry
  if (!state.activeRecords || state.activeRecords.length === 0) return;

  const startIdx = Math.floor(state.zoomRange[0] * state.activeRecords.length);
  const endIdx = Math.max(startIdx + 10, Math.floor(state.zoomRange[1] * state.activeRecords.length));
  const viewRecords = state.activeRecords.slice(startIdx, endIdx);
  const count = viewRecords.length;
  if (count < 2) return;

  const activeLanes = getActiveLanes(false);
  if (activeLanes.length === 0) {
    ctx.fillStyle = '#8e94a5';
    ctx.font = '600 12px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No telemetry channels enabled — select channels from ⚙️ Channels menu', w / 2, h / 2);
    return;
  }

  const numLanes = activeLanes.length;
  const laneHeight = h / numLanes;
  const pad = 5;

  // Draw lane divider lines
  ctx.strokeStyle = '#222634';
  ctx.lineWidth = 1;
  for (let i = 1; i < numLanes; i++) {
    const y = i * laneHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const maxSpd = (state.sessionData?.stats?.max_speed_kmh || 180) * (state.unitMph ? 0.621371 : 1.0);
  const maxRpm = Math.max(13000, state.redlineRpm || 12000);
  const minAlt = state.sessionData?.stats?.min_alt_m || 0;
  const maxAlt = Math.max(minAlt + 10, state.sessionData?.stats?.max_alt_m || 100);
  const altRange = Math.max(10, maxAlt - minAlt);
  const minTemp = Math.max(20, (state.sessionData?.stats?.min_temp_c || 60) - 5);
  const maxTemp = Math.max(minTemp + 15, (state.sessionData?.stats?.max_temp_c || 105) + 5);
  const tempRange = Math.max(10, maxTemp - minTemp);

  activeLanes.forEach((lane, laneIdx) => {
    const yTop = laneIdx * laneHeight;
    const yBottom = yTop + laneHeight - pad;
    const usableH = Math.max(10, laneHeight - pad * 2);
    const yCenter = yTop + laneHeight / 2;

    if (lane.channels.some(c => c.centered)) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, yCenter);
      ctx.lineTo(w, yCenter);
      ctx.stroke();
    }

    lane.channels.forEach(meta => {
      const ch = meta.key;
      if (ch === 'speedA') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const r = viewRecords[i];
          const spd = (r.speed_kmh || 0) * (state.unitMph ? 0.621371 : 1.0);
          const x = (i / (count - 1)) * w;
          const y = yBottom - (spd / maxSpd) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'speedGps') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const r = viewRecords[i];
          const spd = ((r.gps_speed_kmh !== undefined && r.gps_speed_kmh > 0) ? r.gps_speed_kmh : (r.speed_kmh || 0)) * (state.unitMph ? 0.621371 : 1.0);
          const x = (i / (count - 1)) * w;
          const y = yBottom - (spd / maxSpd) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'rpm') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const rpm = viewRecords[i].rpm || 0;
          const x = (i / (count - 1)) * w;
          const y = yBottom - Math.min(1, rpm / maxRpm) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'tps') {
        ctx.fillStyle = 'rgba(0, 230, 118, 0.11)';
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(0, yBottom);
        for (let i = 0; i < count; i++) {
          const tps = viewRecords[i].tps_pct || 0;
          const x = (i / (count - 1)) * w;
          const y = yBottom - (tps / 100.0) * usableH;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, yBottom);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const tps = viewRecords[i].tps_pct || 0;
          const x = (i / (count - 1)) * w;
          const y = yBottom - (tps / 100.0) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'dtc') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const dtc = Math.max(viewRecords[i].torque_slow_pct || 0, viewRecords[i].torque_fast_pct || 0, viewRecords[i].dtc || 0);
          const x = (i / (count - 1)) * w;
          const y = yBottom - (dtc / 100.0) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'lean') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const lean = viewRecords[i].lean_angle_deg || 0;
          const x = (i / (count - 1)) * w;
          const y = yCenter - (lean / 55.0) * (usableH / 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'gLong') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const gLong = viewRecords[i].accel_long_g || 0;
          const x = (i / (count - 1)) * w;
          const y = yCenter - (gLong / 1.6) * (usableH / 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'gLat') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const gLat = viewRecords[i].accel_lat_g || 0;
          const x = (i / (count - 1)) * w;
          const y = yCenter - (gLat / 1.6) * (usableH / 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'gear') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const gear = viewRecords[i].gear || 0;
          const x = (i / (count - 1)) * w;
          const y = yBottom - (gear / 6.0) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'elevation') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const alt = viewRecords[i].gps_alt_m !== null && viewRecords[i].gps_alt_m !== undefined ? viewRecords[i].gps_alt_m : minAlt;
          const x = (i / (count - 1)) * w;
          const y = yBottom - ((alt - minAlt) / altRange) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'temp') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const tVal = viewRecords[i].temp_c || minTemp;
          const x = (i / (count - 1)) * w;
          const y = yBottom - ((tVal - minTemp) / tempRange) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    });

    drawLaneChannelLabels(ctx, yTop, lane.laneNum, lane.channels);
  });

  // Draw Vertical Turn Apex Markers across all channels
  drawVerticalTurnMarkers(ctx, w, h, viewRecords, count, false);

  updateScrubberLinePosition();
}

function renderStackedSectionCharts(ctx, w, h) {
  const sData = state.sectionSelection.lapsData;
  if (!sData || sData.length === 0) return;

  const activeLaps = sData.filter(l => state.sectionSelection.activeLapsFilter.has(l.lapNumber));
  if (activeLaps.length === 0) return;

  const isTimeSync = state.sectionSelection.syncMode !== 'dist';
  const maxDur = Math.max(...activeLaps.map(l => l.duration_s), 0.5);
  const maxDist = Math.max(...activeLaps.map(l => l.distance_m), 10.0);

  const activeLanes = getActiveLanes(false);
  if (activeLanes.length === 0) return;

  const numLanes = activeLanes.length;
  const laneHeight = h / numLanes;
  const pad = 5;

  const rawMaxSpd = Math.max(...activeLaps.map(l => l.maxSpeed), 100);
  const maxSpd = (rawMaxSpd * 1.08) * (state.unitMph ? 0.621371 : 1.0);
  const maxRpm = Math.max(13000, state.redlineRpm || 12000);

  // Lane Dividers
  ctx.strokeStyle = '#222634';
  ctx.lineWidth = 1;
  for (let i = 1; i < numLanes; i++) {
    const y = i * laneHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  activeLanes.forEach((lane, laneIdx) => {
    const yTop = laneIdx * laneHeight;
    const yBottom = yTop + laneHeight - pad;
    const usableH = Math.max(10, laneHeight - pad * 2);
    const yCenter = yTop + laneHeight / 2;

    if (lane.channels.some(c => c.centered)) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, yCenter);
      ctx.lineTo(w, yCenter);
      ctx.stroke();
    }

    lane.channels.forEach(meta => {
      const ch = meta.key;
      activeLaps.forEach(lap => {
        const recs = lap.records;
        if (recs.length < 2) return;
        const t0 = recs[0].time_s || 0;
        const d0 = recs[0].distance_m || 0;

        ctx.strokeStyle = lap.color;
        ctx.lineWidth = lap.isSectionBest ? 2.3 : 1.4;
        ctx.beginPath();
        for (let i = 0; i < recs.length; i++) {
          const r = recs[i];
          const x = isTimeSync
            ? (((r.time_s || 0) - t0) / maxDur) * w
            : (((r.distance_m || 0) - d0) / maxDist) * w;
          let y = yBottom;
          if (ch === 'speedA' || ch === 'speedGps') {
            const spd = (r.speed_kmh || 0) * (state.unitMph ? 0.621371 : 1.0);
            y = yBottom - (spd / maxSpd) * usableH;
          } else if (ch === 'rpm') {
            y = yBottom - Math.min(1, (r.rpm || 0) / maxRpm) * usableH;
          } else if (ch === 'tps') {
            y = yBottom - ((r.tps_pct || 0) / 100.0) * usableH;
          } else if (ch === 'dtc') {
            const dtc = Math.max(r.torque_slow_pct || 0, r.torque_fast_pct || 0, r.dtc || 0);
            y = yBottom - (dtc / 100.0) * usableH;
          } else if (ch === 'lean') {
            y = yCenter - ((r.lean_angle_deg || 0) / 55.0) * (usableH / 2);
          } else if (ch === 'gLong') {
            y = yCenter - ((r.accel_long_g || 0) / 1.6) * (usableH / 2);
          } else if (ch === 'gLat') {
            y = yCenter - ((r.accel_lat_g || 0) / 1.6) * (usableH / 2);
          } else if (ch === 'gear') {
            y = yBottom - ((r.gear || 0) / 6.0) * usableH;
          } else {
            y = yBottom - 0.5 * usableH;
          }
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        if (ch === 'speedA') {
          const apexRec = recs.reduce((minR, curR) => (curR.speed_kmh < minR.speed_kmh ? curR : minR), recs[0]);
          const apexX = isTimeSync
            ? (((apexRec.time_s || 0) - t0) / maxDur) * w
            : (((apexRec.distance_m || 0) - d0) / maxDist) * w;
          const apexSpd = (apexRec.speed_kmh || 0) * (state.unitMph ? 0.621371 : 1.0);
          const apexY = yBottom - (apexSpd / maxSpd) * usableH;
          ctx.fillStyle = lap.color;
          ctx.beginPath();
          ctx.arc(apexX, apexY, lap.isSectionBest ? 3.5 : 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    });

    drawLaneChannelLabels(ctx, yTop, lane.laneNum, lane.channels);
  });

  // Scrubber Line in Section Comparison
  if (isTimeSync && state.sectionSelection.hoverRelTime !== null && dom.chartScrubberLine) {
    const x = (state.sectionSelection.hoverRelTime / maxDur) * w;
    dom.chartScrubberLine.style.display = 'block';
    dom.chartScrubberLine.style.left = `${x}px`;
  } else if (!isTimeSync && state.sectionSelection.hoverSectionDist !== null && dom.chartScrubberLine) {
    const x = (state.sectionSelection.hoverSectionDist / maxDist) * w;
    dom.chartScrubberLine.style.display = 'block';
    dom.chartScrubberLine.style.left = `${x}px`;
  } else {
    updateScrubberLinePosition();
  }
}

function renderCompareCharts(ctx, w, h) {
  const lapA = state.laps.find(l => l.lap_number === state.compareLapA);
  const lapB = state.laps.find(l => l.lap_number === state.compareLapB);
  if (!lapA || !lapB) return;

  const recsA = state.records.slice(lapA.start_index, lapA.end_index);
  const recsB = state.records.slice(lapB.start_index, lapB.end_index);
  if (recsA.length < 2 || recsB.length < 2) return;

  const activeLanes = getActiveLanes(true);
  if (activeLanes.length === 0) return;

  const numLanes = activeLanes.length;
  const maxDist = Math.max(lapA.distance_m, lapB.distance_m, 3500);
  const laneHeight = h / numLanes;
  const pad = 5;
  const maxSpd = (state.sessionData?.stats?.max_speed_kmh || 180) * (state.unitMph ? 0.621371 : 1.0);
  const maxRpm = Math.max(13000, state.redlineRpm || 12000);

  ctx.strokeStyle = '#222634';
  ctx.lineWidth = 1;
  for (let i = 1; i < numLanes; i++) {
    const y = i * laneHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  activeLanes.forEach((lane, laneIdx) => {
    const yTop = laneIdx * laneHeight;
    const yBottom = yTop + laneHeight - pad;
    const usableH = Math.max(10, laneHeight - pad * 2);
    const yCenter = yTop + laneHeight / 2;

    if (lane.channels.some(c => c.centered)) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, yCenter);
      ctx.lineTo(w, yCenter);
      ctx.stroke();
    }

    lane.channels.forEach(meta => {
      const ch = meta.key;
      if (ch === 'speedA') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        for (let i = 0; i < recsA.length; i++) {
          const r = recsA[i];
          const x = ((r.distance_m - recsA[0].distance_m) / maxDist) * w;
          const spd = (r.speed_kmh || 0) * (state.unitMph ? 0.621371 : 1.0);
          const y = yBottom - (spd / maxSpd) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'speedGps') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < recsA.length; i++) {
          const r = recsA[i];
          const x = ((r.distance_m - recsA[0].distance_m) / maxDist) * w;
          const spd = ((r.gps_speed_kmh !== undefined && r.gps_speed_kmh > 0) ? r.gps_speed_kmh : (r.speed_kmh || 0)) * (state.unitMph ? 0.621371 : 1.0);
          const y = yBottom - (spd / maxSpd) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'speedB') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        for (let i = 0; i < recsB.length; i++) {
          const r = recsB[i];
          const x = ((r.distance_m - recsB[0].distance_m) / maxDist) * w;
          const spd = (r.speed_kmh || 0) * (state.unitMph ? 0.621371 : 1.0);
          const y = yBottom - (spd / maxSpd) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (ch === 'rpm') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < recsA.length; i++) {
          const r = recsA[i];
          const x = ((r.distance_m - recsA[0].distance_m) / maxDist) * w;
          const y = yBottom - Math.min(1, (r.rpm || 0) / maxRpm) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'tps') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < recsA.length; i++) {
          const r = recsA[i];
          const x = ((r.distance_m - recsA[0].distance_m) / maxDist) * w;
          const y = yBottom - ((r.tps_pct || 0) / 100.0) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.strokeStyle = '#ff2eb6';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        for (let i = 0; i < recsB.length; i++) {
          const r = recsB[i];
          const x = ((r.distance_m - recsB[0].distance_m) / maxDist) * w;
          const y = yBottom - ((r.tps_pct || 0) / 100.0) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (ch === 'dtc') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < recsA.length; i++) {
          const r = recsA[i];
          const dtc = Math.max(r.torque_slow_pct || 0, r.torque_fast_pct || 0, r.dtc || 0);
          const x = ((r.distance_m - recsA[0].distance_m) / maxDist) * w;
          const y = yBottom - (dtc / 100.0) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'lean') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < recsA.length; i++) {
          const r = recsA[i];
          const x = ((r.distance_m - recsA[0].distance_m) / maxDist) * w;
          const y = yCenter - ((r.lean_angle_deg || 0) / 55.0) * (usableH / 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.strokeStyle = '#ffee58';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        for (let i = 0; i < recsB.length; i++) {
          const r = recsB[i];
          const x = ((r.distance_m - recsB[0].distance_m) / maxDist) * w;
          const y = yCenter - ((r.lean_angle_deg || 0) / 55.0) * (usableH / 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (ch === 'gLong') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < recsA.length; i++) {
          const r = recsA[i];
          const x = ((r.distance_m - recsA[0].distance_m) / maxDist) * w;
          const y = yCenter - ((r.accel_long_g || 0) / 1.6) * (usableH / 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'gLat') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < recsA.length; i++) {
          const r = recsA[i];
          const x = ((r.distance_m - recsA[0].distance_m) / maxDist) * w;
          const y = yCenter - ((r.accel_lat_g || 0) / 1.6) * (usableH / 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'gear') {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < recsA.length; i++) {
          const r = recsA[i];
          const x = ((r.distance_m - recsA[0].distance_m) / maxDist) * w;
          const y = yBottom - ((r.gear || 0) / 6.0) * usableH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (ch === 'deltaT') {
        const maxDelta = 3.0;
        const deltaPoints = [];
        for (let i = 0; i < recsA.length; i++) {
          const rA = recsA[i];
          const relDist = rA.distance_m - recsA[0].distance_m;
          const elapsedA = rA.time_s - recsA[0].time_s;
          const rB = recsB.find(b => (b.distance_m - recsB[0].distance_m) >= relDist) || recsB[recsB.length - 1];
          const elapsedB = rB.time_s - recsB[0].time_s;
          const deltaT = elapsedA - elapsedB;
          const x = (relDist / maxDist) * w;
          const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, deltaT));
          const y = yCenter + (clampedDelta / maxDelta) * (usableH / 2);
          deltaPoints.push({ x, y, deltaT });
        }
        if (deltaPoints.length > 1) {
          for (let i = 0; i < deltaPoints.length - 1; i++) {
            const p1 = deltaPoints[i];
            const p2 = deltaPoints[i + 1];
            const isAhead = (p1.deltaT + p2.deltaT) <= 0;
            ctx.fillStyle = isAhead ? 'rgba(0, 230, 118, 0.20)' : 'rgba(255, 59, 48, 0.20)';
            ctx.beginPath();
            ctx.moveTo(p1.x, yCenter);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineTo(p2.x, yCenter);
            ctx.closePath();
            ctx.fill();
          }
          ctx.strokeStyle = meta.color;
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          for (let i = 0; i < deltaPoints.length; i++) {
            const pt = deltaPoints[i];
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
        }
      } else if (ch === 'lineDelta' && recsA.length > 5 && recsB.length > 5) {
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        const maxLineOffsetM = 5.0;
        for (let i = 0; i < recsA.length; i++) {
          const rA = recsA[i];
          const relDist = rA.distance_m - recsA[0].distance_m;
          const rB = recsB.find(b => (b.distance_m - recsB[0].distance_m) >= relDist) || recsB[recsB.length - 1];
          let lateralOffset = 0;
          if (rA.gps_lat !== null && rB.gps_lat !== null) {
            lateralOffset = haversineDistanceM(rA.gps_lat, rA.gps_lon, rB.gps_lat, rB.gps_lon);
          }
          const x = (relDist / maxDist) * w;
          const y = yCenter - (lateralOffset / maxLineOffsetM) * (usableH / 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    drawLaneChannelLabels(ctx, yTop, lane.laneNum, lane.channels);
  });

  // Draw Vertical Turn Apex Markers across compare channels
  drawVerticalTurnMarkers(ctx, w, h, null, 0, true, recsA, maxDist);

  updateScrubberLinePosition();
}

function updateScrubberLinePosition() {
  if (!dom.chartScrubberLine || !state.activeRecords || state.activeRecords.length === 0) return;
  const startIdx = Math.floor(state.zoomRange[0] * state.activeRecords.length);
  const endIdx = Math.max(startIdx + 10, Math.floor(state.zoomRange[1] * state.activeRecords.length));
  const count = endIdx - startIdx;

  const curIdx = state.currentIndex;
  if (curIdx >= startIdx && curIdx <= endIdx) {
    const relIdx = curIdx - startIdx;
    const x = (relIdx / (count - 1)) * canvasWidth;
    dom.chartScrubberLine.style.display = 'block';
    dom.chartScrubberLine.style.left = `${x}px`;
  } else {
    dom.chartScrubberLine.style.display = 'none';
  }
}

function drawVerticalTurnMarkers(ctx, w, h, viewRecords, count, isCompare = false, recsA = null, maxDist = 0) {
  if (state.showChartTurnMarkers === false) return;
  const trk = typeof getActiveTrackProfile === 'function' ? getActiveTrackProfile() : null;
  const turns = trk ? trk.turns : (typeof getActiveTrackTurns === 'function' ? getActiveTrackTurns() : null);
  if (!turns || turns.length === 0) return;

  const markersToDraw = [];

  if (!isCompare && viewRecords && count > 1) {
    const vStartT = viewRecords[0]?.time_s !== undefined ? viewRecords[0].time_s : 0;
    const vEndT = viewRecords[count - 1]?.time_s !== undefined ? viewRecords[count - 1].time_s : 0;

    // Check if we have segmented laps in state.laps that overlap with viewRecords
    const lapsToScan = (state.laps && state.laps.length > 0)
      ? state.laps.filter(l => !l.is_optimal && l.start_time_s <= vEndT && l.end_time_s >= vStartT)
      : null;

    turns.forEach((t, tIdx) => {
      if (t.lat === undefined || t.lon === undefined) return;
      const maxThreshold = (t.radius_m || 45.0) * 1.6;

      if (lapsToScan && lapsToScan.length > 0) {
        // Find turn apex for EACH lap in viewRecords
        lapsToScan.forEach(lap => {
          let minD = Infinity;
          let bestI = -1;
          for (let i = 0; i < count; i++) {
            const r = viewRecords[i];
            if (r.time_s < lap.start_time_s || r.time_s > lap.end_time_s) continue;
            if (r.gps_lat === null || r.gps_lon === null) continue;
            const d = haversineDistanceM(t.lat, t.lon, r.gps_lat, r.gps_lon);
            if (d < minD) {
              minD = d;
              bestI = i;
            }
          }
          if (bestI !== -1 && minD <= maxThreshold) {
            const x = (bestI / (count - 1)) * w;
            markersToDraw.push({ t, tIdx, x, bestI });
          }
        });
      } else {
        // Fallback: Local minima detection across full viewRecords
        let bestLocalI = -1;
        let minLocalD = Infinity;
        let inProximity = false;
        let lastApexI = -9999;

        for (let i = 0; i < count; i++) {
          const r = viewRecords[i];
          if (r.gps_lat === null || r.gps_lon === null) continue;
          const d = haversineDistanceM(t.lat, t.lon, r.gps_lat, r.gps_lon);

          if (d <= maxThreshold) {
            inProximity = true;
            if (d < minLocalD) {
              minLocalD = d;
              bestLocalI = i;
            }
          } else if (inProximity) {
            if (bestLocalI !== -1 && (bestLocalI - lastApexI) > 40) {
              const x = (bestLocalI / (count - 1)) * w;
              markersToDraw.push({ t, tIdx, x, bestI: bestLocalI });
              lastApexI = bestLocalI;
            }
            inProximity = false;
            bestLocalI = -1;
            minLocalD = Infinity;
          }
        }
        if (inProximity && bestLocalI !== -1 && (bestLocalI - lastApexI) > 40) {
          const x = (bestLocalI / (count - 1)) * w;
          markersToDraw.push({ t, tIdx, x, bestI: bestLocalI });
        }
      }
    });
  } else if (isCompare && recsA && maxDist > 0) {
    // Dual lap comparison mode (aligned by distance along lap A)
    turns.forEach((t, tIdx) => {
      if (t.lat === undefined || t.lon === undefined) return;
      const maxThreshold = (t.radius_m || 45.0) * 1.6;
      let minD = Infinity;
      let bestRelDist = 0;
      for (let i = 0; i < recsA.length; i++) {
        const r = recsA[i];
        if (r.gps_lat === null || r.gps_lon === null) continue;
        const d = haversineDistanceM(t.lat, t.lon, r.gps_lat, r.gps_lon);
        if (d < minD) {
          minD = d;
          bestRelDist = (r.distance_m || 0) - (recsA[0].distance_m || 0);
        }
      }
      if (minD <= maxThreshold) {
        const x = (bestRelDist / maxDist) * w;
        markersToDraw.push({ t, tIdx, x, bestI: 0 });
      }
    });
  }

  // Sort markers left to right by X coordinate
  markersToDraw.sort((a, b) => a.x - b.x);

  // Render all markers
  markersToDraw.forEach(m => {
    const { t, tIdx, x } = m;
    if (x < 0 || x > w) return;

    const isLeft = (t.direction || '').toLowerCase().includes('left');
    const cleanNum = (t.number !== undefined ? t.number : (tIdx + 1)).toString().replace(/^T/i, '');
    const isHighlighted = state.highlightedTurnId === t.id;

    // 1. Draw Vertical Accent Line
    ctx.save();
    if (isHighlighted) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([]);
      ctx.shadowColor = isLeft ? '#00e5ff' : '#ffd600';
      ctx.shadowBlur = 8;
    } else {
      ctx.strokeStyle = isLeft ? 'rgba(0, 229, 255, 0.42)' : 'rgba(255, 214, 0, 0.42)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
    }

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.restore();

    // 2. Draw Top Turn Pill Badge
    const tagText = `T${cleanNum}`;
    ctx.save();
    ctx.font = '800 8.5px "Outfit", sans-serif';
    const textW = ctx.measureText(tagText).width;
    const pillW = Math.max(20, textW + 7);
    const pillH = 13;
    const pillX = Math.max(2, Math.min(w - pillW - 2, x - pillW / 2));
    const pillY = 2;

    ctx.fillStyle = isHighlighted ? (isLeft ? '#00e5ff' : '#ffd600') : 'rgba(10, 14, 22, 0.90)';
    ctx.strokeStyle = isLeft ? '#00e5ff' : '#ffd600';
    ctx.lineWidth = 1;

    // Rounded rectangle
    const rad = 3;
    ctx.beginPath();
    ctx.moveTo(pillX + rad, pillY);
    ctx.lineTo(pillX + pillW - rad, pillY);
    ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + rad);
    ctx.lineTo(pillX + pillW, pillY + pillH - rad);
    ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - rad, pillY + pillH);
    ctx.lineTo(pillX + rad, pillY + pillH);
    ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - rad);
    ctx.lineTo(pillX, pillY + rad);
    ctx.quadraticCurveTo(pillX, pillY, pillX + rad, pillY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Pill text
    ctx.fillStyle = isHighlighted ? '#000000' : (isLeft ? '#00e5ff' : '#ffd600');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tagText, pillX + pillW / 2, pillY + pillH / 2 + 0.5);
    ctx.restore();
  });
}

function showChartTooltip(idx, mouseX, mouseY) {
  if (!dom.chartTooltip) return;

  // 1. Stacked Multi-Lap Section Tooltip (Time or Distance Synchronized)
  if (state.sectionSelection && state.sectionSelection.active && state.sectionSelection.lapsData && state.sectionSelection.lapsData.length > 0) {
    const sData = state.sectionSelection.lapsData;
    const activeLaps = sData.filter(l => state.sectionSelection.activeLapsFilter.has(l.lapNumber));
    if (activeLaps.length === 0) return;

    const isTimeSync = state.sectionSelection.syncMode !== 'dist';
    const maxDur = Math.max(...activeLaps.map(l => l.duration_s), 0.5);
    const maxDist = Math.max(...activeLaps.map(l => l.distance_m), 10.0);
    const cursorRatio = Math.max(0, Math.min(1, mouseX / canvasWidth));

    if (dom.chartScrubberLine) {
      dom.chartScrubberLine.style.display = 'block';
      dom.chartScrubberLine.style.left = `${mouseX}px`;
    }

    if (isTimeSync) {
      const relTime_s = cursorRatio * maxDur;
      state.sectionSelection.hoverRelTime = relTime_s;
      state.sectionSelection.hoverSectionDist = null;

      // Move ghost markers synchronously on map
      if (typeof updateSectionGhostsAtTime === 'function') {
        updateSectionGhostsAtTime(relTime_s);
      }

      const rowsHtml = activeLaps.slice(0, 8).map(lap => {
        const recs = lap.records;
        const t0 = recs[0].time_s || 0;
        const targetT = t0 + relTime_s;

        let closestRec = recs[0];
        let minDiff = Infinity;
        for (const r of recs) {
          const diff = Math.abs((r.time_s || 0) - targetT);
          if (diff < minDiff) {
            minDiff = diff;
            closestRec = r;
          }
        }
        const spd = state.unitMph ? ((closestRec.speed_kmh || 0) * 0.621371) : (closestRec.speed_kmh || 0);
        const lean = Math.abs(closestRec.lean_angle_deg || 0);
        const tps = closestRec.tps_pct || 0;
        const gear = closestRec.gear || 'N';
        const isFinished = relTime_s >= lap.duration_s;

        return `
          <div style="display:flex; justify-content:space-between; gap:10px; margin-top:2px; font-size:9px; ${isFinished ? 'opacity:0.6;' : ''}">
            <span><span style="color:${lap.color}">■</span> <strong>${lap.lapName}</strong>${isFinished ? ' (Exit)' : ''}:</span>
            <span><strong style="color:#00e5ff">${spd.toFixed(1)} ${state.unitMph ? 'mph' : 'km/h'}</strong> | ${tps.toFixed(0)}% TPS | G:${gear} | ${lean.toFixed(0)}°</span>
          </div>
        `;
      }).join('');

      dom.chartTooltip.innerHTML = `
        <div style="font-weight:800; border-bottom:1px solid #333; padding-bottom:2px; margin-bottom:3px; color:#ffd600;">
          ⏱️ Corner Elapsed: ${relTime_s.toFixed(2)}s / ${maxDur.toFixed(2)}s
        </div>
        ${rowsHtml}
      `;
    } else {
      const relDist_m = cursorRatio * maxDist;
      state.sectionSelection.hoverSectionDist = relDist_m;
      state.sectionSelection.hoverRelTime = null;

      // Move ghost markers synchronously on map
      if (typeof updateSectionGhostsAtDistance === 'function') {
        updateSectionGhostsAtDistance(relDist_m);
      }

      const rowsHtml = activeLaps.slice(0, 8).map(lap => {
        const recs = lap.records;
        const d0 = recs[0].distance_m || 0;
        const targetD = d0 + relDist_m;

        let closestRec = recs[0];
        let minDiff = Infinity;
        for (const r of recs) {
          const diff = Math.abs((r.distance_m || 0) - targetD);
          if (diff < minDiff) {
            minDiff = diff;
            closestRec = r;
          }
        }
        const spd = state.unitMph ? ((closestRec.speed_kmh || 0) * 0.621371) : (closestRec.speed_kmh || 0);
        const lean = Math.abs(closestRec.lean_angle_deg || 0);
        const tps = closestRec.tps_pct || 0;
        const gear = closestRec.gear || 'N';
        const isFinished = relDist_m >= lap.distance_m;

        return `
          <div style="display:flex; justify-content:space-between; gap:10px; margin-top:2px; font-size:9px; ${isFinished ? 'opacity:0.6;' : ''}">
            <span><span style="color:${lap.color}">■</span> <strong>${lap.lapName}</strong>${isFinished ? ' (Exit)' : ''}:</span>
            <span><strong style="color:#00e5ff">${spd.toFixed(1)} ${state.unitMph ? 'mph' : 'km/h'}</strong> | ${tps.toFixed(0)}% TPS | G:${gear} | ${lean.toFixed(0)}°</span>
          </div>
        `;
      }).join('');

      dom.chartTooltip.innerHTML = `
        <div style="font-weight:800; border-bottom:1px solid #333; padding-bottom:2px; margin-bottom:3px; color:#00e5ff;">
          📍 Corner Distance: ${relDist_m.toFixed(0)}m / ${maxDist.toFixed(0)}m
        </div>
        ${rowsHtml}
      `;
    }

    dom.chartTooltip.style.display = 'block';
    dom.chartTooltip.style.left = `${Math.min(canvasWidth - 255, Math.max(10, mouseX + 15))}px`;
    return;
  }

  // 2. Compare Mode Tooltip
  if (state.isCompareMode) {
    const lapA = state.laps.find(l => l.lap_number === state.compareLapA);
    const lapB = state.laps.find(l => l.lap_number === state.compareLapB);
    if (lapA && lapB) {
      const recsA = state.records.slice(lapA.start_index, lapA.end_index);
      const recsB = state.records.slice(lapB.start_index, lapB.end_index);
      const maxDist = Math.max(lapA.distance_m, lapB.distance_m, 3500);
      const cursorRatio = Math.max(0, Math.min(1, mouseX / canvasWidth));
      const targetDist = cursorRatio * maxDist;

      const rA = recsA.find(a => (a.distance_m - recsA[0].distance_m) >= targetDist) || recsA[recsA.length - 1];
      const rB = recsB.find(b => (b.distance_m - recsB[0].distance_m) >= targetDist) || recsB[recsB.length - 1];

      const spdUnit = state.unitMph ? 'mph' : 'km/h';
      const spdA = state.unitMph ? ((rA.speed_kmh || 0) * 0.621371) : (rA.speed_kmh || 0);
      const spdB = state.unitMph ? ((rB.speed_kmh || 0) * 0.621371) : (rB.speed_kmh || 0);
      const elapsedA = rA.time_s - recsA[0].time_s;
      const elapsedB = rB.time_s - recsB[0].time_s;
      const deltaT = elapsedA - elapsedB;
      const deltaSpd = spdA - spdB;

      dom.chartTooltip.innerHTML = `
        <div style="font-weight:800; border-bottom:1px solid #333; padding-bottom:2px; margin-bottom:3px; color:#a5b4fc;">
          📍 Track Distance: ${targetDist.toFixed(0)}m / ${maxDist.toFixed(0)}m
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
          <span>Δt Time Delta:</span>
          <strong style="color:${deltaT <= 0 ? '#00e676' : '#ff1744'};">${deltaT <= 0 ? '' : '+'}${deltaT.toFixed(3)}s (${deltaT <= 0 ? 'Lap A faster' : 'Lap B faster'})</strong>
        </div>
        <div style="font-size:9.5px; margin-top:2px;">
          <span style="color:#00e5ff">■ Lap A (${lapA.name})</span>: ${spdA.toFixed(1)} ${spdUnit} | ${(rA.tps_pct || 0).toFixed(0)}% TPS | G:${rA.gear || 'N'}<br>
          <span style="color:#ffd600">■ Lap B (${lapB.name})</span>: ${spdB.toFixed(1)} ${spdUnit} | ${(rB.tps_pct || 0).toFixed(0)}% TPS | G:${rB.gear || 'N'}<br>
          Speed Δ: <strong style="color:${deltaSpd >= 0 ? '#00e676' : '#ff1744'}">${deltaSpd >= 0 ? '+' : ''}${deltaSpd.toFixed(1)} ${spdUnit}</strong>
        </div>
      `;
      dom.chartTooltip.style.display = 'block';
      dom.chartTooltip.style.left = `${Math.min(canvasWidth - 250, Math.max(10, mouseX + 15))}px`;
      return;
    }
  }

  // 3. Standard Single Lap Tooltip
  const r = state.activeRecords[idx];
  if (!r) return;

  const spd = state.unitMph ? ((r.speed_kmh || 0) * 0.621371) : (r.speed_kmh || 0);
  const gpsSpd = state.unitMph ? (((r.gps_speed_kmh !== undefined && r.gps_speed_kmh > 0) ? r.gps_speed_kmh : (r.speed_kmh || 0)) * 0.621371) : ((r.gps_speed_kmh !== undefined && r.gps_speed_kmh > 0) ? r.gps_speed_kmh : (r.speed_kmh || 0));
  const spdUnit = state.unitMph ? 'mph' : 'km/h';
  const slip = r.wheel_slip_pct !== undefined ? r.wheel_slip_pct : 0.0;
  const glong = r.accel_long_g !== undefined ? r.accel_long_g.toFixed(2) : '0.00';
  const glat = r.accel_lat_g !== undefined ? r.accel_lat_g.toFixed(2) : '0.00';
  const gtot = r.accel_total_g !== undefined ? r.accel_total_g.toFixed(2) : '0.00';

  // Check for proximity to a turn apex
  let turnNearHtml = '';
  const trk = typeof getActiveTrackProfile === 'function' ? getActiveTrackProfile() : null;
  const turns = trk ? trk.turns : (typeof getActiveTrackTurns === 'function' ? getActiveTrackTurns() : null);
  if (turns && turns.length > 0 && r.gps_lat !== null && r.gps_lon !== null) {
    for (let t of turns) {
      const d = haversineDistanceM(t.lat, t.lon, r.gps_lat, r.gps_lon);
      if (d <= 35.0) {
        const isL = (t.direction || '').toLowerCase().includes('left');
        const cNum = (t.number || '').toString().replace(/^T/i, '');
        turnNearHtml = `<div style="font-weight:800; color:${isL ? '#00e5ff' : '#ffd600'}; margin-bottom:2px;">📍 Turn ${cNum}: ${escapeHTML(t.name)} (Apex Zone)</div>`;
        break;
      }
    }
  }

  dom.chartTooltip.innerHTML = `
    ${turnNearHtml}
    <strong>Time: ${formatTime(r.time_s)} | Dist: ${r.distance_m ? r.distance_m.toFixed(0) : 0}m</strong><br>
    Speed: <span style="color:#00e5ff">${spd.toFixed(1)}</span> (Wheel) | <span style="color:#388bfd">${gpsSpd.toFixed(1)} ${spdUnit}</span> (GPS) | Slip: <span style="color:${Math.abs(slip) > 6 ? '#ffee58' : '#00e676'}">${slip >= 0 ? '+' : ''}${slip.toFixed(1)}%</span><br>
    RPM: <span style="color:#ff9f0a">${r.rpm || 0}</span> | TPS: <span style="color:#00e676">${(r.tps_pct || 0).toFixed(0)}%</span> | Gear: <span style="color:#e2e8f0">${r.gear || 'N'}</span> | Lean: <span style="color:#ff2eb6">${(r.lean_angle_deg || 0).toFixed(1)}°</span><br>
    G-Force: <span style="color:#ff3b30">${glong >= 0 ? '+' : ''}${glong}g</span> long | <span style="color:#818cf8">${glat >= 0 ? '+' : ''}${glat}g</span> lat | <span style="color:#ffee58">${gtot}G</span> sum<br>
    DTC: <span style="color:#ffee58">${Math.max(r.torque_slow_pct || 0, r.torque_fast_pct || 0, r.dtc || 0)}%</span> | Temp: <span style="color:#fbbf24">${r.temp_c ? r.temp_c.toFixed(0) + '°C' : '--'}</span> | Alt: <span style="color:#2dd4bf">${r.gps_alt_m ? r.gps_alt_m.toFixed(1) : '0.0'}m</span>
  `;
  dom.chartTooltip.style.display = 'block';
  dom.chartTooltip.style.left = `${Math.min(canvasWidth - 250, Math.max(10, mouseX + 15))}px`;
}

function updateShiftLights(rpm) {
  const redline = state.redlineRpm || 12000;
  const startRpm = state.shiftLightStartRpm !== undefined ? state.shiftLightStartRpm : Math.round(redline * 0.80);
  const finishRpm = state.shiftLightEndRpm !== undefined ? state.shiftLightEndRpm : redline;
  const leds = (dom.leds && dom.leds.length > 0) ? dom.leds : document.querySelectorAll('.shift-lights .led');
  if (!leds || leds.length === 0) return;

  const count = leds.length; // 10 LEDs
  const range = Math.max(100, finishRpm - startRpm);

  // Redline percentages:
  // Green: startRpm to 90% of Redline
  // Yellow: 91% to 99% of Redline
  // Red: 100% of Redline and up
  const greenCeiling = 0.905 * redline;
  const yellowCeiling = 0.995 * redline;
  const isRedlineZone = rpm >= redline;

  leds.forEach((led, i) => {
    if (!led) return;
    led.className = 'led';

    // Calculate threshold for LED i linearly across the start to finish window
    const ledThreshold = startRpm + (i / (count - 1)) * range;

    if (rpm >= ledThreshold) {
      if (ledThreshold >= yellowCeiling || isRedlineZone) {
        // Red zone: 100% of redline and up
        led.classList.add(rpm >= redline + 200 ? 'led-active-flash' : 'led-active-red');
      } else if (ledThreshold >= greenCeiling) {
        // Yellow zone: 91% to 99% of redline
        led.classList.add('led-active-yellow');
      } else {
        // Green zone: 80% to 90% of redline
        led.classList.add('led-active-green');
      }
    }
  });
}

function updateShiftLightBandsUI() {
  const redline = state.redlineRpm || 12000;
  const startRpm = state.shiftLightStartRpm !== undefined ? state.shiftLightStartRpm : Math.round(redline * 0.80);
  const greenMax = Math.round(redline * 0.90);
  const yellowMin = Math.round(redline * 0.91);
  const yellowMax = Math.round(redline * 0.99);

  if (dom.lblBandGreen) dom.lblBandGreen.textContent = `${startRpm.toLocaleString()} - ${greenMax.toLocaleString()} RPM (${Math.round((startRpm / redline) * 100)}%-90%)`;
  if (dom.lblBandYellow) dom.lblBandYellow.textContent = `${yellowMin.toLocaleString()} - ${yellowMax.toLocaleString()} RPM (91%-99%)`;
  if (dom.lblBandRed) dom.lblBandRed.textContent = `${redline.toLocaleString()}+ RPM (100%+)`;
}

function updateTachScale(redline) {
  const rline = redline || state.redlineRpm || 12000;
  if (!dom.tachScaleRow) return;

  const k1 = Math.round((rline * 0.25) / 1000);
  const k2 = Math.round((rline * 0.50) / 1000);
  const k3 = Math.round((rline * 0.75) / 1000);
  const k4 = Math.round((rline * 0.90) / 1000);
  const kRed = (rline / 1000).toFixed(1).replace('.0', '');

  dom.tachScaleRow.innerHTML = `
    <span>0</span>
    <span>${k1}k</span>
    <span>${k2}k</span>
    <span>${k3}k</span>
    <span>${k4}k</span>
    <span class="text-red" id="lbl-scale-redline" style="font-weight:800;">${kRed}k</span>
  `;
}

// ==========================================================================
// G-G Diagram & Traction Friction Circle Engine
// ==========================================================================
let ggCanvasCtx = null;

function renderGGFrictionCircle(liveGlong = 0, liveGlat = 0, liveGtotal = 0, currentRec = null) {
  const c = dom.ggCanvas;
  if (!c) return;
  if (!ggCanvasCtx) {
    ggCanvasCtx = c.getContext('2d');
  }
  const ctx = ggCanvasCtx;
  const w = c.width || 240;
  const h = c.height || 200;
  const cx = w / 2;
  const cy = h / 2;
  const maxG = 1.6;
  const radius = Math.min(cx, cy) - 18;

  ctx.clearRect(0, 0, w, h);

  // Concentric G reference rings
  const rings = [0.5, 1.0, 1.5];
  rings.forEach(g => {
    const r = (g / maxG) * radius;
    ctx.lineWidth = 1;
    ctx.strokeStyle = g === 1.0 ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.08)';
    ctx.setLineDash(g === 1.0 ? [] : [3, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Ring label
    ctx.font = '700 7.5px "JetBrains Mono", monospace';
    ctx.fillStyle = '#62697d';
    ctx.textAlign = 'center';
    ctx.fillText(`${g.toFixed(1)}g`, cx, cy - r + 8);
  });
  ctx.setLineDash([]);

  // Crosshair axes
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius - 4);
  ctx.lineTo(cx, cy + radius + 4);
  ctx.moveTo(cx - radius - 4, cy);
  ctx.lineTo(cx + radius + 4, cy);
  ctx.stroke();

  // Axis direction labels
  ctx.font = '800 7.5px "Outfit", sans-serif';
  ctx.fillStyle = '#8e94a5';
  ctx.textAlign = 'center';
  ctx.fillText('ACCEL (+)', cx, 9);
  ctx.fillText('BRAKE (-)', cx, h - 3);
  ctx.textAlign = 'left';
  ctx.fillText('LEFT', 4, cy - 3);
  ctx.textAlign = 'right';
  ctx.fillText('RIGHT', w - 4, cy - 3);

  // Background scatter points of active lap / session
  const recs = state.activeRecords;
  if (recs && recs.length > 0) {
    const step = Math.max(1, Math.floor(recs.length / 500));
    for (let i = 0; i < recs.length; i += step) {
      const r = recs[i];
      const glong = r.accel_long_g || 0;
      const glat = r.accel_lat_g || 0;
      const px = cx + (glat / maxG) * radius;
      const py = cy - (glong / maxG) * radius;

      // Color by acceleration phase
      if (glong < -0.4) {
        ctx.fillStyle = 'rgba(255, 23, 68, 0.35)'; // Braking
      } else if (Math.abs(glat) > 0.6) {
        ctx.fillStyle = 'rgba(0, 229, 255, 0.35)'; // Cornering
      } else if (glong > 0.3) {
        ctx.fillStyle = 'rgba(0, 230, 118, 0.35)'; // Drive acceleration
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      }
      ctx.beginPath();
      ctx.arc(px, py, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Live dynamic ball & vector
  const liveX = cx + (liveGlat / maxG) * radius;
  const liveY = cy - (liveGlong / maxG) * radius;

  // Vector line from origin
  ctx.strokeStyle = '#ffd600';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(liveX, liveY);
  ctx.stroke();

  // Glowing current G ball
  ctx.shadowColor = '#ffd600';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(liveX, liveY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Update G-G stat pills
  if (dom.valGgTotal) dom.valGgTotal.textContent = `${liveGtotal.toFixed(2)} G`;
  if (state.sessionData && state.sessionData.stats) {
    const s = state.sessionData.stats;
    if (dom.valMaxBrakeG) dom.valMaxBrakeG.textContent = `${(s.max_brake_g || -1.2).toFixed(2)}g`;
    if (dom.valMaxAccelG) dom.valMaxAccelG.textContent = `+${(s.max_accel_g || 0.8).toFixed(2)}g`;
    if (dom.valMaxLatG) dom.valMaxLatG.textContent = `${(s.max_lat_g || 1.1).toFixed(2)}g`;
  }
}

// ==========================================================================
// Lean Angle vs. Throttle Application 2D Heatmap Matrix
// ==========================================================================
function renderLeanThrottleMatrix(lapNumber = -1) {
  if (!dom.leanThrottleTable) return;

  let targetRecords = state.records || [];
  if (lapNumber !== -1) {
    const lapObj = state.laps.find(l => l.lap_number === lapNumber);
    if (lapObj) {
      targetRecords = state.records.slice(lapObj.start_index, lapObj.end_index + 1);
    }
  }
  if (!targetRecords || targetRecords.length === 0) return;

  const tpsBins = [
    { label: '80 - 100%', min: 80, max: 100.1 },
    { label: '60 - 80%', min: 60, max: 80 },
    { label: '40 - 60%', min: 40, max: 60 },
    { label: '20 - 40%', min: 20, max: 40 },
    { label: '0 - 20%', min: 0, max: 20 }
  ];

  const leanBins = [
    { label: '0 - 10°', min: 0, max: 10 },
    { label: '10 - 20°', min: 10, max: 20 },
    { label: '20 - 30°', min: 20, max: 30 },
    { label: '30 - 40°', min: 30, max: 40 },
    { label: '40 - 50°', min: 40, max: 50 },
    { label: '50°+', min: 50, max: 90 }
  ];

  const grid = Array.from({ length: tpsBins.length }, () => Array(leanBins.length).fill(0));
  let totalFrames = 0;
  let fullGasTotalFrames = 0;
  let fullGasUprightFrames = 0;
  let highLeanRiskFrames = 0;
  const pickupLeans = [];

  let prevTps = 0;
  for (const r of targetRecords) {
    const tps = r.tps_pct || 0;
    const lean = Math.abs(r.lean_angle_deg || 0);

    // Throttle pickup: transitioning from low throttle into active drive
    if (prevTps < 10 && tps >= 18) {
      pickupLeans.push(lean);
    }
    prevTps = tps;

    // Upright full gas calculation
    if (tps >= 80) {
      fullGasTotalFrames++;
      if (lean < 15) fullGasUprightFrames++;
    }

    // High lean risk calculation
    if (tps >= 60 && lean >= 40) {
      highLeanRiskFrames++;
    }

    let tIdx = tpsBins.findIndex(b => tps >= b.min && tps < b.max);
    if (tIdx === -1) tIdx = tpsBins.length - 1;

    let lIdx = leanBins.findIndex(b => lean >= b.min && lean < b.max);
    if (lIdx === -1) lIdx = leanBins.length - 1;

    grid[tIdx][lIdx]++;
    totalFrames++;
  }

  // Calculate KPIs
  const avgPickup = pickupLeans.length > 0
    ? (pickupLeans.reduce((a, b) => a + b, 0) / pickupLeans.length).toFixed(1) + '°'
    : '--°';
  const uprightRatio = fullGasTotalFrames > 0
    ? ((fullGasUprightFrames / fullGasTotalFrames) * 100).toFixed(0) + '%'
    : '--%';
  const riskIndex = totalFrames > 0
    ? ((highLeanRiskFrames / totalFrames) * 100).toFixed(1) + '%'
    : '0.0%';

  if (dom.kpiPickupLean) dom.kpiPickupLean.textContent = avgPickup;
  if (dom.kpiUprightGas) dom.kpiUprightGas.textContent = uprightRatio;
  if (dom.kpiLeanRisk) dom.kpiLeanRisk.textContent = riskIndex;

  // Max percentage for heat gradient scaling
  let maxPct = 0.1;
  const pcts = grid.map(row => row.map(cnt => {
    const p = totalFrames > 0 ? (cnt / totalFrames) * 100 : 0;
    if (p > maxPct) maxPct = p;
    return p;
  }));

  // Build HTML Matrix Table
  let html = '<thead><tr><th class="axis-header">TPS \\ LEAN</th>';
  leanBins.forEach(lb => {
    html += `<th>${lb.label}</th>`;
  });
  html += '</tr></thead><tbody>';

  tpsBins.forEach((tb, tIdx) => {
    html += `<tr><th class="axis-header">${tb.label}</th>`;
    leanBins.forEach((lb, lIdx) => {
      const count = grid[tIdx][lIdx];
      const pct = pcts[tIdx][lIdx];
      const isDanger = (tb.min >= 60 && lb.min >= 40);

      let heatClass = 'matrix-cell-empty';
      if (count > 0) {
        const heatNorm = pct / maxPct;
        if (heatNorm > 0.70) heatClass = 'matrix-cell-heat-5';
        else if (heatNorm > 0.45) heatClass = 'matrix-cell-heat-4';
        else if (heatNorm > 0.25) heatClass = 'matrix-cell-heat-3';
        else if (heatNorm > 0.10) heatClass = 'matrix-cell-heat-2';
        else heatClass = 'matrix-cell-heat-1';
      }
      if (isDanger && count > 0) heatClass += ' matrix-cell-danger';

      const cellText = count > 0 ? `${pct.toFixed(1)}%` : '-';
      const timeSec = (count * 0.1).toFixed(1);
      html += `<td class="${heatClass}" title="Throttle ${tb.label}, Lean ${lb.label}: ${count} frames (${timeSec}s)">${cellText}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';

  dom.leanThrottleTable.innerHTML = html;
}
