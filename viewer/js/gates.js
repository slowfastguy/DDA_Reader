/**
 * gates.js - Timing Gate Editor, Crossing Geometry, and Sector Analysis
 * Ducati DDA Telemetry & GPS Visualizer
 */

function renderTrackLibrary() {
  if (!dom.tracksListContainer) return;
  dom.tracksListContainer.innerHTML = '';

  const trackIds = Object.keys(state.tracks);
  if (trackIds.length === 0) {
    dom.tracksListContainer.innerHTML = '<p class="tab-desc">No tracks saved in library. Save your current gates using "Save Current Gates as Track"!</p>';
    return;
  }

  trackIds.forEach(id => {
    const trk = state.tracks[id];
    const card = document.createElement('div');
    card.className = 'track-item-card';

    const sfGate = (trk.gates || []).find(g => g.type === 'sf') || (trk.gates || [])[0];
    const splits = (trk.gates || []).filter(g => g.type === 'split');

    let chipsHtml = '';
    if (sfGate) {
      chipsHtml += `<span class="gate-chip gate-chip-sf">🏁 S/F: ${Math.round(sfGate.bearing || 0)}°</span>`;
    }
    splits.forEach((s, idx) => {
      chipsHtml += `<span class="gate-chip">⏱️ S${idx + 1}: ${Math.round(s.bearing || 0)}°</span>`;
    });

    card.innerHTML = `
      <div class="track-item-header">
        <div>
          <span class="track-item-title">${trk.name}</span>
          <span class="track-item-loc">(${trk.location || 'Circuit'})</span>
        </div>
        <span class="badge">${(trk.gates || []).length} Gates</span>
      </div>
      <div class="gate-chips-row">
        ${chipsHtml}
      </div>
      <div class="track-item-actions">
        <button class="btn-popup-action btn-apply-track">⚡ Apply to Session</button>
        <button class="btn-popup-action btn-update-track">💾 Overwrite with Map</button>
        <button class="btn-popup-action btn-rename-track">✏️ Rename</button>
        <button class="btn-popup-action btn-delete-track" style="color: #ff0055;">🗑️ Delete</button>
      </div>
    `;

    card.querySelector('.btn-apply-track').onclick = () => {
      state.gates = JSON.parse(JSON.stringify(trk.gates || []));
      dom.metaTrackName.textContent = trk.name;
      recalculateLapsAndSectors();
      renderMapGates();
      dom.modalSettings.style.display = 'none';
    };

    card.querySelector('.btn-update-track').onclick = () => {
      if (confirm(`Overwrite "${trk.name}" gates with current map gates?`)) {
        trk.gates = JSON.parse(JSON.stringify(state.gates));
        saveSettingsToStorage();
        renderTrackLibrary();
      }
    };

    card.querySelector('.btn-rename-track').onclick = () => {
      const newName = prompt('Enter new track name:', trk.name);
      if (newName && newName.trim()) {
        trk.name = newName.trim();
        saveSettingsToStorage();
        renderTrackLibrary();
      }
    };

    card.querySelector('.btn-delete-track').onclick = () => {
      if (confirm(`Delete "${trk.name}" from Track Library?`)) {
        delete state.tracks[id];
        saveSettingsToStorage();
        renderTrackLibrary();
      }
    };

    dom.tracksListContainer.appendChild(card);
  });
}

function autoDetectTrackFromGps() {
  if (!state.records || state.records.length === 0) return;
  const valid = state.records.filter(r => r.gps_lat !== null && r.gps_lon !== null).slice(0, 50);
  if (valid.length === 0) return;

  const avgLat = valid.reduce((acc, r) => acc + r.gps_lat, 0) / valid.length;
  const avgLon = valid.reduce((acc, r) => acc + r.gps_lon, 0) / valid.length;

  for (const id in state.tracks) {
    const trk = state.tracks[id];
    if (trk.center_lat && trk.center_lon) {
      const d = haversineDistanceM(trk.center_lat, trk.center_lon, avgLat, avgLon);
      const rad = trk.radius_m || 3500;
      if (d <= rad) {
        state.gates = JSON.parse(JSON.stringify(trk.gates));
        dom.metaTrackName.textContent = trk.name;
        console.log(`[+] Auto-matched track: ${trk.name} (${d.toFixed(0)}m from center)`);
        return true;
      }
    }
  }
  return false;
}

function saveCurrentMapAsNewTrack() {
  if (!state.gates || state.gates.length === 0) {
    alert('No gates currently placed on map.');
    return;
  }

  const defaultName = dom.metaTrackName.textContent || 'Custom Track';
  const name = prompt('Enter Track Name:', defaultName);
  if (!name || !name.trim()) return;

  const loc = prompt('Enter Track Location / Notes:', 'USA') || '';
  const trackId = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

  const sf = state.gates.find(g => g.type === 'sf') || state.gates[0];
  state.tracks[trackId] = {
    id: trackId,
    name: name.trim(),
    location: loc.trim(),
    center_lat: sf.lat,
    center_lon: sf.lon,
    radius_m: 3500,
    gates: JSON.parse(JSON.stringify(state.gates))
  };

  saveSettingsToStorage();
  renderTrackLibrary();
  alert(`Track "${name.trim()}" saved to library with ${state.gates.length} gates!`);
}

function renderMapGates() {
  if (!state.gatesLayerGroup) return;
  state.gatesLayerGroup.clearLayers();
  if (!state.gates || state.gates.length === 0) return;

  state.gates.forEach((gate, gIdx) => {
    const isSF = gate.type === 'sf';
    const badgeClass = isSF ? 'gate-badge-sf' : (gIdx === 1 ? 'gate-badge-s1' : (gIdx === 2 ? 'gate-badge-s2' : 'gate-badge-s3'));
    const gateLabel = isSF ? '🏁 S/F' : (gate.name || `S${gIdx}`);

    const brg = gate.bearing !== undefined ? gate.bearing : 0;
    const arrowTransform = `transform: rotate(${brg}deg);`;

    const gateIcon = L.divIcon({
      className: 'bike-marker-icon',
      html: `
        <div class="gate-label-badge ${badgeClass}" title="Click to rotate or configure gate">
          <span>${gateLabel}</span>
          <svg viewBox="0 0 24 24" width="12" height="12" style="${arrowTransform}">
            <path d="M12 2 L19 14 L13 14 L13 22 L11 22 L11 14 L5 14 Z" fill="currentColor"/>
          </svg>
        </div>`,
      iconSize: [52, 22],
      iconAnchor: [26, 11]
    });

    const marker = L.marker([gate.lat, gate.lon], {
      icon: gateIcon,
      draggable: true,
      zIndexOffset: 800
    });

    const popupContent = document.createElement('div');
    popupContent.className = 'gate-popup-card';
    popupContent.innerHTML = `
      <div class="gate-popup-header">
        <strong class="gate-popup-title">${isSF ? '🏁 Start / Finish Gate' : `⏱️ ${gate.name || 'Sector Split'}`}</strong>
        <span class="gate-heading-text">${Math.round(brg)}°</span>
      </div>
      <div class="gate-popup-buttons">
        <button class="btn-popup-action btn-rotate-flip">🔄 Flip 180°</button>
        <button class="btn-popup-action btn-rotate-left">⟲ -10°</button>
        <button class="btn-popup-action btn-rotate-right">⟳ +10°</button>
        <button class="btn-popup-action btn-snap-tangent">📐 Auto-Align</button>
        ${!isSF ? '<button class="btn-popup-action btn-popup-danger btn-delete-gate">🗑️ Delete Split</button>' : ''}
      </div>
    `;

    popupContent.querySelector('.btn-rotate-flip').onclick = () => {
      gate.bearing = (gate.bearing + 180) % 360;
      recalculateLapsAndSectors();
      saveSettingsToStorage();
    };
    popupContent.querySelector('.btn-rotate-left').onclick = () => {
      gate.bearing = (gate.bearing - 10 + 360) % 360;
      recalculateLapsAndSectors();
      saveSettingsToStorage();
    };
    popupContent.querySelector('.btn-rotate-right').onclick = () => {
      gate.bearing = (gate.bearing + 10) % 360;
      recalculateLapsAndSectors();
      saveSettingsToStorage();
    };
    popupContent.querySelector('.btn-snap-tangent').onclick = () => {
      const closest = findClosestTrackPoint(gate.lat, gate.lon);
      if (closest && closest.tangentBearing !== undefined) {
        gate.bearing = closest.tangentBearing;
        recalculateLapsAndSectors();
        saveSettingsToStorage();
      }
    };
    if (!isSF) {
      popupContent.querySelector('.btn-delete-gate').onclick = () => {
        state.gates = state.gates.filter(g => g !== gate);
        recalculateLapsAndSectors();
        saveSettingsToStorage();
      };
    }

    marker.bindPopup(popupContent);

    marker.on('dragend', (e) => {
      const newPos = e.target.getLatLng();
      const closest = findClosestTrackPoint(newPos.lat, newPos.lng);
      if (closest) {
        gate.lat = closest.record.gps_lat;
        gate.lon = closest.record.gps_lon;
        if (closest.tangentBearing !== undefined) {
          gate.bearing = closest.tangentBearing;
        }
        marker.setLatLng([gate.lat, gate.lon]);
      } else {
        gate.lat = newPos.lat;
        gate.lon = newPos.lng;
      }
      recalculateLapsAndSectors();
      saveSettingsToStorage();
    });

    const perpBrg1 = (brg + 90) % 360;
    const perpBrg2 = (brg - 90 + 360) % 360;
    const p1 = moveCoordinate(gate.lat, gate.lon, perpBrg1, 16);
    const p2 = moveCoordinate(gate.lat, gate.lon, perpBrg2, 16);

    const gateLine = L.polyline([[p1.lat, p1.lon], [p2.lat, p2.lon]], {
      color: isSF ? '#ffffff' : (gIdx === 1 ? '#00e5ff' : '#ffd600'),
      weight: 3.5,
      dashArray: isSF ? '4, 4' : null,
      opacity: 0.95
    });

    const pFwd = moveCoordinate(gate.lat, gate.lon, brg, 10);
    const dirVector = L.polyline([[gate.lat, gate.lon], [pFwd.lat, pFwd.lon]], {
      color: isSF ? '#ff0033' : '#00e676',
      weight: 2.5,
      opacity: 0.9
    });

    state.gatesLayerGroup.addLayer(marker);
    state.gatesLayerGroup.addLayer(gateLine);
    state.gatesLayerGroup.addLayer(dirVector);
  });
}

function handleGateMapClick(latlng) {
  const closest = findClosestTrackPoint(latlng.lat, latlng.lng);
  if (!closest) return;

  const brg = closest.tangentBearing !== undefined ? closest.tangentBearing : 0;

  if (state.gateEditMode === 'sf') {
    let sfGate = state.gates.find(g => g.type === 'sf');
    if (!sfGate) {
      sfGate = { id: 'sf', name: 'Start / Finish', type: 'sf', lat: closest.record.gps_lat, lon: closest.record.gps_lon, bearing: brg };
      state.gates.unshift(sfGate);
    } else {
      sfGate.lat = closest.record.gps_lat;
      sfGate.lon = closest.record.gps_lon;
      sfGate.bearing = brg;
    }
  } else if (state.gateEditMode === 'split') {
    const splitCount = state.gates.filter(g => g.type === 'split').length;
    const newSplit = {
      id: `s${splitCount + 1}`,
      name: `Sector ${splitCount + 1}`,
      type: 'split',
      lat: closest.record.gps_lat,
      lon: closest.record.gps_lon,
      bearing: brg
    };
    state.gates.push(newSplit);
  }

  cancelGateEdit();
  recalculateLapsAndSectors();
  saveSettingsToStorage();
}

function cancelGateEdit() {
  state.gateEditMode = null;
  if (dom.btnGateSf) dom.btnGateSf.classList.remove('active');
  if (dom.btnGateSplit) dom.btnGateSplit.classList.remove('active');
  if (dom.gateInstructionToast) dom.gateInstructionToast.style.display = 'none';
  const m = document.getElementById('map-container');
  if (m) m.style.cursor = '';
}

function findGateCrossings(gate, records, minIntervalS = 35.0) {
  const crossings = [];
  if (!records || records.length < 2) return crossings;

  // Gate line perpendicular to bearing with width 60m (30m left and 30m right across track)
  const perp1 = (gate.bearing + 90) % 360;
  const perp2 = (gate.bearing - 90 + 360) % 360;
  const gA = moveCoordinate(gate.lat, gate.lon, perp1, 30);
  const gB = moveCoordinate(gate.lat, gate.lon, perp2, 30);

  const xg1 = gA.lon, yg1 = gA.lat;
  const xg2 = gB.lon, yg2 = gB.lat;
  const dxg = xg2 - xg1, dyg = yg2 - yg1;

  let lastT = -999.0;

  for (let i = 0; i < records.length - 1; i++) {
    const r1 = records[i];
    const r2 = records[i + 1];
    if (r1.gps_lat === null || r2.gps_lat === null) continue;
    if (r1.time_s - lastT < minIntervalS) continue;

    const xb1 = r1.gps_lon, yb1 = r1.gps_lat;
    const xb2 = r2.gps_lon, yb2 = r2.gps_lat;
    const dxb = xb2 - xb1, dyb = yb2 - yb1;

    const det = dxb * dyg - dyb * dxg;
    let crossed = false;
    let exactTime = r1.time_s;
    let exactDist = r1.distance_m || 0;
    let crossIndex = i;

    if (Math.abs(det) > 1e-12) {
      const ub = ((xg1 - xb1) * dyg - (yg1 - yb1) * dxg) / det;
      const ug = ((xg1 - xb1) * dyb - (yg1 - yb1) * dxb) / det;

      // Check if motorcycle trajectory segment intersects gate line
      if (ub >= 0.0 && ub <= 1.0 && ug >= -0.5 && ug <= 1.5) {
        const bikeBrg = calculateBearing(yb1, xb1, yb2, xb2);
        let dBrg = Math.abs(gate.bearing - bikeBrg) % 360;
        if (dBrg > 180) dBrg = 360 - dBrg;
        if (dBrg < 85.0) {
          crossed = true;
          exactTime = r1.time_s + ub * (r2.time_s - r1.time_s);
          exactDist = (r1.distance_m || 0) + ub * ((r2.distance_m || 0) - (r1.distance_m || 0));
          crossIndex = ub < 0.5 ? i : i + 1;
        }
      }
    }

    if (crossed) {
      crossings.push({
        index: crossIndex,
        record: records[crossIndex],
        time_s: exactTime,
        distance_m: exactDist
      });
      lastT = exactTime;
    }
  }

  // Fallback: If no pure geometric intersection found, find local minimum distance points
  if (crossings.length === 0) {
    let lastFallbackT = -999.0;
    for (let i = 1; i < records.length - 1; i++) {
      const rPrev = records[i - 1];
      const rCur = records[i];
      const rNext = records[i + 1];
      if (rCur.gps_lat === null || rPrev.gps_lat === null || rNext.gps_lat === null) continue;
      if (rCur.time_s - lastFallbackT < minIntervalS) continue;

      const dPrev = haversineDistanceM(gate.lat, gate.lon, rPrev.gps_lat, rPrev.gps_lon);
      const dCur = haversineDistanceM(gate.lat, gate.lon, rCur.gps_lat, rCur.gps_lon);
      const dNext = haversineDistanceM(gate.lat, gate.lon, rNext.gps_lat, rNext.gps_lon);

      if (dCur < 45.0 && dCur <= dPrev && dCur <= dNext) {
        const bikeBrg = calculateBearing(rPrev.gps_lat, rPrev.gps_lon, rNext.gps_lat, rNext.gps_lon);
        let dBrg = Math.abs(gate.bearing - bikeBrg) % 360;
        if (dBrg > 180) dBrg = 360 - dBrg;
        if (dBrg < 80.0) {
          crossings.push({
            index: i,
            record: rCur,
            time_s: rCur.time_s,
            distance_m: rCur.distance_m || 0
          });
          lastFallbackT = rCur.time_s;
        }
      }
    }
  }

  return crossings;
}

function recalculateLapsAndSectors() {
  const sfGate = state.gates.find(g => g.type === 'sf');
  if (!sfGate) return;

  const splitGates = state.gates.filter(g => g.type === 'split');
  const crossings = findGateCrossings(sfGate, state.records, 40.0);

  if (crossings.length === 0) {
    renderMapGates();
    return;
  }

  const newLaps = [];
  // Out Lap
  newLaps.push({
    lap_number: 0,
    name: 'Out-Lap',
    start_time_s: state.records[0].time_s,
    end_time_s: crossings[0].time_s,
    duration_s: crossings[0].time_s - state.records[0].time_s,
    start_index: 0,
    end_index: crossings[0].index,
    distance_m: crossings[0].distance_m,
    sectors: [null, null, null],
    is_best: false
  });

  // Timed Laps
  for (let i = 0; i < crossings.length - 1; i++) {
    const c1 = crossings[i];
    const c2 = crossings[i + 1];
    const lapNum = i + 1;
    const dur = c2.time_s - c1.time_s;
    const dist = c2.distance_m - c1.distance_m;

    const lapRecs = state.records.slice(c1.index, c2.index + 1);
    const sectors = [];
    const maxLapSpeed = lapRecs.reduce((max, r) => (r.speed_kmh || 0) > max ? (r.speed_kmh || 0) : max, 0);

    if (splitGates.length > 0) {
      let splitCrossings = [];
      splitGates.forEach(sg => {
        const scList = findGateCrossings(sg, lapRecs, 5.0);
        if (scList.length > 0) {
          splitCrossings.push({ time_s: scList[0].time_s });
        } else {
          // Fallback closest point
          let closestPt = null;
          let minD = 999;
          for (const lr of lapRecs) {
            if (lr.gps_lat !== null) {
              const d = haversineDistanceM(sg.lat, sg.lon, lr.gps_lat, lr.gps_lon);
              if (d < 45.0 && d < minD) {
                minD = d;
                closestPt = lr;
              }
            }
          }
          if (closestPt) {
            splitCrossings.push({ time_s: closestPt.time_s });
          }
        }
      });

      splitCrossings.sort((a, b) => a.time_s - b.time_s);

      let prevT = c1.time_s;
      splitCrossings.forEach(sc => {
        const sDur = sc.time_s - prevT;
        sectors.push(sDur > 3.0 ? sDur : null);
        prevT = sc.time_s;
      });
      const lastDur = c2.time_s - prevT;
      sectors.push(lastDur > 3.0 ? lastDur : null);
    } else {
      sectors.push(dur * 0.28, dur * 0.38, dur * 0.34);
    }

    while (sectors.length < 3) {
      sectors.push(dur / 3.0);
    }

    newLaps.push({
      lap_number: lapNum,
      name: `Lap ${lapNum}`,
      start_time_s: c1.time_s,
      end_time_s: c2.time_s,
      duration_s: dur,
      start_index: c1.index,
      end_index: c2.index,
      distance_m: dist,
      sectors: sectors,
      max_speed_kmh: maxLapSpeed,
      is_best: false
    });
  }

  // In Lap
  const lastCross = crossings[crossings.length - 1];
  const inLapRecs = state.records.slice(lastCross.index);
  const maxInLapSpeed = inLapRecs.reduce((max, r) => (r.speed_kmh || 0) > max ? (r.speed_kmh || 0) : max, 0);
  newLaps.push({
    lap_number: crossings.length,
    name: `Lap ${crossings.length} (In-Lap)`,
    start_time_s: lastCross.time_s,
    end_time_s: state.records[state.records.length - 1].time_s,
    duration_s: state.records[state.records.length - 1].time_s - lastCross.time_s,
    start_index: lastCross.index,
    end_index: state.records.length - 1,
    distance_m: state.records[state.records.length - 1].distance_m - lastCross.distance_m,
    sectors: [null, null, null],
    max_speed_kmh: maxInLapSpeed,
    is_best: false
  });

  const validLaps = newLaps.filter(l => l.lap_number >= 1 && l.lap_number < crossings.length && l.duration_s > 60.0 && l.duration_s < 250.0);
  if (validLaps.length > 0) {
    const best = validLaps.reduce((min, l) => l.duration_s < min.duration_s ? l : min, validLaps[0]);
    best.is_best = true;
    if (dom.dataBestLapBadge) dom.dataBestLapBadge.textContent = `🏆 Best: ${formatTime(best.duration_s)}`;

    state.bestSectors = [null, null, null];
    for (let sIdx = 0; sIdx < 3; sIdx++) {
      const sTimes = validLaps.map(l => l.sectors && l.sectors[sIdx]).filter(t => t !== null && t > 3.0);
      if (sTimes.length > 0) {
        state.bestSectors[sIdx] = Math.min(...sTimes);
      }
    }

    const optTime = state.bestSectors.reduce((acc, s) => (acc !== null && s !== null) ? acc + s : null, 0);
    if (optTime && optTime > 30.0 && dom.dataOptLapBadge) {
      dom.dataOptLapBadge.textContent = `⚡ Opt: ${formatTime(optTime)}`;
      dom.dataOptLapBadge.style.display = 'inline-block';
    }
  }

  state.laps = newLaps;
  if (typeof renderLapListTable === 'function') renderLapListTable();
  renderMapGates();
  if (typeof selectLap === 'function') selectLap(state.selectedLapNum, false);
}
