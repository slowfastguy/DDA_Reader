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

  // --- Lane 4: Delta Time (Delta t Curve: Lap A vs Lap B) ---
  const yL4 = laneHeight * 3;
  const yCenterL4 = yL4 + laneHeight / 2;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, yCenterL4);
  ctx.lineTo(w, yCenterL4);
  ctx.stroke();

  ctx.strokeStyle = '#00e676';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  const maxDelta = 5.0;
  for (let i = 0; i < recsA.length; i++) {
    const rA = recsA[i];
    const relDist = rA.distance_m - recsA[0].distance_m;
    const elapsedA = rA.time_s - recsA[0].time_s;
    const rB = recsB.find(b => (b.distance_m - recsB[0].distance_m) >= relDist) || recsB[recsB.length - 1];
    const elapsedB = rB.time_s - recsB[0].time_s;
    const deltaT = elapsedB - elapsedA;

    const x = (relDist / maxDist) * w;
    const y = yCenterL4 - (deltaT / maxDelta) * (laneHeight / 2 - pad);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

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

  // 2. Standard Single Lap Tooltip
  const r = state.activeRecords[idx];
  if (!r) return;

  const spd = state.unitMph ? ((r.speed_kmh || 0) * 0.621371) : (r.speed_kmh || 0);
  const spdUnit = state.unitMph ? 'mph' : 'km/h';

  dom.chartTooltip.innerHTML = `
    <strong>Time: ${formatTime(r.time_s)} | Dist: ${r.distance_m ? r.distance_m.toFixed(0) : 0}m</strong><br>
    Speed: <span style="color:#00e5ff">${spd.toFixed(1)} ${spdUnit}</span> | RPM: <span style="color:#ff9100">${r.rpm || 0}</span><br>
    TPS: <span style="color:#00e676">${(r.tps_pct || 0).toFixed(0)}%</span> | Gear: <span style="color:#d500f9">${r.gear || 'N'}</span> | Lean: <span style="color:#ff0055">${(r.lean_angle_deg || 0).toFixed(1)}°</span><br>
    DTC Slow: <span style="color:#ffd600">${r.torque_slow_pct || 0}%</span> | Alt: ${r.gps_alt_m ? r.gps_alt_m.toFixed(1) : '0.0'}m
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
