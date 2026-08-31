/**
 * charts.js - Multi-Channel Waveforms, Stacked Section Analysis, and Shift Lights Engine
 * Ducati DDA Telemetry & GPS Visualizer
 */

let canvasCtx = null;
let canvasWidth = 0;
let canvasHeight = 0;

function initCanvas() {
  const c = dom.telemetryCanvas;
  if (!c) return;
  canvasCtx = c.getContext('2d');
  resizeCanvas();
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

  const laneHeight = h / 4;
  const pad = 4;

  ctx.strokeStyle = '#222634';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = i * laneHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // --- Lane 1: Speed & Engine RPM ---
  const maxSpd = (state.sessionData?.stats?.max_speed_kmh || 180) * (state.unitMph ? 0.621371 : 1.0);
  const maxRpm = 13000;

  if (state.channels.speedA) {
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const r = viewRecords[i];
      const spd = (r.speed_kmh || 0) * (state.unitMph ? 0.621371 : 1.0);
      const x = (i / (count - 1)) * w;
      const y = laneHeight - pad - (spd / maxSpd) * (laneHeight - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  if (state.channels.rpm) {
    ctx.strokeStyle = '#ff9100';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const r = viewRecords[i];
      const rpm = r.rpm || 0;
      const x = (i / (count - 1)) * w;
      const y = laneHeight - pad - (rpm / maxRpm) * (laneHeight - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // --- Lane 2: Throttle (TPS %) & DTC Reduction ---
  const yL2 = laneHeight;
  if (state.channels.tps) {
    ctx.fillStyle = 'rgba(0, 230, 118, 0.12)';
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, yL2 + laneHeight - pad);
    for (let i = 0; i < count; i++) {
      const tps = viewRecords[i].tps_pct || 0;
      const x = (i / (count - 1)) * w;
      const y = yL2 + laneHeight - pad - (tps / 100.0) * (laneHeight - pad * 2);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, yL2 + laneHeight - pad);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const tps = viewRecords[i].tps_pct || 0;
      const x = (i / (count - 1)) * w;
      const y = yL2 + laneHeight - pad - (tps / 100.0) * (laneHeight - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  if (state.channels.dtc) {
    ctx.strokeStyle = '#ffd600';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const dtc = viewRecords[i].torque_slow_pct || 0;
      const x = (i / (count - 1)) * w;
      const y = yL2 + laneHeight - pad - (dtc / 100.0) * (laneHeight - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // --- Lane 3: Lean Angle (° with centered 0° baseline) ---
  const yL3 = laneHeight * 2;
  const yCenterL3 = yL3 + laneHeight / 2;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, yCenterL3);
  ctx.lineTo(w, yCenterL3);
  ctx.stroke();

  if (state.channels.lean) {
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const lean = viewRecords[i].lean_angle_deg || 0;
      const x = (i / (count - 1)) * w;
      const y = yCenterL3 - (lean / 50.0) * (laneHeight / 2 - pad);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // --- Lane 4: Gear ---
  const yL4 = laneHeight * 3;
  if (state.channels.gear) {
    ctx.strokeStyle = '#d500f9';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const gear = viewRecords[i].gear || 0;
      const x = (i / (count - 1)) * w;
      const y = yL4 + laneHeight - pad - (gear / 6.0) * (laneHeight - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Optional G-Long Channel (Braking & Acceleration)
  if (state.channels.gLong) {
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const gLong = viewRecords[i].accel_long_g || 0;
      const x = (i / (count - 1)) * w;
      const y = yCenterL3 - (gLong / 1.6) * (laneHeight / 2 - pad);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Optional G-Lat Channel (Cornering Load)
  if (state.channels.gLat) {
    ctx.strokeStyle = '#2979ff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const gLat = viewRecords[i].accel_lat_g || 0;
      const x = (i / (count - 1)) * w;
      const y = yCenterL3 - (gLat / 1.6) * (laneHeight / 2 - pad);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Optional Elevation & Gradient Channel
  if (state.channels.elevation) {
    const minAlt = state.sessionData?.stats?.min_alt_m || 0;
    const maxAlt = Math.max(minAlt + 10, state.sessionData?.stats?.max_alt_m || 100);
    const altRange = Math.max(10, maxAlt - minAlt);

    ctx.strokeStyle = '#ab47bc';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const alt = viewRecords[i].gps_alt_m !== null ? viewRecords[i].gps_alt_m : minAlt;
      const x = (i / (count - 1)) * w;
      const y = yL4 + laneHeight - pad - ((alt - minAlt) / altRange) * (laneHeight - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

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

  const laneHeight = h / 4;
  const pad = 4;

  const rawMaxSpd = Math.max(...activeLaps.map(l => l.maxSpeed), 100);
  const maxSpd = (rawMaxSpd * 1.08) * (state.unitMph ? 0.621371 : 1.0);

  // Lane Dividers
  ctx.strokeStyle = '#222634';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = i * laneHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Lane Headers / Labels
  ctx.font = '800 8.5px "Outfit", sans-serif';
  ctx.fillStyle = '#62697d';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  if (isTimeSync) {
    ctx.fillText(`STACKED SPEED (${state.unitMph ? 'MPH' : 'KM/H'}) — ALIGNED BY TIME (0.0s to ${maxDur.toFixed(1)}s)`, 8, 3);
    ctx.fillText('STACKED THROTTLE (TPS %)', 8, laneHeight + 3);
    ctx.fillText('STACKED LEAN ANGLE (DEG)', 8, laneHeight * 2 + 3);
    ctx.fillText('STACKED GEAR & DTC', 8, laneHeight * 3 + 3);
  } else {
    ctx.fillText(`STACKED SPEED (${state.unitMph ? 'MPH' : 'KM/H'}) — ALIGNED BY DISTANCE (0m to ${maxDist.toFixed(0)}m)`, 8, 3);
    ctx.fillText('STACKED THROTTLE (TPS %) [20% PICKUP MARKED]', 8, laneHeight + 3);
    ctx.fillText('STACKED LEAN ANGLE (DEG)', 8, laneHeight * 2 + 3);
    ctx.fillText('STACKED GEAR & DTC', 8, laneHeight * 3 + 3);
  }

  // --- Lane 1: Stacked Speed Overlays ---
  if (state.channels.speedA || state.channels.speedB) {
    activeLaps.forEach(lap => {
      const recs = lap.records;
      if (recs.length < 2) return;
      const t0 = recs[0].time_s || 0;
      const d0 = recs[0].distance_m || 0;

      ctx.strokeStyle = lap.color;
      ctx.lineWidth = lap.isSectionBest ? 2.6 : 1.5;
      if (lap.isSectionBest) {
        ctx.shadowColor = lap.color;
        ctx.shadowBlur = 6;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        const x = isTimeSync
          ? (((r.time_s || 0) - t0) / maxDur) * w
          : (((r.distance_m || 0) - d0) / maxDist) * w;
        const spd = (r.speed_kmh || 0) * (state.unitMph ? 0.621371 : 1.0);
        const y = laneHeight - pad - (spd / maxSpd) * (laneHeight - pad * 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw Apex Min Speed Marker Dot
      const apexRec = recs.reduce((minR, curR) => (curR.speed_kmh < minR.speed_kmh ? curR : minR), recs[0]);
      const apexX = isTimeSync
        ? (((apexRec.time_s || 0) - t0) / maxDur) * w
        : (((apexRec.distance_m || 0) - d0) / maxDist) * w;
      const apexSpd = (apexRec.speed_kmh || 0) * (state.unitMph ? 0.621371 : 1.0);
      const apexY = laneHeight - pad - (apexSpd / maxSpd) * (laneHeight - pad * 2);

      ctx.fillStyle = lap.color;
      ctx.beginPath();
      ctx.arc(apexX, apexY, lap.isSectionBest ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // --- Lane 2: Stacked Throttle (TPS %) Overlays ---
  const yL2 = laneHeight;
  if (state.channels.tps) {
    activeLaps.forEach(lap => {
      const recs = lap.records;
      if (recs.length < 2) return;
      const t0 = recs[0].time_s || 0;
      const d0 = recs[0].distance_m || 0;

      ctx.strokeStyle = lap.color;
      ctx.lineWidth = lap.isSectionBest ? 2.2 : 1.4;
      ctx.beginPath();
      for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        const x = isTimeSync
          ? (((r.time_s || 0) - t0) / maxDur) * w
          : (((r.distance_m || 0) - d0) / maxDist) * w;
        const tps = r.tps_pct || 0;
        const y = yL2 + laneHeight - pad - (tps / 100.0) * (laneHeight - pad * 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // In Distance mode, mark throttle pickup point (>= 20% TPS)
      if (!isTimeSync && lap.throttlePickupDist !== null) {
        const pickupX = (lap.throttlePickupDist / maxDist) * w;
        const pickupY = yL2 + laneHeight - pad - (20.0 / 100.0) * (laneHeight - pad * 2);
        ctx.fillStyle = lap.color;
        ctx.beginPath();
        ctx.arc(pickupX, pickupY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // --- Lane 3: Stacked Lean Angle Overlays ---
  const yL3 = laneHeight * 2;
  const yCenterL3 = yL3 + laneHeight / 2;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, yCenterL3);
  ctx.lineTo(w, yCenterL3);
  ctx.stroke();

  if (state.channels.lean) {
    activeLaps.forEach(lap => {
      const recs = lap.records;
      if (recs.length < 2) return;
      const t0 = recs[0].time_s || 0;
      const d0 = recs[0].distance_m || 0;

      ctx.strokeStyle = lap.color;
      ctx.lineWidth = lap.isSectionBest ? 2.2 : 1.4;
      ctx.beginPath();
      for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        const x = isTimeSync
          ? (((r.time_s || 0) - t0) / maxDur) * w
          : (((r.distance_m || 0) - d0) / maxDist) * w;
        const lean = r.lean_angle_deg || 0;
        const y = yCenterL3 - (lean / 50.0) * (laneHeight / 2 - pad);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }

  // --- Lane 4: Stacked Gear / DTC Overlays ---
  const yL4 = laneHeight * 3;
  if (state.channels.gear) {
    activeLaps.forEach(lap => {
      const recs = lap.records;
      if (recs.length < 2) return;
      const t0 = recs[0].time_s || 0;
      const d0 = recs[0].distance_m || 0;

      ctx.strokeStyle = lap.color;
      ctx.lineWidth = lap.isSectionBest ? 2.0 : 1.2;
      ctx.beginPath();
      for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        const x = isTimeSync
          ? (((r.time_s || 0) - t0) / maxDur) * w
          : (((r.distance_m || 0) - d0) / maxDist) * w;
        const gear = r.gear || 0;
        const y = yL4 + laneHeight - pad - (gear / 6.0) * (laneHeight - pad * 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }

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

  const maxDist = Math.max(lapA.distance_m, lapB.distance_m, 3500);
  const laneHeight = h / 4;
  const pad = 4;
  const maxSpd = (state.sessionData?.stats?.max_speed_kmh || 180) * (state.unitMph ? 0.621371 : 1.0);

  ctx.strokeStyle = '#222634';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = i * laneHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // --- Lane 1: Speed Overlay ---
  if (state.channels.speedA) {
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let i = 0; i < recsA.length; i++) {
      const r = recsA[i];
      const relDist = r.distance_m - recsA[0].distance_m;
      const x = (relDist / maxDist) * w;
      const spd = (r.speed_kmh || 0) * (state.unitMph ? 0.621371 : 1.0);
      const y = laneHeight - pad - (spd / maxSpd) * (laneHeight - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  if (state.channels.speedB) {
    ctx.strokeStyle = '#ffd600';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let i = 0; i < recsB.length; i++) {
      const r = recsB[i];
      const relDist = r.distance_m - recsB[0].distance_m;
      const x = (relDist / maxDist) * w;
      const spd = (r.speed_kmh || 0) * (state.unitMph ? 0.621371 : 1.0);
      const y = laneHeight - pad - (spd / maxSpd) * (laneHeight - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // --- Lane 2: Throttle Overlay ---
  const yL2 = laneHeight;
  if (state.channels.tps) {
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < recsA.length; i++) {
      const r = recsA[i];
      const relDist = r.distance_m - recsA[0].distance_m;
      const x = (relDist / maxDist) * w;
      const y = yL2 + laneHeight - pad - (r.tps_pct / 100.0) * (laneHeight - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let i = 0; i < recsB.length; i++) {
      const r = recsB[i];
      const relDist = r.distance_m - recsB[0].distance_m;
      const x = (relDist / maxDist) * w;
      const y = yL2 + laneHeight - pad - (r.tps_pct / 100.0) * (laneHeight - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // --- Lane 3: Lean Angle Overlay ---
  const yL3 = laneHeight * 2;
  const yCenterL3 = yL3 + laneHeight / 2;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, yCenterL3);
  ctx.lineTo(w, yCenterL3);
  ctx.stroke();

  if (state.channels.lean) {
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < recsA.length; i++) {
      const r = recsA[i];
      const relDist = r.distance_m - recsA[0].distance_m;
      const x = (relDist / maxDist) * w;
      const y = yCenterL3 - (r.lean_angle_deg / 50.0) * (laneHeight / 2 - pad);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#ffd600';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let i = 0; i < recsB.length; i++) {
      const r = recsB[i];
      const relDist = r.distance_m - recsB[0].distance_m;
      const x = (relDist / maxDist) * w;
      const y = yCenterL3 - (r.lean_angle_deg / 50.0) * (laneHeight / 2 - pad);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // --- Lane 4: Continuous Delta Time (Delta t Curve: Lap A vs Lap B) ---
  const yL4 = laneHeight * 3;
  const yCenterL4 = yL4 + laneHeight / 2;

  // Zero-line baseline
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, yCenterL4);
  ctx.lineTo(w, yCenterL4);
  ctx.stroke();

  // Grid tick guides (±1.0s)
  const maxDelta = 3.0; // ±3.0s full scale
  const yPlus1s = yCenterL4 - (1.0 / maxDelta) * (laneHeight / 2 - pad);
  const yMinus1s = yCenterL4 - (-1.0 / maxDelta) * (laneHeight / 2 - pad);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(0, yPlus1s);
  ctx.lineTo(w, yPlus1s);
  ctx.moveTo(0, yMinus1s);
  ctx.lineTo(w, yMinus1s);
  ctx.stroke();
  ctx.setLineDash([]);

  // Lane Labels
  ctx.font = '700 8.5px "Outfit", sans-serif';
  ctx.fillStyle = '#62697d';
  ctx.textAlign = 'left';
  ctx.fillText('CONTINUOUS TIME DELTA (Δt) — GREEN = LAP A AHEAD, RED = BEHIND', 8, yL4 + 3);

  ctx.font = '600 7.5px "JetBrains Mono", monospace';
  ctx.fillStyle = '#00e676';
  ctx.textAlign = 'right';
  ctx.fillText('-1.0s (Faster)', w - 8, yMinus1s + 8);
  ctx.fillStyle = '#ff5252';
  ctx.fillText('+1.0s (Slower)', w - 8, yPlus1s - 2);
  ctx.fillStyle = '#a5b4fc';
  ctx.fillText('0.0s', w - 8, yCenterL4 - 2);

  if (state.channels.deltaT !== false) {
    const deltaPoints = [];
    for (let i = 0; i < recsA.length; i++) {
      const rA = recsA[i];
      const relDist = rA.distance_m - recsA[0].distance_m;
      const elapsedA = rA.time_s - recsA[0].time_s;
      const rB = recsB.find(b => (b.distance_m - recsB[0].distance_m) >= relDist) || recsB[recsB.length - 1];
      const elapsedB = rB.time_s - recsB[0].time_s;
      
      // Delta: elapsedA - elapsedB (Negative = Lap A took less time = Faster)
      const deltaT = elapsedA - elapsedB;
      const x = (relDist / maxDist) * w;
      const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, deltaT));
      const y = yCenterL4 + (clampedDelta / maxDelta) * (laneHeight / 2 - pad);
      deltaPoints.push({ x, y, deltaT });
    }

    if (deltaPoints.length > 1) {
      // Shaded green/red fill against zero baseline
      for (let i = 0; i < deltaPoints.length - 1; i++) {
        const p1 = deltaPoints[i];
        const p2 = deltaPoints[i + 1];
        const isAhead = (p1.deltaT + p2.deltaT) <= 0;

        ctx.fillStyle = isAhead ? 'rgba(0, 230, 118, 0.20)' : 'rgba(255, 23, 68, 0.20)';
        ctx.beginPath();
        ctx.moveTo(p1.x, yCenterL4);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p2.x, yCenterL4);
        ctx.closePath();
        ctx.fill();
      }

      // Delta curve stroke with glowing shadow
      ctx.strokeStyle = '#00e676';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = 'rgba(0, 230, 118, 0.6)';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let i = 0; i < deltaPoints.length; i++) {
        const pt = deltaPoints[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // Optional Racing Line Lateral Deviation Trace
  if (state.channels.lineDelta !== false && recsA.length > 5 && recsB.length > 5) {
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    const maxLineOffsetM = 5.0; // ±5 meters full scale
    for (let i = 0; i < recsA.length; i++) {
      const rA = recsA[i];
      const relDist = rA.distance_m - recsA[0].distance_m;
      const rB = recsB.find(b => (b.distance_m - recsB[0].distance_m) >= relDist) || recsB[recsB.length - 1];

      let lateralOffset = 0;
      if (rA.gps_lat !== null && rB.gps_lat !== null) {
        lateralOffset = haversineDistanceM(rA.gps_lat, rA.gps_lon, rB.gps_lat, rB.gps_lon);
      }
      const x = (relDist / maxDist) * w;
      const y = yCenterL4 - (lateralOffset / maxLineOffsetM) * (laneHeight / 2 - pad);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

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
  const spdUnit = state.unitMph ? 'mph' : 'km/h';
  const glong = r.accel_long_g !== undefined ? r.accel_long_g.toFixed(2) : '0.00';
  const glat = r.accel_lat_g !== undefined ? r.accel_lat_g.toFixed(2) : '0.00';
  const gtot = r.accel_total_g !== undefined ? r.accel_total_g.toFixed(2) : '0.00';

  dom.chartTooltip.innerHTML = `
    <strong>Time: ${formatTime(r.time_s)} | Dist: ${r.distance_m ? r.distance_m.toFixed(0) : 0}m</strong><br>
    Speed: <span style="color:#00e5ff">${spd.toFixed(1)} ${spdUnit}</span> | RPM: <span style="color:#ff9100">${r.rpm || 0}</span><br>
    TPS: <span style="color:#00e676">${(r.tps_pct || 0).toFixed(0)}%</span> | Gear: <span style="color:#d500f9">${r.gear || 'N'}</span> | Lean: <span style="color:#ff0055">${(r.lean_angle_deg || 0).toFixed(1)}°</span><br>
    G-Force: <span style="color:#ff1744">${glong >= 0 ? '+' : ''}${glong}g</span> long | <span style="color:#2979ff">${glat >= 0 ? '+' : ''}${glat}g</span> lat | <span style="color:#ffd600">${gtot}G</span> sum<br>
    DTC: <span style="color:#ffd600">${r.torque_slow_pct || 0}%</span> | Alt: ${r.gps_alt_m ? r.gps_alt_m.toFixed(1) : '0.0'}m
  `;
  dom.chartTooltip.style.display = 'block';
  dom.chartTooltip.style.left = `${Math.min(canvasWidth - 230, Math.max(10, mouseX + 15))}px`;
}

function updateShiftLights(rpm) {
  const thresholds = [5500, 6500, 7500, 8500, 9200, 9900, 10500, 11000, 11500, 12000];
  dom.leds.forEach((led, i) => {
    if (!led) return;
    led.className = 'led';
    if (rpm >= thresholds[i]) {
      if (i < 3) led.classList.add('led-active-green');
      else if (i < 6) led.classList.add('led-active-yellow');
      else if (i < 9) led.classList.add('led-active-red');
      else led.classList.add('led-active-blue');
    }
  });
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
