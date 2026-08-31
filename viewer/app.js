/**
 * app.js - Main Application Coordinator & UI Event Wireup
 * Ducati DDA Telemetry & GPS Visualizer Pro Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initMap();
  initCanvas();
  bindEvents();
  initMotoGPOverlay();
  checkEmbeddedOrSampleData();
});

function renderLapListTable() {
  if (!dom.lapTableBody) return;
  dom.lapTableBody.innerHTML = '';
  if (dom.selectLapJump) dom.selectLapJump.innerHTML = '<option value="-1">All Laps (Full Session)</option>';
  if (dom.selectLapA) dom.selectLapA.innerHTML = '';
  if (dom.selectLapB) dom.selectLapB.innerHTML = '';
  if (dom.selectExportLap) dom.selectExportLap.innerHTML = '';
  if (dom.selectMatrixLap) dom.selectMatrixLap.innerHTML = '<option value="-1">All Laps (Full Session)</option>';

  const trAll = document.createElement('tr');
  trAll.dataset.lap = '-1';
  trAll.className = 'active-lap-row';
  const totalDur = state.records.length > 0 ? (state.records[state.records.length - 1].time_s - state.records[0].time_s) : 0;
  trAll.innerHTML = `
    <td><strong>🏁 All</strong></td>
    <td>${formatTime(totalDur)}</td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td>${state.sessionData?.stats?.max_speed_mph ? state.sessionData.stats.max_speed_mph.toFixed(0) + ' mph' : '-'}</td>
  `;
  trAll.addEventListener('click', () => selectLap(-1, false));
  dom.lapTableBody.appendChild(trAll);

  state.laps.forEach(l => {
    const tr = document.createElement('tr');
    tr.dataset.lap = l.lap_number.toString();
    if (l.is_best) tr.classList.add('best-lap-row');

    const durStr = formatTime(l.duration_s);
    const s1 = l.sectors && l.sectors[0] ? `${l.sectors[0].toFixed(1)}` : '-';
    const s2 = l.sectors && l.sectors[1] ? `${l.sectors[1].toFixed(1)}` : '-';
    const s3 = l.sectors && l.sectors[2] ? `${l.sectors[2].toFixed(1)}` : '-';

    const maxSpd = l.max_speed_kmh ? (state.unitMph ? (l.max_speed_kmh * 0.621371).toFixed(0) : l.max_speed_kmh.toFixed(0)) : '-';

    tr.innerHTML = `
      <td>${l.is_best ? '🏆 ' : ''}${escapeHTML(l.name)}</td>
      <td><strong>${durStr}</strong></td>
      <td>${s1}</td>
      <td>${s2}</td>
      <td>${s3}</td>
      <td>${maxSpd}</td>
    `;
    tr.addEventListener('click', () => selectLap(l.lap_number, false));
    dom.lapTableBody.appendChild(tr);

    const opt = document.createElement('option');
    opt.value = l.lap_number;
    opt.textContent = `${l.name} (${durStr})${l.is_best ? ' [BEST]' : ''}`;
    if (dom.selectLapJump) dom.selectLapJump.appendChild(opt.cloneNode(true));
    if (dom.selectLapA) dom.selectLapA.appendChild(opt.cloneNode(true));
    if (dom.selectLapB) dom.selectLapB.appendChild(opt.cloneNode(true));
    if (dom.selectExportLap) dom.selectExportLap.appendChild(opt.cloneNode(true));
    if (dom.selectMatrixLap) dom.selectMatrixLap.appendChild(opt.cloneNode(true));
  });

  const bestLap = state.laps.find(l => l.is_best);
  if (bestLap) {
    if (dom.dataBestLapBadge) dom.dataBestLapBadge.textContent = `🏆 Best: ${formatTime(bestLap.duration_s)}`;
    state.compareLapA = bestLap.lap_number;
    if (dom.selectLapA) dom.selectLapA.value = bestLap.lap_number;
    if (dom.selectExportLap) dom.selectExportLap.value = bestLap.lap_number;
  }
}

function loadSessionData(jsonObj) {
  state.sessionData = jsonObj;
  state.records = jsonObj.records || [];
  state.laps = jsonObj.laps || [];

  const matched = autoDetectTrackFromGps();
  if (!matched) {
    state.gates = jsonObj.gates || (state.tracks['sonoma_raceway'] ? state.tracks['sonoma_raceway'].gates : [
      { id: 'sf', name: 'Start / Finish', type: 'sf', lat: 38.161580, lon: -122.454640, bearing: 310.0 },
      { id: 's1', name: 'Sector 1', type: 'split', lat: 38.164320, lon: -122.458900, bearing: 265.0 },
      { id: 's2', name: 'Sector 2', type: 'split', lat: 38.158210, lon: -122.457800, bearing: 180.0 }
    ]);
  }

  state.activeRecords = state.records;
  state.selectedLapNum = -1;
  state.currentIndex = 0;

  if (state.records.length === 0) {
    alert('No telemetry records found in session file.');
    return;
  }

  const nRecs = state.records.length;
  for (let i = 0; i < nRecs; i++) {
    const r = state.records[i];
    r.orig_index = i;
    r.local_index = i;

    // Kinematics fallback
    if (r.accel_long_g === undefined) {
      if (nRecs > 2) {
        let dt, dv_ms;
        if (i === 0) {
          dt = Math.max(0.01, state.records[1].time_s - r.time_s);
          dv_ms = ((state.records[1].speed_kmh || 0) - (r.speed_kmh || 0)) / 3.6;
        } else if (i === nRecs - 1) {
          dt = Math.max(0.01, r.time_s - state.records[i - 1].time_s);
          dv_ms = ((r.speed_kmh || 0) - (state.records[i - 1].speed_kmh || 0)) / 3.6;
        } else {
          dt = Math.max(0.02, state.records[i + 1].time_s - state.records[i - 1].time_s);
          dv_ms = ((state.records[i + 1].speed_kmh || 0) - (state.records[i - 1].speed_kmh || 0)) / 3.6;
        }
        r.accel_long_g = Math.max(-1.8, Math.min(1.5, dv_ms / (dt * 9.80665)));
      } else {
        r.accel_long_g = 0;
      }
    }
    if (r.accel_lat_g === undefined) {
      const radLean = Math.min(65.0, Math.abs(r.lean_angle_deg || 0)) * (Math.PI / 180.0);
      const gLatMag = Math.tan(radLean);
      r.accel_lat_g = ((r.lean_angle_deg || 0) >= 0 ? 1.0 : -1.0) * Math.min(2.0, gLatMag);
    }
    if (r.accel_total_g === undefined) {
      r.accel_total_g = Math.sqrt((r.accel_long_g || 0) ** 2 + (r.accel_lat_g || 0) ** 2);
    }
    if (r.wheel_slip_pct === undefined) {
      let slip = ((r.torque_slow_pct || 0) * 0.25) + ((r.torque_fast_pct || 0) * 0.35);
      if ((r.tps_pct || 0) > 50 && (r.accel_long_g || 0) > 0.35 && Math.abs(r.lean_angle_deg || 0) > 15) {
        slip += (Math.abs(r.lean_angle_deg || 0) / 45.0) * 5.0;
      }
      r.wheel_slip_pct = Math.min(40.0, slip);
    }
  }

  const h = jsonObj.header || {};
  const s = jsonObj.stats || {};
  if (!matched && dom.metaTrackName) {
    dom.metaTrackName.textContent = h.track_name || 'Ducati Telemetry Track';
  }
  if (dom.metaRiderName) dom.metaRiderName.textContent = h.rider_name || 'Ducati Rider';
  if (h.rider_name && !localStorage.getItem('dda_settings')) {
    state.motogp.riderName = h.rider_name.toUpperCase();
    syncMotoGPConfigToUI();
  }
  if (dom.metaDuration) dom.metaDuration.textContent = `${(s.duration_min || 0).toFixed(1)} min (${state.records.length.toLocaleString()} frames)`;

  if (dom.peakLeanLeft) dom.peakLeanLeft.textContent = `${(s.max_lean_left_deg || 0).toFixed(1)}°`;
  if (dom.peakLeanRight) dom.peakLeanRight.textContent = `${(s.max_lean_right_deg || 0).toFixed(1)}°`;

  applySmoothingToRecords();
  recalculateLapsAndSectors();

  if (dom.timelineSlider) {
    dom.timelineSlider.max = state.records.length - 1;
    dom.timelineSlider.value = 0;
  }
  if (dom.lblTimeTotal) dom.lblTimeTotal.textContent = formatTime(state.records[state.records.length - 1].time_s);

  renderMapTrack(true);
  renderMapGates();
  resizeCanvas();
  seekToIndex(0);
}

function checkEmbeddedOrSampleData() {
  const embeddedTag = document.getElementById('embedded-data');
  if (embeddedTag && embeddedTag.textContent.trim().length > 10) {
    try {
      const data = JSON.parse(embeddedTag.textContent);
      loadSessionData(data);
      return;
    } catch (e) {
      console.warn('Embedded JSON parse error:', e);
    }
  }

  fetch('Run045-192535-00.14.json')
    .then(r => r.json())
    .then(data => loadSessionData(data))
    .catch(() => console.log('Awaiting file upload or drag-and-drop.'));
}

function parseUploadedFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      if (file.name.endsWith('.json')) {
        const json = JSON.parse(e.target.result);
        loadSessionData(json);
      } else {
        alert('Please select an exported .json telemetry file or standalone HTML bundle.');
      }
    } catch (err) {
      alert(`Failed to parse file: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

function bindEvents() {
  if (dom.btnPlayPause) dom.btnPlayPause.addEventListener('click', togglePlayPause);
  if (dom.btnStepPrev) dom.btnStepPrev.addEventListener('click', () => seekToIndex(state.currentIndex - 1));
  if (dom.btnStepNext) dom.btnStepNext.addEventListener('click', () => seekToIndex(state.currentIndex + 1));

  if (dom.selectPlaybackSpeed) {
    dom.selectPlaybackSpeed.addEventListener('change', (e) => {
      state.playbackSpeed = parseFloat(e.target.value) || 1.0;
      saveSettingsToStorage();
    });
  }

  if (dom.timelineSlider) {
    dom.timelineSlider.addEventListener('input', (e) => {
      seekToIndex(parseInt(e.target.value, 10));
    });
  }

  if (dom.btnToggleUnit) {
    dom.btnToggleUnit.addEventListener('click', () => {
      state.unitMph = !state.unitMph;
      if (dom.lblUnitToggle) dom.lblUnitToggle.textContent = state.unitMph ? 'MPH' : 'KM/H';
      if (dom.prefSpeedUnit) dom.prefSpeedUnit.value = state.unitMph ? 'mph' : 'kmh';
      saveSettingsToStorage();
      updateUI();
      renderCharts();
      renderSpeedExtremaMarkers();
      renderLapListTable();
    });
  }

  if (dom.btnToggleExtrema) {
    dom.btnToggleExtrema.addEventListener('click', () => {
      state.showSpeedExtrema = !state.showSpeedExtrema;
      dom.btnToggleExtrema.classList.toggle('active', state.showSpeedExtrema);
      dom.btnToggleExtrema.textContent = state.showSpeedExtrema ? '⚡ Speeds: ON' : '⚡ Speeds: OFF';
      if (dom.prefShowExtrema) dom.prefShowExtrema.checked = state.showSpeedExtrema;
      saveSettingsToStorage();
      renderSpeedExtremaMarkers();
    });
  }

  // Lean vs Throttle Matrix Modal
  if (dom.btnOpenMatrix) {
    dom.btnOpenMatrix.addEventListener('click', () => {
      const lapNum = dom.selectMatrixLap ? parseInt(dom.selectMatrixLap.value, 10) : -1;
      if (typeof renderLeanThrottleMatrix === 'function') renderLeanThrottleMatrix(lapNum);
      if (dom.modalLeanThrottle) dom.modalLeanThrottle.style.display = 'flex';
    });
  }
  if (dom.btnCloseMatrix) {
    dom.btnCloseMatrix.addEventListener('click', () => {
      if (dom.modalLeanThrottle) dom.modalLeanThrottle.style.display = 'none';
    });
  }
  if (dom.selectMatrixLap) {
    dom.selectMatrixLap.addEventListener('change', (e) => {
      const lapNum = parseInt(e.target.value, 10);
      if (typeof renderLeanThrottleMatrix === 'function') renderLeanThrottleMatrix(lapNum);
    });
  }

  // MotoGP Buttons & Video Export
  if (dom.btnToggleMotoGP) {
    dom.btnToggleMotoGP.addEventListener('click', () => {
      state.motogp.showCard = !state.motogp.showCard;
      dom.btnToggleMotoGP.classList.toggle('active', state.motogp.showCard);
      if (dom.motogpLiveCard) dom.motogpLiveCard.style.display = state.motogp.showCard ? 'flex' : 'none';
      saveSettingsToStorage();
    });
  }

  if (dom.btnOpenVideoExport) {
    dom.btnOpenVideoExport.addEventListener('click', () => {
      syncMotoGPConfigToUI();
      if (dom.modalVideoExport) dom.modalVideoExport.style.display = 'flex';
      setTimeout(() => playIntroPreviewAnimation(), 150);
    });
  }
  if (dom.btnCloseVideoModal) {
    dom.btnCloseVideoModal.addEventListener('click', () => {
      if (dom.modalVideoExport) dom.modalVideoExport.style.display = 'none';
    });
  }

  // MotoGP Customizer Inputs
  if (dom.inputRiderName) {
    dom.inputRiderName.addEventListener('input', (e) => {
      state.motogp.riderName = e.target.value.toUpperCase();
      syncMotoGPConfigToUI();
      saveSettingsToStorage();
    });
  }
  if (dom.inputBikeName) {
    dom.inputBikeName.addEventListener('input', (e) => {
      state.motogp.bikeName = e.target.value;
      syncMotoGPConfigToUI();
      saveSettingsToStorage();
    });
  }
  if (dom.inputRiderNum) {
    dom.inputRiderNum.addEventListener('input', (e) => {
      state.motogp.riderNum = e.target.value;
      syncMotoGPConfigToUI();
      saveSettingsToStorage();
    });
  }
  if (dom.inputTyreFront) {
    dom.inputTyreFront.addEventListener('input', (e) => {
      state.motogp.tyreFront = e.target.value.toUpperCase();
      syncMotoGPConfigToUI();
      saveSettingsToStorage();
    });
  }
  if (dom.inputTyreRear) {
    dom.inputTyreRear.addEventListener('input', (e) => {
      state.motogp.tyreRear = e.target.value.toUpperCase();
      syncMotoGPConfigToUI();
      saveSettingsToStorage();
    });
  }
  if (dom.inputNumberColor) {
    dom.inputNumberColor.addEventListener('input', (e) => {
      state.motogp.badgeColor = e.target.value;
      syncMotoGPConfigToUI();
      saveSettingsToStorage();
    });
  }

  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      state.motogp.badgeColor = dot.dataset.c;
      if (dom.inputNumberColor) dom.inputNumberColor.value = dot.dataset.c;
      syncMotoGPConfigToUI();
      saveSettingsToStorage();
      playIntroPreviewAnimation();
    });
  });

  if (dom.inputVideoLeadInOut && dom.valVideoLeadInOut) {
    dom.inputVideoLeadInOut.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      dom.valVideoLeadInOut.textContent = `${val.toFixed(1)}s`;
    });
  }

  if (dom.btnPreviewIntro) {
    dom.btnPreviewIntro.addEventListener('click', playIntroPreviewAnimation);
  }
  if (dom.btnPreviewFastest) {
    dom.btnPreviewFastest.addEventListener('click', playFastestLapPreviewAnimation);
  }

  if (dom.btnRenderVideo) {
    dom.btnRenderVideo.addEventListener('click', exportOverlayVideo);
  }

  // Channel Toggle Buttons
  document.querySelectorAll('.channel-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ch = btn.dataset.channel;
      if (ch && state.channels[ch] !== undefined) {
        state.channels[ch] = !state.channels[ch];
        btn.classList.toggle('active', state.channels[ch]);
        btn.classList.toggle('channel-off', !state.channels[ch]);
        saveSettingsToStorage();
        renderCharts();
      }
    });
  });

  if (dom.selectSmoothing) {
    dom.selectSmoothing.addEventListener('change', (e) => {
      state.smoothingLevel = e.target.value;
      if (dom.prefSmoothing) dom.prefSmoothing.value = e.target.value;
      saveSettingsToStorage();
      applySmoothingToRecords();
    });
  }

  if (dom.btnGateSf) {
    dom.btnGateSf.addEventListener('click', () => {
      if (state.gateEditMode === 'sf') {
        cancelGateEdit();
      } else {
        state.gateEditMode = 'sf';
        dom.btnGateSf.classList.add('active');
        if (dom.btnGateSplit) dom.btnGateSplit.classList.remove('active');
        if (dom.gateToastMsg) dom.gateToastMsg.textContent = 'Click on track map to set Start / Finish Gate...';
        if (dom.gateInstructionToast) dom.gateInstructionToast.style.display = 'flex';
        const m = document.getElementById('map-container');
        if (m) m.style.cursor = 'crosshair';
      }
    });
  }

  if (dom.btnGateSplit) {
    dom.btnGateSplit.addEventListener('click', () => {
      if (state.gateEditMode === 'split') {
        cancelGateEdit();
      } else {
        state.gateEditMode = 'split';
        dom.btnGateSplit.classList.add('active');
        if (dom.btnGateSf) dom.btnGateSf.classList.remove('active');
        if (dom.gateToastMsg) dom.gateToastMsg.textContent = 'Click on track map to add a Sector Split Gate...';
        if (dom.gateInstructionToast) dom.gateInstructionToast.style.display = 'flex';
        const m = document.getElementById('map-container');
        if (m) m.style.cursor = 'crosshair';
      }
    });
  }

  if (dom.btnCancelGate) dom.btnCancelGate.addEventListener('click', cancelGateEdit);
  if (dom.btnSaveTrackGates) dom.btnSaveTrackGates.addEventListener('click', saveCurrentMapAsNewTrack);
  if (dom.btnAddCurrentTrack) dom.btnAddCurrentTrack.addEventListener('click', saveCurrentMapAsNewTrack);

  if (dom.btnGateReset) {
    dom.btnGateReset.addEventListener('click', () => {
      state.gates = [
        { id: 'sf', name: 'Start / Finish', type: 'sf', lat: 38.161580, lon: -122.454640, bearing: 310.0 },
        { id: 's1', name: 'Sector 1', type: 'split', lat: 38.164320, lon: -122.458900, bearing: 265.0 },
        { id: 's2', name: 'Sector 2', type: 'split', lat: 38.158210, lon: -122.457800, bearing: 180.0 }
      ];
      cancelGateEdit();
      recalculateLapsAndSectors();
      saveSettingsToStorage();
    });
  }

  if (dom.btnToggleCompare) dom.btnToggleCompare.addEventListener('click', toggleCompareMode);

  if (dom.selectLapA) {
    dom.selectLapA.addEventListener('change', (e) => {
      state.compareLapA = parseInt(e.target.value, 10);
      selectLap(state.compareLapA, false);
    });
  }

  if (dom.selectLapB) {
    dom.selectLapB.addEventListener('change', (e) => {
      state.compareLapB = parseInt(e.target.value, 10);
      renderCharts();
      updateUI();
    });
  }

  if (dom.selectMapLayer) {
    dom.selectMapLayer.addEventListener('change', (e) => {
      const selected = e.target.value;
      state.currentLayer = selected;
      if (dom.prefMapLayer) dom.prefMapLayer.value = selected;
      saveSettingsToStorage();
      Object.values(state.mapLayers).forEach(layer => state.map.removeLayer(layer));
      if (state.mapLayers[selected]) {
        state.mapLayers[selected].addTo(state.map);
      }
    });
  }

  if (dom.selectHeatmapColor) {
    dom.selectHeatmapColor.addEventListener('change', (e) => {
      state.heatmapMode = e.target.value;
      if (dom.prefHeatmap) dom.prefHeatmap.value = e.target.value;
      saveSettingsToStorage();
      renderMapTrack(false);
    });
  }

  if (dom.btnFollowBike) {
    dom.btnFollowBike.addEventListener('click', () => {
      state.followBike = !state.followBike;
      dom.btnFollowBike.classList.toggle('active', state.followBike);
      if (dom.prefFollowBike) dom.prefFollowBike.checked = state.followBike;
      saveSettingsToStorage();
    });
  }

  if (dom.btnFitBounds) {
    dom.btnFitBounds.addEventListener('click', () => {
      if (state.trackPolylineGroup && state.trackPolylineGroup.getLayers().length > 0) {
        state.map.fitBounds(state.trackPolylineGroup.getBounds(), { padding: [30, 30] });
      }
    });
  }

  if (dom.selectLapJump) {
    dom.selectLapJump.addEventListener('change', (e) => {
      selectLap(parseInt(e.target.value, 10), false);
    });
  }

  // Settings Modal & Tabs
  if (dom.btnOpenSettings) {
    dom.btnOpenSettings.addEventListener('click', () => {
      renderTrackLibrary();
      if (dom.modalSettings) dom.modalSettings.style.display = 'flex';
    });
  }
  if (dom.btnCloseSettings) {
    dom.btnCloseSettings.addEventListener('click', () => {
      if (dom.modalSettings) dom.modalSettings.style.display = 'none';
    });
  }

  document.querySelectorAll('.settings-tab-btn').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
      tabBtn.classList.add('active');
      const target = document.getElementById(tabBtn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  // Preferences Tab Event Listeners
  if (dom.prefSpeedUnit) {
    dom.prefSpeedUnit.addEventListener('change', (e) => {
      state.unitMph = e.target.value === 'mph';
      if (dom.lblUnitToggle) dom.lblUnitToggle.textContent = state.unitMph ? 'MPH' : 'KM/H';
      saveSettingsToStorage();
      updateUI();
      renderCharts();
      renderSpeedExtremaMarkers();
      renderLapListTable();
    });
  }
  if (dom.prefMapLayer) {
    dom.prefMapLayer.addEventListener('change', (e) => {
      if (dom.selectMapLayer) {
        dom.selectMapLayer.value = e.target.value;
        dom.selectMapLayer.dispatchEvent(new Event('change'));
      }
    });
  }
  if (dom.prefSmoothing) {
    dom.prefSmoothing.addEventListener('change', (e) => {
      if (dom.selectSmoothing) {
        dom.selectSmoothing.value = e.target.value;
        dom.selectSmoothing.dispatchEvent(new Event('change'));
      }
    });
  }
  if (dom.prefHeatmap) {
    dom.prefHeatmap.addEventListener('change', (e) => {
      if (dom.selectHeatmapColor) {
        dom.selectHeatmapColor.value = e.target.value;
        dom.selectHeatmapColor.dispatchEvent(new Event('change'));
      }
    });
  }
  if (dom.prefFollowBike) {
    dom.prefFollowBike.addEventListener('change', (e) => {
      state.followBike = e.target.checked;
      if (dom.btnFollowBike) dom.btnFollowBike.classList.toggle('active', state.followBike);
      saveSettingsToStorage();
    });
  }
  if (dom.prefShowExtrema) {
    dom.prefShowExtrema.addEventListener('change', (e) => {
      state.showSpeedExtrema = e.target.checked;
      if (dom.btnToggleExtrema) {
        dom.btnToggleExtrema.classList.toggle('active', state.showSpeedExtrema);
        dom.btnToggleExtrema.textContent = state.showSpeedExtrema ? '⚡ Speeds: ON' : '⚡ Speeds: OFF';
      }
      saveSettingsToStorage();
      renderSpeedExtremaMarkers();
    });
  }

  // Backup & Sync
  if (dom.btnExportSettings) dom.btnExportSettings.addEventListener('click', exportSettingsFile);
  if (dom.btnTriggerSettingsImport) dom.btnTriggerSettingsImport.addEventListener('click', () => dom.settingsFileInput.click());
  if (dom.settingsFileInput) {
    dom.settingsFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        importSettingsFile(e.target.files[0]);
      }
    });
  }
  if (dom.btnResetAllSettings) {
    dom.btnResetAllSettings.addEventListener('click', () => {
      if (confirm('Reset all settings, preferences, and track definitions to factory defaults?')) {
        localStorage.removeItem('dda_settings');
        initSettings();
        applySmoothingToRecords();
        alert('Settings reset to factory defaults.');
      }
    });
  }

  // File Uploads
  if (dom.btnLoadFile) dom.btnLoadFile.addEventListener('click', () => dom.fileInput.click());
  if (dom.fileInput) {
    dom.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        parseUploadedFile(e.target.files[0]);
      }
    });
  }

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (dom.dropOverlay) dom.dropOverlay.style.display = 'flex';
  });
  if (dom.dropOverlay) {
    dom.dropOverlay.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dom.dropOverlay.style.display = 'none';
    });
    dom.dropOverlay.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.dropOverlay.style.display = 'none';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        parseUploadedFile(e.dataTransfer.files[0]);
      }
    });
  }

  // Canvas Hover & Crosshair
  if (dom.telemetryCanvas && dom.telemetryCanvas.parentElement) {
    dom.telemetryCanvas.parentElement.addEventListener('mousemove', (e) => {
      if (!state.activeRecords || state.activeRecords.length === 0) return;
      const rect = dom.telemetryCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(canvasWidth, e.clientX - rect.left));
      const ratio = x / canvasWidth;

      const startIdx = Math.floor(state.zoomRange[0] * state.activeRecords.length);
      const endIdx = Math.max(startIdx + 10, Math.floor(state.zoomRange[1] * state.activeRecords.length));
      const hoverIdx = Math.floor(startIdx + ratio * (endIdx - startIdx));

      if (e.buttons === 1) {
        seekToIndex(hoverIdx);
      }

      showChartTooltip(hoverIdx, e.clientX - rect.left, e.clientY - rect.top);
    });

    dom.telemetryCanvas.parentElement.addEventListener('mouseleave', () => {
      if (dom.chartTooltip) dom.chartTooltip.style.display = 'none';
    });
  }

  if (dom.btnResetZoom) {
    dom.btnResetZoom.addEventListener('click', () => {
      state.zoomRange = [0, 1];
      renderCharts();
    });
  }

  if (dom.btnHelpShortcuts) dom.btnHelpShortcuts.addEventListener('click', () => dom.modalShortcuts.style.display = 'flex');
  if (dom.btnCloseModal) dom.btnCloseModal.addEventListener('click', () => dom.modalShortcuts.style.display = 'none');

  // Section Drag Selection & Comparison
  if (dom.btnSelectSection) {
    dom.btnSelectSection.addEventListener('click', () => {
      if (typeof toggleSectionSelectMode === 'function') toggleSectionSelectMode();
    });
  }
  if (dom.btnClearSection) {
    dom.btnClearSection.addEventListener('click', () => {
      if (typeof clearSectionSelection === 'function') clearSectionSelection();
    });
  }
  const btnClearDrawer = document.getElementById('btn-clear-section-drawer');
  if (btnClearDrawer) {
    btnClearDrawer.addEventListener('click', () => {
      if (typeof clearSectionSelection === 'function') clearSectionSelection();
    });
  }

  // Sync Mode Toggles (Time vs Distance)
  function setSyncMode(mode) {
    state.sectionSelection.syncMode = mode;
    if (dom.btnSyncTime) dom.btnSyncTime.classList.toggle('active', mode === 'time');
    if (dom.btnSyncDist) dom.btnSyncDist.classList.toggle('active', mode === 'dist');
    if (typeof renderCharts === 'function') renderCharts();
  }

  if (dom.btnSyncTime) {
    dom.btnSyncTime.addEventListener('click', () => setSyncMode('time'));
  }
  if (dom.btnSyncDist) {
    dom.btnSyncDist.addEventListener('click', () => setSyncMode('dist'));
  }

  // Layout Toggle
  if (dom.btnToggleLayout) {
    dom.btnToggleLayout.addEventListener('click', () => {
      if (typeof toggleWorkspaceLayout === 'function') toggleWorkspaceLayout();
    });
  }

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      seekToIndex(state.currentIndex - (e.shiftKey ? 50 : 1));
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      seekToIndex(state.currentIndex + (e.shiftKey ? 50 : 1));
    } else if (e.code === 'Home') {
      e.preventDefault();
      seekToIndex(0);
    } else if (e.code === 'End') {
      e.preventDefault();
      seekToIndex(state.activeRecords.length - 1);
    } else if (e.code === 'KeyC') {
      toggleCompareMode();
    } else if (e.code === 'KeyM') {
      if (dom.modalLeanThrottle) {
        const isVis = dom.modalLeanThrottle.style.display === 'flex';
        dom.modalLeanThrottle.style.display = isVis ? 'none' : 'flex';
        if (!isVis) {
          const lapNum = dom.selectMatrixLap ? parseInt(dom.selectMatrixLap.value, 10) : -1;
          if (typeof renderLeanThrottleMatrix === 'function') renderLeanThrottleMatrix(lapNum);
        }
      }
    } else if (e.code === 'KeyL') {
      if (typeof toggleWorkspaceLayout === 'function') toggleWorkspaceLayout();
    } else if (e.code === 'KeyS') {
      if (state.sectionSelection.active) {
        setSyncMode(state.sectionSelection.syncMode === 'time' ? 'dist' : 'time');
      }
    } else if (e.code === 'KeyU') {
      if (dom.btnToggleUnit) dom.btnToggleUnit.click();
    } else if (e.code === 'KeyF') {
      if (dom.btnFitBounds) dom.btnFitBounds.click();
    } else if (e.code === 'Escape') {
      if (dom.modalLeanThrottle) dom.modalLeanThrottle.style.display = 'none';
      if (dom.modalSettings) dom.modalSettings.style.display = 'none';
      if (dom.modalVideoExport) dom.modalVideoExport.style.display = 'none';
      if (dom.modalShortcuts) dom.modalShortcuts.style.display = 'none';
      if (state.sectionSelection.active || state.sectionSelection.isSelecting) {
        if (typeof clearSectionSelection === 'function') clearSectionSelection();
      }
      if (state.gateEditMode && typeof cancelGatePlacement === 'function') {
        cancelGatePlacement();
      }
    }
  });
}
