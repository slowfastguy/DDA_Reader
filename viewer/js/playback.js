/**
 * playback.js - Telemetry Transport Loop, Smoothing Filters, and UI Updater
 * Ducati DDA Telemetry & GPS Visualizer
 */

function applySmoothingToRecords() {
  if (!state.records || state.records.length === 0) return;
  const level = state.smoothingLevel;

  const gpsIndices = [];
  const rawLats = [];
  const rawLons = [];
  const speeds = [];

  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    const rLat = r.raw_lat !== undefined ? r.raw_lat : r.gps_lat;
    const rLon = r.raw_lon !== undefined ? r.raw_lon : r.gps_lon;
    if (rLat !== null && rLon !== null) {
      gpsIndices.push(i);
      rawLats.push(rLat);
      rawLons.push(rLon);
      speeds.push(r.speed_kmh || 0);
    }
  }

  if (level === 'none') {
    for (let i = 0; i < gpsIndices.length; i++) {
      const idx = gpsIndices[i];
      state.records[idx].gps_lat = rawLats[i];
      state.records[idx].gps_lon = rawLons[i];
    }
  } else {
    const windowSize = level === 'low' ? 3 : (level === 'med' ? 5 : 9);
    const half = Math.floor(windowSize / 2);
    const weights = [];
    for (let x = -half; x <= half; x++) {
      weights.push(Math.exp(-0.5 * Math.pow(x / (windowSize / 3.0), 2)));
    }
    const wSum = weights.reduce((a, b) => a + b, 0);
    const normWeights = weights.map(w => w / wSum);

    for (let i = 0; i < gpsIndices.length; i++) {
      const idx = gpsIndices[i];
      if (speeds[i] < 3.0) {
        state.records[idx].gps_lat = rawLats[i];
        state.records[idx].gps_lon = rawLons[i];
        continue;
      }

      let wAcc = 0.0;
      let latAcc = 0.0;
      let lonAcc = 0.0;

      for (let wIdx = 0; wIdx < windowSize; wIdx++) {
        const k = i + (wIdx - half);
        if (k >= 0 && k < gpsIndices.length) {
          const w = normWeights[wIdx];
          wAcc += w;
          latAcc += rawLats[k] * w;
          lonAcc += rawLons[k] * w;
        }
      }

      state.records[idx].gps_lat = wAcc > 0 ? (latAcc / wAcc) : rawLats[i];
      state.records[idx].gps_lon = wAcc > 0 ? (lonAcc / wAcc) : rawLons[i];
    }
  }

  if (typeof renderMapTrack === 'function') renderMapTrack(false);
  if (typeof renderMapGates === 'function') renderMapGates();
  if (typeof renderSpeedExtremaMarkers === 'function') renderSpeedExtremaMarkers();
}

function seekToIndex(index) {
  if (!state.activeRecords || state.activeRecords.length === 0) return;
  state.currentIndex = Math.max(0, Math.min(state.activeRecords.length - 1, index));
  updateUI();
}

function updateUI() {
  if (!state.activeRecords || state.activeRecords.length === 0) return;
  const len = state.activeRecords.length;
  const idx0 = Math.floor(state.currentIndex);
  const frac = Math.max(0, Math.min(1, state.currentIndex - idx0));
  const idx1 = Math.min(len - 1, idx0 + 1);

  const r0 = state.activeRecords[idx0];
  const r1 = state.activeRecords[idx1];
  if (!r0) return;

  // 1. Timeline Controls
  if (dom.timelineSlider) dom.timelineSlider.value = idx0;
  const interpTime = (r0.time_s || 0) + ((r1.time_s || 0) - (r0.time_s || 0)) * frac;
  const displayTime = state.selectedLapNum === -1 ? interpTime : (interpTime - state.activeRecords[0].time_s);
  if (dom.lblTimeCurrent) dom.lblTimeCurrent.textContent = formatTime(displayTime);

  // 2. Speedometer
  const interpSpeedKmh = (r0.speed_kmh || 0) + ((r1.speed_kmh || 0) - (r0.speed_kmh || 0)) * frac;
  const spd = state.unitMph ? (interpSpeedKmh * 0.621371) : interpSpeedKmh;
  if (dom.valSpeedNumeric) dom.valSpeedNumeric.textContent = spd.toFixed(1);
  if (dom.lblSpeedUnit) dom.lblSpeedUnit.textContent = state.unitMph ? 'MPH' : 'KM/H';

  // 3. RPM & Shift Lights
  const interpRpm = (r0.rpm || 0) + ((r1.rpm || 0) - (r0.rpm || 0)) * frac;
  if (dom.valRpmNumeric) dom.valRpmNumeric.innerHTML = `${Math.round(interpRpm).toLocaleString()} <small>RPM</small>`;
  const rpmPct = Math.min(100, Math.max(0, (interpRpm / 12500) * 100));
  if (dom.tachBarFill) dom.tachBarFill.style.width = `${rpmPct}%`;
  if (typeof updateShiftLights === 'function') updateShiftLights(interpRpm);

  // 4. Gear
  const gear = frac > 0.5 ? (r1.gear || 0) : (r0.gear || 0);
  if (dom.valGear) {
    dom.valGear.textContent = gear === 0 ? 'N' : gear;
    dom.valGear.style.color = gear === 0 ? '#00e5ff' : '#ffd600';
  }

  // 5. Throttle (TPS)
  const interpTps = (r0.tps_pct || 0) + ((r1.tps_pct || 0) - (r0.tps_pct || 0)) * frac;
  if (dom.tpsMeterFill) dom.tpsMeterFill.style.height = `${interpTps}%`;
  if (dom.valTpsNumeric) dom.valTpsNumeric.textContent = `${interpTps.toFixed(0)}%`;

  // 6. Lean Angle & Motorcycle Tilt Animation
  const interpLean = (r0.lean_angle_deg || 0) + ((r1.lean_angle_deg || 0) - (r0.lean_angle_deg || 0)) * frac;
  if (dom.valLeanDeg) dom.valLeanDeg.textContent = `${Math.abs(interpLean).toFixed(1)}° ${interpLean < -0.5 ? 'L' : (interpLean > 0.5 ? 'R' : '')}`;
  if (dom.motoTiltGroup) dom.motoTiltGroup.setAttribute('transform', `rotate(${interpLean}, 0, 45)`);

  // 7. DTC Cut Indicators
  const dtcSlow = (r0.torque_slow_pct || 0) + ((r1.torque_slow_pct || 0) - (r0.torque_slow_pct || 0)) * frac;
  const dtcFast = (r0.torque_fast_pct || 0) + ((r1.torque_fast_pct || 0) - (r0.torque_fast_pct || 0)) * frac;
  if (dom.valDtcSlow) dom.valDtcSlow.textContent = `${Math.round(dtcSlow)}%`;
  if (dom.dtcSlowPill) dom.dtcSlowPill.classList.toggle('dtc-active', dtcSlow > 0.5);
  if (dom.valDtcFast) dom.valDtcFast.textContent = `${Math.round(dtcFast)}%`;
  if (dom.dtcFastPill) dom.dtcFastPill.classList.toggle('dtc-active', dtcFast > 0.5);

  // 8. Altitude & Distance
  const alt0 = r0.gps_alt_m !== null ? r0.gps_alt_m : 0;
  const alt1 = r1.gps_alt_m !== null ? r1.gps_alt_m : alt0;
  const interpAlt = alt0 + (alt1 - alt0) * frac;
  if (dom.valAltNumeric) dom.valAltNumeric.textContent = `${interpAlt.toFixed(1)} m`;

  const dist0 = r0.distance_m || 0;
  const dist1 = r1.distance_m || dist0;
  const interpDist = dist0 + (dist1 - dist0) * frac;
  if (dom.valDistNumeric) dom.valDistNumeric.textContent = `${(interpDist / 1000.0).toFixed(2)} km`;

  // 9. Live Lap Timer & Progressive Counting Sector Splits
  let currentLapObj = null;
  if (state.selectedLapNum !== -1) {
    currentLapObj = state.laps.find(l => l.lap_number === state.selectedLapNum);
  } else {
    currentLapObj = state.laps.find(l => interpTime >= l.start_time_s && interpTime <= l.end_time_s);
  }
  if (!currentLapObj && state.laps.length > 0) {
    currentLapObj = state.laps[0];
  }

  if (currentLapObj) {
    const lapElapsed = Math.max(0, interpTime - currentLapObj.start_time_s);
    if (dom.valLapElapsed) dom.valLapElapsed.textContent = formatLapTime(lapElapsed);
    if (dom.valLapTarget) dom.valLapTarget.textContent = `/ ${formatTime(currentLapObj.duration_s)}`;
    if (dom.lblLapName) dom.lblLapName.textContent = `${currentLapObj.name.toUpperCase()} TIME`;

    if (dom.valLapStatusText) {
      if (currentLapObj.is_best) {
        dom.valLapStatusText.textContent = "BEST LAP 🏆";
      } else if (currentLapObj.lap_number === 0) {
        dom.valLapStatusText.textContent = "OUT-LAP";
      } else if (currentLapObj.name && currentLapObj.name.includes("In-Lap")) {
        dom.valLapStatusText.textContent = "IN-LAP";
      } else {
        dom.valLapStatusText.textContent = "ON TRACK";
      }
    }

    // Sector timing: Live count-up when active, freeze at final split when crossed
    const s1Dur = (currentLapObj.sectors && currentLapObj.sectors[0]) || (currentLapObj.duration_s * 0.28);
    const s2Dur = (currentLapObj.sectors && currentLapObj.sectors[1]) || (currentLapObj.duration_s * 0.38);
    const s3Dur = (currentLapObj.sectors && currentLapObj.sectors[2]) || (currentLapObj.duration_s * 0.34);

    const tSplit1 = s1Dur;
    const tSplit2 = s1Dur + s2Dur;
    const tSplit3 = currentLapObj.duration_s;

    if (dom.valSec1 && dom.sec1Badge) {
      if (lapElapsed < tSplit1) {
        dom.valSec1.textContent = `${lapElapsed.toFixed(2)}s`;
        dom.sec1Badge.className = "sector-badge active-sector";
        if (dom.valSec2) dom.valSec2.textContent = "--.--";
        if (dom.sec2Badge) dom.sec2Badge.className = "sector-badge";
        if (dom.valSec3) dom.valSec3.textContent = "--.--";
        if (dom.sec3Badge) dom.sec3Badge.className = "sector-badge";
      } else if (lapElapsed < tSplit2) {
        dom.valSec1.textContent = `${s1Dur.toFixed(2)}s`;
        const isBestS1 = state.bestSectors[0] && Math.abs(s1Dur - state.bestSectors[0]) < 0.05;
        dom.sec1Badge.className = `sector-badge ${isBestS1 ? 'is-best-sec' : ''}`;

        const s2Live = lapElapsed - tSplit1;
        if (dom.valSec2) dom.valSec2.textContent = `${s2Live.toFixed(2)}s`;
        if (dom.sec2Badge) dom.sec2Badge.className = "sector-badge active-sector";

        if (dom.valSec3) dom.valSec3.textContent = "--.--";
        if (dom.sec3Badge) dom.sec3Badge.className = "sector-badge";
      } else {
        dom.valSec1.textContent = `${s1Dur.toFixed(2)}s`;
        const isBestS1 = state.bestSectors[0] && Math.abs(s1Dur - state.bestSectors[0]) < 0.05;
        dom.sec1Badge.className = `sector-badge ${isBestS1 ? 'is-best-sec' : ''}`;

        if (dom.valSec2) dom.valSec2.textContent = `${s2Dur.toFixed(2)}s`;
        const isBestS2 = state.bestSectors[1] && Math.abs(s2Dur - state.bestSectors[1]) < 0.05;
        if (dom.sec2Badge) dom.sec2Badge.className = `sector-badge ${isBestS2 ? 'is-best-sec' : ''}`;

        if (lapElapsed < tSplit3) {
          const s3Live = lapElapsed - tSplit2;
          if (dom.valSec3) dom.valSec3.textContent = `${s3Live.toFixed(2)}s`;
          if (dom.sec3Badge) dom.sec3Badge.className = "sector-badge active-sector";
        } else {
          if (dom.valSec3) dom.valSec3.textContent = `${s3Dur.toFixed(2)}s`;
          const isBestS3 = state.bestSectors[2] && Math.abs(s3Dur - state.bestSectors[2]) < 0.05;
          if (dom.sec3Badge) dom.sec3Badge.className = `sector-badge ${isBestS3 ? 'is-best-sec' : ''}`;
        }
      }
    }

    // Highlight corresponding lap row in DATA table if playing full session
    if (state.selectedLapNum === -1) {
      document.querySelectorAll('#lap-table-body tr').forEach(row => {
        const lNum = parseInt(row.dataset.lap, 10);
        row.classList.toggle('active-lap-row', lNum === currentLapObj.lap_number);
      });
    }

    // 10. Update Authentic MotoGP Broadcast Live Card
    if (typeof updateMotoGPCard === 'function') {
      updateMotoGPCard(currentLapObj, interpTime);
    }
  }

  // 11. Continuous Sub-frame GPS Position & Dynamic Direction Heading (60+ FPS)
  if (r0.gps_lat !== null && r0.gps_lon !== null && state.bikeMarker) {
    let curLat = r0.gps_lat;
    let curLon = r0.gps_lon;
    if (r1 && r1.gps_lat !== null && r1.gps_lon !== null) {
      curLat = r0.gps_lat + (r1.gps_lat - r0.gps_lat) * frac;
      curLon = r0.gps_lon + (r1.gps_lon - r0.gps_lon) * frac;
    }

    const latLng = [curLat, curLon];
    state.bikeMarker.setLatLng(latLng);

    for (let f = idx0 + 1; f < Math.min(len, idx0 + 10); f++) {
      const nextR = state.activeRecords[f];
      if (nextR && nextR.gps_lat !== null && nextR.gps_lon !== null) {
        const d = haversineDistanceM(curLat, curLon, nextR.gps_lat, nextR.gps_lon);
        if (d >= 0.4) {
          const targetHeading = calculateBearing(curLat, curLon, nextR.gps_lat, nextR.gps_lon);
          let diff = (targetHeading - state.lastBikeHeading) % 360;
          if (diff > 180) diff -= 360;
          if (diff < -180) diff += 360;
          state.lastBikeHeading = (state.lastBikeHeading + diff * 0.4 + 360) % 360;
          break;
        }
      }
    }

    const markerEl = state.bikeMarker.getElement();
    const arrow = markerEl ? markerEl.querySelector('.bike-arrow-svg') : document.getElementById('bike-marker-svg');
    if (arrow) {
      arrow.style.transform = `rotate(${state.lastBikeHeading}deg)`;
    }

    if (state.followBike && state.map) {
      state.map.panTo(latLng, { animate: false });
    }
  }

  // 12. Ghost Marker Update in Compare Mode
  if (state.isCompareMode && typeof updateGhostMarker === 'function') {
    updateGhostMarker(interpDist, interpTime, r0);
  }

  if (typeof updateScrubberLinePosition === 'function') {
    updateScrubberLinePosition();
  }
}

function togglePlayPause() {
  if (state.isPlaying) pausePlayback();
  else startPlayback();
}

function startPlayback() {
  if (!state.activeRecords || state.activeRecords.length === 0) return;
  state.isPlaying = true;
  if (dom.iconPlay) dom.iconPlay.style.display = 'none';
  if (dom.iconPause) dom.iconPause.style.display = 'block';
  if (dom.btnPlayPause) dom.btnPlayPause.classList.add('btn-playing');
  state.lastFrameTime = performance.now();
  playbackLoop(state.lastFrameTime);
}

function pausePlayback() {
  state.isPlaying = false;
  if (dom.iconPlay) dom.iconPlay.style.display = 'block';
  if (dom.iconPause) dom.iconPause.style.display = 'none';
  if (dom.btnPlayPause) dom.btnPlayPause.classList.remove('btn-playing');
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }
}

function playbackLoop(timestamp) {
  if (!state.isPlaying) return;

  const dt = (timestamp - state.lastFrameTime) / 1000.0;
  state.lastFrameTime = timestamp;

  const frameIncrement = (dt * state.playbackSpeed) / 0.10;
  state.currentIndex += frameIncrement;

  if (state.currentIndex >= state.activeRecords.length - 1) {
    state.currentIndex = state.activeRecords.length - 1;
    updateUI();
    pausePlayback();
    return;
  }

  updateUI();
  state.animationFrameId = requestAnimationFrame(playbackLoop);
}

function selectLap(lapNum, shouldFit = false) {
  state.selectedLapNum = lapNum;
  pausePlayback();

  document.querySelectorAll('#lap-table-body tr').forEach(row => {
    row.classList.toggle('active-lap-row', parseInt(row.dataset.lap, 10) === lapNum);
  });

  if (lapNum === -1) {
    state.activeRecords = state.records;
    if (dom.mapPanelTitle) dom.mapPanelTitle.textContent = "GPS Track Map (All Laps)";
    if (dom.chartsPanelTitle) dom.chartsPanelTitle.textContent = "Synchronized Telemetry Channels (Full Session)";
  } else {
    const lapObj = state.laps.find(l => l.lap_number === lapNum);
    if (lapObj) {
      state.activeRecords = state.records.slice(lapObj.start_index, lapObj.end_index + 1);
      if (dom.mapPanelTitle) dom.mapPanelTitle.textContent = `GPS Track Map - ${lapObj.name} (${formatTime(lapObj.duration_s)})`;
      if (dom.chartsPanelTitle) dom.chartsPanelTitle.textContent = `Telemetry Channels - ${lapObj.name} (${formatTime(lapObj.duration_s)})`;
    }
  }

  for (let i = 0; i < state.activeRecords.length; i++) {
    state.activeRecords[i].local_index = i;
  }

  state.currentIndex = 0;
  if (dom.timelineSlider) {
    dom.timelineSlider.max = Math.max(1, state.activeRecords.length - 1);
    dom.timelineSlider.value = 0;
  }

  const totalDur = state.activeRecords.length > 0
    ? (state.activeRecords[state.activeRecords.length - 1].time_s - state.activeRecords[0].time_s)
    : 0;
  if (dom.lblTimeTotal) dom.lblTimeTotal.textContent = formatTime(totalDur);

  if (typeof renderMapTrack === 'function') renderMapTrack(shouldFit);
  if (typeof resizeCanvas === 'function') resizeCanvas();
  seekToIndex(0);
}

function toggleCompareMode() {
  state.isCompareMode = !state.isCompareMode;
  if (dom.btnToggleCompare) dom.btnToggleCompare.classList.toggle('active', state.isCompareMode);
  if (dom.compareControlsBar) dom.compareControlsBar.style.display = state.isCompareMode ? 'flex' : 'none';
  if (dom.legCompareSpd) dom.legCompareSpd.style.display = state.isCompareMode ? 'flex' : 'none';

  if (state.isCompareMode) {
    if (state.ghostMarker && state.map) state.ghostMarker.addTo(state.map);
    if (dom.lblCompareBtn) dom.lblCompareBtn.textContent = 'Exit Compare';
    selectLap(state.compareLapA, false);
  } else {
    if (state.ghostMarker && state.map) state.map.removeLayer(state.ghostMarker);
    if (dom.lblCompareBtn) dom.lblCompareBtn.textContent = 'Compare Laps';
    selectLap(state.selectedLapNum, false);
  }
}
