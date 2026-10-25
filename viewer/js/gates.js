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
    const turns = trk.turns || [];

    let chipsHtml = '';
    if (sfGate) {
      chipsHtml += `<span class="gate-chip gate-chip-sf">🏁 S/F: ${Math.round(sfGate.bearing || 0)}°</span>`;
    }
    splits.forEach((s, idx) => {
      chipsHtml += `<span class="gate-chip">⏱️ S${idx + 1}: ${Math.round(s.bearing || 0)}°</span>`;
    });
    if (turns.length > 0) {
      chipsHtml += `<span class="gate-chip gate-chip-turns">📍 ${turns.length} Turn Apexes</span>`;
    }

    let turnsListHtml = '';
    if (turns.length > 0) {
      turnsListHtml = `
        <div class="track-turns-drawer" id="drawer-turns-${id}" style="display: none;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
            <div style="font-size: 11px; font-weight: 700; color: var(--text-dim);">Corner Apex Coordinates (${turns.length} Turns):</div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="btn-tool-sm btn-drawer-add-turn" title="Add a new turn to this track">+ Add Turn</button>
              <button class="btn-tool-sm btn-drawer-sort-turns" title="Auto-sort all turns sequentially along the track from S/F line">📐 Sort by Track</button>
              <button class="btn-tool-sm btn-drawer-renumber-turns" title="Renumber turns sequentially (T1, T2, T3...)">🔢 Renumber</button>
              <button class="btn-tool-sm btn-drawer-redetect-turns" title="Re-detect turns from loaded session">⚡ Auto-Detect</button>
            </div>
          </div>
          <div class="track-turns-grid">
            ${turns.map((t, tIdx) => {
              const isL = (t.direction || '').toLowerCase().includes('left');
              const cleanNum = (t.number !== undefined ? t.number : (tIdx + 1)).toString().replace(/^T/i, '');
              return `
                <div class="turn-mini-pill ${isL ? 'turn-pill-left' : 'turn-pill-right'}" data-turn-idx="${tIdx}" title="${escapeHTML(t.name)} (Click to seek)">
                  <strong style="cursor: pointer;" class="pill-turn-label">T${cleanNum} ${isL ? '↰' : '↱'}</strong>
                  <span style="opacity: 0.9; cursor: pointer;" class="pill-turn-name">${escapeHTML(t.name)}</span>
                  <div class="turn-mini-actions">
                    <button class="btn-pill-action btn-pill-action-edit btn-edit-mini-num" data-turn-idx="${tIdx}" title="Edit Turn Number / Label (e.g. 3A, 5)">🏷️</button>
                    <button class="btn-pill-action btn-move-mini-up" data-turn-idx="${tIdx}" title="Move earlier in order">▲</button>
                    <button class="btn-pill-action btn-move-mini-down" data-turn-idx="${tIdx}" title="Move later in order">▼</button>
                    <button class="btn-pill-action btn-pill-action-del btn-del-mini-turn" data-turn-idx="${tIdx}" title="Delete turn">&times;</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="track-item-header">
        <div>
          <span class="track-item-title">${escapeHTML(trk.name)}</span>
          <span class="track-item-loc">(${escapeHTML(trk.location || 'Circuit')})</span>
        </div>
        <div class="track-badges-wrap">
          <span class="badge">${(trk.gates || []).length} Gates</span>
          <span class="badge ${turns.length > 0 ? 'badge-cyan' : 'badge-muted'}">${turns.length} Turns</span>
        </div>
      </div>
      <div class="gate-chips-row">
        ${chipsHtml}
      </div>
      ${turnsListHtml}
      <div class="track-item-actions">
        <button class="btn-popup-action btn-apply-track">⚡ Apply to Session</button>
        ${turns.length > 0 ? `<button class="btn-popup-action btn-toggle-turns">📍 View Turns</button>` : `<button class="btn-popup-action btn-gen-turns">📍 Detect Turns from Session</button>`}
        <button class="btn-popup-action btn-update-track">💾 Overwrite Gates</button>
        <button class="btn-popup-action btn-rename-track">✏️ Rename</button>
        <button class="btn-popup-action btn-delete-track" style="color: #ff0055;">🗑️ Delete</button>
      </div>
    `;

    card.querySelector('.btn-apply-track').onclick = () => {
      state.gates = JSON.parse(JSON.stringify(trk.gates || []));
      dom.metaTrackName.textContent = trk.name;
      recalculateLapsAndSectors();
      renderMapGates();
      if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
      dom.modalSettings.style.display = 'none';
    };

    const btnToggleTurns = card.querySelector('.btn-toggle-turns');
    if (btnToggleTurns) {
      btnToggleTurns.onclick = () => {
        const drawer = card.querySelector(`#drawer-turns-${id}`);
        if (drawer) {
          const isOpen = drawer.style.display !== 'none';
          drawer.style.display = isOpen ? 'none' : 'block';
          btnToggleTurns.textContent = isOpen ? '📍 View Turns' : '📍 Hide Turns';
        }
      };
    }

    const drawer = card.querySelector(`#drawer-turns-${id}`);
    if (drawer) {
      // Pill click to seek on map
      drawer.querySelectorAll('.turn-mini-pill').forEach(pill => {
        const idx = parseInt(pill.getAttribute('data-turn-idx'), 10);
        const t = trk.turns[idx];
        if (t) {
          pill.querySelector('.pill-turn-label')?.addEventListener('click', () => {
            state.highlightedTurnId = t.id;
            const pt = typeof findClosestTrackPoint === 'function' ? findClosestTrackPoint(t.lat, t.lon) : null;
            if (pt && typeof seekToIndex === 'function') seekToIndex(pt.orig_index);
            if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
          });
          pill.querySelector('.pill-turn-name')?.addEventListener('click', () => {
            state.highlightedTurnId = t.id;
            const pt = typeof findClosestTrackPoint === 'function' ? findClosestTrackPoint(t.lat, t.lon) : null;
            if (pt && typeof seekToIndex === 'function') seekToIndex(pt.orig_index);
            if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
          });
        }
      });

      // Edit turn number/label
      drawer.querySelectorAll('.btn-edit-mini-num').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-turn-idx'), 10);
          const t = trk.turns[idx];
          if (!t) return;
          const curNum = (t.number !== undefined ? t.number : (idx + 1)).toString().replace(/^T/i, '');
          const newNum = prompt(`Enter Turn Label / Number for "${t.name}" (e.g. 1, 2, 3A, 5, 8A):`, curNum);
          if (newNum && newNum.trim()) {
            const clean = newNum.trim().replace(/^T/i, '');
            t.number = clean;
            if (t.name.match(/^Turn \d+[A-Z]?$/i) || !t.name) {
              t.name = `Turn ${clean}`;
            }
            t.id = `t_${clean.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
            saveSettingsToStorage();
            renderTrackLibrary();
            if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
          }
        };
      });

      // Move turn earlier
      drawer.querySelectorAll('.btn-move-mini-up').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-turn-idx'), 10);
          if (idx > 0) {
            const temp = trk.turns[idx - 1];
            trk.turns[idx - 1] = trk.turns[idx];
            trk.turns[idx] = temp;
            saveSettingsToStorage();
            renderTrackLibrary();
            if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
          }
        };
      });

      // Move turn later
      drawer.querySelectorAll('.btn-move-mini-down').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-turn-idx'), 10);
          if (idx < trk.turns.length - 1) {
            const temp = trk.turns[idx + 1];
            trk.turns[idx + 1] = trk.turns[idx];
            trk.turns[idx] = temp;
            saveSettingsToStorage();
            renderTrackLibrary();
            if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
          }
        };
      });

      // Delete turn
      drawer.querySelectorAll('.btn-del-mini-turn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-turn-idx'), 10);
          const t = trk.turns[idx];
          if (t && confirm(`Delete Turn ${t.number} (${t.name}) from "${trk.name}"?`)) {
            trk.turns.splice(idx, 1);
            saveSettingsToStorage();
            renderTrackLibrary();
            if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
          }
        };
      });

      // Sort by track distance
      const btnSortTurns = drawer.querySelector('.btn-drawer-sort-turns');
      if (btnSortTurns) {
        btnSortTurns.onclick = () => {
          sortTrackTurnsByCircuitDistance(trk);
          saveSettingsToStorage();
          renderTrackLibrary();
          if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
          alert(`Auto-sorted all ${trk.turns.length} turns in order along the track!`);
        };
      }

      // Renumber sequentially
      const btnRenumberTurns = drawer.querySelector('.btn-drawer-renumber-turns');
      if (btnRenumberTurns) {
        btnRenumberTurns.onclick = () => {
          if (confirm(`Renumber all turns sequentially (T1, T2, T3...)?`)) {
            renumberTrackTurnsSequentially(trk);
            saveSettingsToStorage();
            renderTrackLibrary();
            if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
          }
        };
      }

      const btnDrawerAdd = drawer.querySelector('.btn-drawer-add-turn');
      if (btnDrawerAdd) {
        btnDrawerAdd.onclick = () => {
          dom.modalSettings.style.display = 'none';
          enterTurnEditMode();
        };
      }

      const btnDrawerDetect = drawer.querySelector('.btn-drawer-redetect-turns');
      if (btnDrawerDetect) {
        btnDrawerDetect.onclick = () => {
          if (!state.records || state.records.length < 50) {
            alert('Load telemetry data first to detect turn apexes.');
            return;
          }
          const flyingLap = state.laps && state.laps.find(l => l.lap_number >= 1 && !l.is_optimal && l.duration_s > 30);
          const recs = flyingLap
            ? state.records.slice(flyingLap.start_index, flyingLap.end_index + 1)
            : state.records;
          const detected = typeof analyzeLapCorners === 'function' ? analyzeLapCorners(recs, null, flyingLap ? flyingLap.lap_number : 1) : [];
          if (!detected || detected.length === 0) {
            alert('No distinct turn apexes could be detected from telemetry.');
            return;
          }
          trk.turns = detected.map((d, dIdx) => ({
            id: `t${dIdx + 1}`,
            number: dIdx + 1,
            name: `Turn ${dIdx + 1}`,
            direction: d.isLeft ? 'left' : 'right',
            lat: d.lat,
            lon: d.lon,
            radius_m: 45,
            bearing: 0,
            description: 'Auto-detected from session'
          }));
          sortTrackTurnsByCircuitDistance(trk);
          saveSettingsToStorage();
          renderTrackLibrary();
          if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
          alert(`Generated ${trk.turns.length} turn apexes for "${trk.name}"!`);
        };
      }
    }

    const btnGenTurns = card.querySelector('.btn-gen-turns');
    if (btnGenTurns) {
      btnGenTurns.onclick = () => {
        if (!state.records || state.records.length < 50) {
          alert('Load telemetry data into visualizer first to detect turn apexes.');
          return;
        }
        const flyingLap = state.laps && state.laps.find(l => l.lap_number >= 1 && !l.is_optimal && l.duration_s > 30);
        const recs = flyingLap
          ? state.records.slice(flyingLap.start_index, flyingLap.end_index + 1)
          : state.records;
        const detected = typeof analyzeLapCorners === 'function' ? analyzeLapCorners(recs, null, flyingLap ? flyingLap.lap_number : 1) : [];
        if (!detected || detected.length === 0) {
          alert('No distinct turn apexes could be detected from telemetry.');
          return;
        }
        trk.turns = detected.map((d, dIdx) => ({
          id: `t${dIdx + 1}`,
          number: dIdx + 1,
          name: `Turn ${dIdx + 1}`,
          direction: d.isLeft ? 'left' : 'right',
          lat: d.lat,
          lon: d.lon,
          radius_m: 45,
          bearing: 0,
          description: 'Auto-detected from session telemetry'
        }));
        saveSettingsToStorage();
        renderTrackLibrary();
        if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
        alert(`Successfully generated and saved ${trk.turns.length} turn apexes for "${trk.name}"!`);
      };
    }

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

  // Also render Saved Reference Laps section if any exist in state.referenceLaps
  if (Array.isArray(state.referenceLaps) && state.referenceLaps.length > 0) {
    const refSection = document.createElement('div');
    refSection.className = 'track-card';
    refSection.style.borderColor = 'rgba(255, 214, 0, 0.35)';
    refSection.innerHTML = `
      <div class="track-card-top">
        <div class="track-card-info">
          <h4 style="color:#ffd600;">⭐ Saved Reference Laps Library (${state.referenceLaps.length})</h4>
          <p>Attach a saved benchmark lap directly into your active telemetry session or export as a shareable .ddalap.json file.</p>
        </div>
      </div>
      <div class="turn-chips-grid" style="margin-top:8px;">
        ${state.referenceLaps.map((ref, rIdx) => `
          <div class="turn-chip" style="border-color:rgba(255,214,0,0.4); display:flex; align-items:center; gap:6px;">
            <strong style="color:#ffd600;">⭐ ${escapeHTML(ref.name || 'Ref Lap')}</strong>
            <span class="text-muted">(${escapeHTML(ref.track_name || 'Track')} · ${formatTime(ref.duration_s || 0)})</span>
            <button type="button" class="btn-xs btn-load-saved-ref" data-ridx="${rIdx}" style="background:#262010; color:#ffd600; border:1px solid #ffd600;">⚡ Load into Session</button>
            <button type="button" class="btn-xs btn-export-saved-ref" data-ridx="${rIdx}">💾 .ddalap</button>
            <button type="button" class="btn-xs btn-del-saved-ref text-danger" data-ridx="${rIdx}">✕</button>
          </div>
        `).join('')}
      </div>
    `;
    refSection.querySelectorAll('.btn-load-saved-ref').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.ridx, 10);
        const ref = state.referenceLaps[idx];
        if (ref && typeof appendReferenceLapToSession === 'function') {
          appendReferenceLapToSession(ref);
          if (dom.modalSettings) dom.modalSettings.style.display = 'none';
        }
      };
    });
    refSection.querySelectorAll('.btn-export-saved-ref').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.ridx, 10);
        const ref = state.referenceLaps[idx];
        if (ref && typeof downloadReferenceLapFile === 'function') {
          downloadReferenceLapFile(ref);
        }
      };
    });
    refSection.querySelectorAll('.btn-del-saved-ref').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.ridx, 10);
        const ref = state.referenceLaps[idx];
        if (ref && confirm(`Delete Reference Lap "${ref.name}" from browser library?`)) {
          state.referenceLaps.splice(idx, 1);
          saveSettingsToStorage();
          renderTrackLibrary();
        }
      };
    });
    dom.tracksListContainer.appendChild(refSection);
  }
}

function autoDetectTrackFromGps() {
  if (!state.records || state.records.length === 0) return false;
  const valid = state.records.filter(r => r.gps_lat !== null && r.gps_lon !== null && Math.abs(r.gps_lat) > 1.0);
  if (valid.length === 0) return false;

  // Subsample up to 200 points distributed evenly across entire session
  const step = Math.max(1, Math.floor(valid.length / 200));
  let latSum = 0, lonSum = 0, count = 0;
  for (let i = 0; i < valid.length; i += step) {
    latSum += valid[i].gps_lat;
    lonSum += valid[i].gps_lon;
    count++;
  }
  const avgLat = latSum / count;
  const avgLon = lonSum / count;

  for (const id in state.tracks) {
    const trk = state.tracks[id];
    if (trk.center_lat && trk.center_lon) {
      const d = haversineDistanceM(trk.center_lat, trk.center_lon, avgLat, avgLon);
      const rad = trk.radius_m || 3500;
      if (d <= rad) {
        state.gates = JSON.parse(JSON.stringify(trk.gates));
        dom.metaTrackName.textContent = trk.name;
        console.log(`[+] Auto-matched track: ${trk.name} (${d.toFixed(0)}m from center) with ${(trk.turns || []).length} turns`);
        if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
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

  // Auto-generate turn apexes if telemetry exists
  let autoTurns = [];
  if (state.records && state.records.length > 50 && typeof analyzeLapCorners === 'function') {
    const flyingLap = state.laps && state.laps.find(l => l.lap_number >= 1 && !l.is_optimal && l.duration_s > 30);
    const recs = flyingLap
      ? state.records.slice(flyingLap.start_index, flyingLap.end_index + 1)
      : state.records;
    const detected = analyzeLapCorners(recs, null, flyingLap ? flyingLap.lap_number : 1);
    if (detected && detected.length > 0) {
      autoTurns = detected.map((d, dIdx) => ({
        id: `t${dIdx + 1}`,
        number: dIdx + 1,
        name: `Turn ${dIdx + 1}`,
        direction: d.isLeft ? 'left' : 'right',
        lat: d.lat,
        lon: d.lon,
        radius_m: 45,
        bearing: 0,
        description: 'Auto-detected from session'
      }));
    }
  }

  state.tracks[trackId] = {
    id: trackId,
    name: name.trim(),
    location: loc.trim(),
    center_lat: sf.lat,
    center_lon: sf.lon,
    radius_m: 3500,
    gates: JSON.parse(JSON.stringify(state.gates)),
    turns: autoTurns
  };

  saveSettingsToStorage();
  renderTrackLibrary();
  if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
  alert(`Track "${name.trim()}" saved to library with ${state.gates.length} gates and ${autoTurns.length} turn apexes!`);
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

    function updateGateVisuals(lat, lon, bearing) {
      const pPerp1 = moveCoordinate(lat, lon, (bearing + 90) % 360, 16);
      const pPerp2 = moveCoordinate(lat, lon, (bearing - 90 + 360) % 360, 16);
      gateLine.setLatLngs([[pPerp1.lat, pPerp1.lon], [pPerp2.lat, pPerp2.lon]]);
      const pAhead = moveCoordinate(lat, lon, bearing, 10);
      dirVector.setLatLngs([[lat, lon], [pAhead.lat, pAhead.lon]]);
      const el = marker.getElement();
      if (el) {
        const svg = el.querySelector('svg');
        if (svg) svg.style.transform = `rotate(${bearing}deg)`;
      }
    }

    function syncActiveTrack() {
      const trk = typeof getActiveTrackProfile === 'function' ? getActiveTrackProfile() : null;
      if (trk && trk.gates) {
        const trkGate = trk.gates.find(g => g.id === gate.id || (g.type === gate.type && g.name === gate.name));
        if (trkGate) {
          trkGate.lat = gate.lat;
          trkGate.lon = gate.lon;
          trkGate.bearing = gate.bearing;
        }
      }
    }

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
      syncActiveTrack();
      saveSettingsToStorage();
      recalculateLapsAndSectors();
      renderMapGates();
      if (typeof renderTrackLibrary === 'function') renderTrackLibrary();
    };
    popupContent.querySelector('.btn-rotate-left').onclick = () => {
      gate.bearing = (gate.bearing - 10 + 360) % 360;
      syncActiveTrack();
      saveSettingsToStorage();
      recalculateLapsAndSectors();
      renderMapGates();
      if (typeof renderTrackLibrary === 'function') renderTrackLibrary();
    };
    popupContent.querySelector('.btn-rotate-right').onclick = () => {
      gate.bearing = (gate.bearing + 10) % 360;
      syncActiveTrack();
      saveSettingsToStorage();
      recalculateLapsAndSectors();
      renderMapGates();
      if (typeof renderTrackLibrary === 'function') renderTrackLibrary();
    };
    popupContent.querySelector('.btn-snap-tangent').onclick = () => {
      let tb = typeof getTrackTangentBearing === 'function' ? getTrackTangentBearing(gate.lat, gate.lon) : null;
      if (tb === null || tb === undefined || isNaN(tb) || tb === 0) {
        const closest = typeof findClosestTrackPoint === 'function' ? findClosestTrackPoint(gate.lat, gate.lon) : null;
        if (closest && closest.tangentBearing !== undefined) tb = closest.tangentBearing;
      }
      if (tb !== null && tb !== undefined && !isNaN(tb)) {
        gate.bearing = tb;
        syncActiveTrack();
        saveSettingsToStorage();
        recalculateLapsAndSectors();
        renderMapGates();
        if (typeof renderTrackLibrary === 'function') renderTrackLibrary();
      }
    };
    if (!isSF) {
      popupContent.querySelector('.btn-delete-gate').onclick = () => {
        state.gates = state.gates.filter(g => g !== gate);
        const trk = typeof getActiveTrackProfile === 'function' ? getActiveTrackProfile() : null;
        if (trk && trk.gates) {
          trk.gates = trk.gates.filter(g => g !== gate && g.id !== gate.id && !(g.type === gate.type && g.name === gate.name));
        }
        saveSettingsToStorage();
        recalculateLapsAndSectors();
        renderMapGates();
        if (typeof renderTrackLibrary === 'function') renderTrackLibrary();
      };
    }

    marker.bindPopup(popupContent);
    gateLine.bindPopup(popupContent);
    dirVector.bindPopup(popupContent);

    // Live dynamic visual update while dragging
    marker.on('drag', (e) => {
      const curPos = e.target.getLatLng();
      const closest = typeof findClosestTrackPoint === 'function' ? findClosestTrackPoint(curPos.lat, curPos.lng) : null;
      const snapLat = (closest && closest.lat !== undefined) ? closest.lat : curPos.lat;
      const snapLon = (closest && closest.lon !== undefined) ? closest.lon : curPos.lng;
      let snapBrg = (closest && closest.tangentBearing !== undefined) ? closest.tangentBearing : gate.bearing;
      if (typeof getTrackTangentBearing === 'function') {
        const tb = getTrackTangentBearing(snapLat, snapLon);
        if (tb !== undefined && !isNaN(tb) && tb !== 0) snapBrg = tb;
      }
      updateGateVisuals(snapLat, snapLon, snapBrg);
    });

    // Snap to track and recalculate on drag end
    marker.on('dragend', (e) => {
      const newPos = e.target.getLatLng();
      const closest = typeof findClosestTrackPoint === 'function' ? findClosestTrackPoint(newPos.lat, newPos.lng) : null;
      if (closest && (closest.lat !== undefined || closest.record)) {
        gate.lat = closest.lat !== undefined ? closest.lat : closest.record.gps_lat;
        gate.lon = closest.lon !== undefined ? closest.lon : closest.record.gps_lon;
        const tb = typeof getTrackTangentBearing === 'function'
          ? getTrackTangentBearing(gate.lat, gate.lon)
          : ((closest.tangentBearing !== undefined) ? closest.tangentBearing : gate.bearing);
        if (tb !== undefined && !isNaN(tb) && tb !== 0) {
          gate.bearing = tb;
        }
      } else {
        gate.lat = newPos.lat;
        gate.lon = newPos.lng;
      }
      marker.setLatLng([gate.lat, gate.lon]);
      syncActiveTrack();
      saveSettingsToStorage();
      recalculateLapsAndSectors();
      renderMapGates();
      if (typeof renderTrackLibrary === 'function') renderTrackLibrary();
    });

    state.gatesLayerGroup.addLayer(marker);
    state.gatesLayerGroup.addLayer(gateLine);
    state.gatesLayerGroup.addLayer(dirVector);
  });
}

function handleGateMapClick(latlng) {
  const closest = typeof findClosestTrackPoint === 'function' ? findClosestTrackPoint(latlng.lat, latlng.lng) : null;
  if (!closest) return;

  const snapLat = closest.lat !== undefined ? closest.lat : (closest.record ? closest.record.gps_lat : latlng.lat);
  const snapLon = closest.lon !== undefined ? closest.lon : (closest.record ? closest.record.gps_lon : latlng.lng);
  let brg = typeof getTrackTangentBearing === 'function' ? getTrackTangentBearing(snapLat, snapLon) : 0;
  if (!brg && closest.tangentBearing !== undefined) brg = closest.tangentBearing;
  if (!brg) brg = 0;

  if (state.gateEditMode === 'sf') {
    let sfGate = state.gates.find(g => g.type === 'sf');
    if (!sfGate) {
      sfGate = { id: 'sf', name: 'Start / Finish', type: 'sf', lat: snapLat, lon: snapLon, bearing: brg };
      state.gates.unshift(sfGate);
    } else {
      sfGate.lat = snapLat;
      sfGate.lon = snapLon;
      sfGate.bearing = brg;
    }
  } else if (state.gateEditMode === 'split') {
    const splitCount = state.gates.filter(g => g.type === 'split').length;
    const newSplit = {
      id: `s${splitCount + 1}`,
      name: `Sector ${splitCount + 1}`,
      type: 'split',
      lat: snapLat,
      lon: snapLon,
      bearing: brg
    };
    state.gates.push(newSplit);
  }

  const trk = typeof getActiveTrackProfile === 'function' ? getActiveTrackProfile() : null;
  if (trk) {
    trk.gates = JSON.parse(JSON.stringify(state.gates));
  }

  cancelGateEdit();
  recalculateLapsAndSectors();
  saveSettingsToStorage();
  renderMapGates();
  if (typeof renderTrackLibrary === 'function') renderTrackLibrary();
}

function cancelGateEdit() {
  state.gateEditMode = null;
  if (dom.btnGateSf) dom.btnGateSf.classList.remove('active');
  if (dom.btnGateSplit) dom.btnGateSplit.classList.remove('active');
  if (dom.gateInstructionToast) dom.gateInstructionToast.style.display = 'none';
  const m = document.getElementById('map-container');
  if (m) m.style.cursor = '';
}
if (typeof window !== 'undefined') {
  window.cancelGatePlacement = cancelGateEdit;
}

function enterTurnEditMode() {
  state.turnEditMode = true;
  if (typeof cancelGateEdit === 'function') cancelGateEdit();
  if (dom.btnAddTurn) dom.btnAddTurn.classList.add('active');
  if (dom.gateInstructionToast) {
    dom.gateInstructionToast.innerHTML = '<span>📍 Click on track path to place/add a Turn Apex marker. Press <kbd>ESC</kbd> to cancel.</span>';
    dom.gateInstructionToast.style.display = 'flex';
  }
  const m = document.getElementById('map-container');
  if (m) m.style.cursor = 'crosshair';
}

function cancelTurnEdit() {
  state.turnEditMode = false;
  if (dom.btnAddTurn) dom.btnAddTurn.classList.remove('active');
  if (dom.gateInstructionToast) dom.gateInstructionToast.style.display = 'none';
  const m = document.getElementById('map-container');
  if (m) m.style.cursor = '';
}

function getCircuitDistanceForCoord(lat, lon, trk) {
  if (!state.records || state.records.length === 0) return 0;

  // If we have timed laps, use a clean flying lap slice (anchored to S/F)
  const flyingLap = state.laps && state.laps.find(l => l.lap_number >= 1 && !l.is_optimal && l.duration_s > 30);
  let recSlice;
  let baseDist = 0;

  if (flyingLap) {
    recSlice = state.records.slice(flyingLap.start_index, flyingLap.end_index + 1);
    baseDist = recSlice[0]?.distance_m || 0;
  } else {
    // If no flying lap, anchor from S/F gate crossing so baseDist is 0m at S/F
    const sfGate = (state.gates && state.gates.find(g => g.type === 'sf')) || (trk && trk.gates && trk.gates.find(g => g.type === 'sf'));
    let sfIdx = 0;
    if (sfGate) {
      let minSfDist = Infinity;
      for (let i = 0; i < state.records.length; i++) {
        const r = state.records[i];
        if (r.gps_lat === null) continue;
        const d = haversineDistanceM(sfGate.lat, sfGate.lon, r.gps_lat, r.gps_lon);
        if (d < minSfDist) {
          minSfDist = d;
          sfIdx = i;
        }
      }
    }
    recSlice = state.records.slice(sfIdx);
    baseDist = recSlice[0]?.distance_m || 0;
  }

  let minD = Infinity;
  let bestRelDist = 0;

  for (let i = 0; i < recSlice.length; i++) {
    const r = recSlice[i];
    if (r.gps_lat === null || r.gps_lon === null) continue;
    const d = haversineDistanceM(lat, lon, r.gps_lat, r.gps_lon);
    if (d < minD) {
      minD = d;
      bestRelDist = (r.distance_m || 0) - baseDist;
    }
  }
  return bestRelDist;
}

function sortTrackTurnsByCircuitDistance(trk) {
  if (!trk || !trk.turns || trk.turns.length < 2) return;
  trk.turns.forEach(t => {
    t._circuitDist = getCircuitDistanceForCoord(t.lat, t.lon, trk);
  });
  trk.turns.sort((a, b) => (a._circuitDist || 0) - (b._circuitDist || 0));
  trk.turns.forEach(t => delete t._circuitDist);
}

function renumberTrackTurnsSequentially(trk) {
  if (!trk || !trk.turns) return;
  sortTrackTurnsByCircuitDistance(trk);
  trk.turns.forEach((t, idx) => {
    t.number = idx + 1;
    t.name = `Turn ${idx + 1}`;
    t.id = `t${idx + 1}`;
  });
}

function handleTurnMapClick(latlng) {
  const closest = typeof findClosestTrackPoint === 'function' ? findClosestTrackPoint(latlng.lat, latlng.lng) : null;
  if (!closest) return;

  const trk = typeof getActiveTrackProfile === 'function' ? getActiveTrackProfile() : null;
  if (!trk) {
    alert('No active track found. Please select or save a track in the Track Library first.');
    cancelTurnEdit();
    return;
  }

  if (!trk.turns) trk.turns = [];

  // Calculate distance along circuit for clicked point
  const clickDist = getCircuitDistanceForCoord(closest.lat, closest.lon, trk);

  // Find neighbor turns along the circuit to suggest turn number
  let prevTurn = null;
  let nextTurn = null;
  const sortedExisting = trk.turns.slice().map(t => ({
    turn: t,
    dist: getCircuitDistanceForCoord(t.lat, t.lon, trk)
  })).sort((a, b) => a.dist - b.dist);

  for (let i = 0; i < sortedExisting.length; i++) {
    if (sortedExisting[i].dist < clickDist) {
      prevTurn = sortedExisting[i].turn;
    } else if (sortedExisting[i].dist >= clickDist && !nextTurn) {
      nextTurn = sortedExisting[i].turn;
    }
  }

  // Generate smart suggested label
  let suggestedNum = '';
  if (prevTurn && nextTurn) {
    const prevN = parseInt(prevTurn.number, 10);
    const nextN = parseInt(nextTurn.number, 10);
    if (!isNaN(prevN) && !isNaN(nextN) && nextN - prevN > 1) {
      suggestedNum = `${prevN + 1}`;
    } else if (prevTurn.number) {
      suggestedNum = `${prevTurn.number}A`;
    }
  } else if (prevTurn) {
    const prevN = parseInt(prevTurn.number, 10);
    suggestedNum = !isNaN(prevN) ? `${prevN + 1}` : `${trk.turns.length + 1}`;
  } else {
    suggestedNum = '1';
  }

  const promptMsg = prevTurn && nextTurn
    ? `Placing Turn between ${prevTurn.name || ('T' + prevTurn.number)} and ${nextTurn.name || ('T' + nextTurn.number)}.\n\nEnter Turn Label / Number (e.g. 5, 3A, 8A, T11):`
    : `Enter Turn Label / Number for this corner (e.g. 1, 2, 3A, 5, 8A):`;

  const userNumInput = prompt(promptMsg, suggestedNum);
  if (userNumInput === null) {
    cancelTurnEdit();
    return; // Cancelled
  }

  const cleanNum = (userNumInput.trim() || suggestedNum).replace(/^T/i, '');
  const suggestedName = `Turn ${cleanNum}`;
  const userNameInput = prompt(`Enter Turn Name / Description:`, suggestedName);
  const turnName = (userNameInput && userNameInput.trim()) ? userNameInput.trim() : suggestedName;

  const closestRec = state.records && closest.orig_index !== undefined ? state.records[closest.orig_index] : null;
  const isLeftLean = closestRec && (closestRec.lean_angle_deg || 0) < 0;

  let tangentBrg = 0;
  if (state.records && closest.orig_index !== undefined) {
    const i = closest.orig_index;
    const pPrev = state.records[Math.max(0, i - 2)];
    const pNext = state.records[Math.min(state.records.length - 1, i + 2)];
    if (pPrev && pNext && pPrev.gps_lat !== null && pNext.gps_lat !== null) {
      tangentBrg = calculateBearing(pPrev.gps_lat, pPrev.gps_lon, pNext.gps_lat, pNext.gps_lon);
    }
  }

  const newTurn = {
    id: `t_${cleanNum.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now().toString().slice(-4)}`,
    number: cleanNum,
    name: turnName,
    direction: isLeftLean ? 'left' : 'right',
    lat: closest.lat,
    lon: closest.lon,
    radius_m: 45,
    bearing: tangentBrg,
    description: `Apex on racing line`
  };

  trk.turns.push(newTurn);
  sortTrackTurnsByCircuitDistance(trk);
  saveSettingsToStorage();
  cancelTurnEdit();

  if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
  if (typeof renderTrackLibrary === 'function') renderTrackLibrary();
  if (dom.modalScorecard && dom.modalScorecard.style.display !== 'none') {
    renderScorecardTable(dom.selectScorecardLap ? parseInt(dom.selectScorecardLap.value, 10) : -1);
  }
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

  // Fallback: If no pure geometric intersection found, find local minimum distance points with normal-projection interpolation
  if (crossings.length === 0) {
    let lastFallbackT = -999.0;
    const gBrgRad = ((gate.bearing || 0) * Math.PI) / 180.0;
    const nx = Math.sin(gBrgRad);
    const ny = Math.cos(gBrgRad);
    const cosLat = Math.max(1e-6, Math.cos((gate.lat * Math.PI) / 180.0));
    const mPerLon = 111320.0 * cosLat;
    const mPerLat = 111132.0;

    const projS = (r) => {
      const dx = (r.gps_lon - gate.lon) * mPerLon;
      const dy = (r.gps_lat - gate.lat) * mPerLat;
      return dx * nx + dy * ny;
    };

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
          let exactTime = rCur.time_s;
          let exactDist = rCur.distance_m || 0;
          let crossIdx = i;

          for (let k = Math.max(0, i - 1); k <= Math.min(records.length - 2, i); k++) {
            const ra = records[k];
            const rb = records[k + 1];
            if (ra.gps_lat !== null && rb.gps_lat !== null) {
              const sa = projS(ra);
              const sb = projS(rb);
              if (sa <= 0.0 && sb >= 0.0 && (sb - sa) > 1e-6) {
                const u = -sa / (sb - sa);
                exactTime = ra.time_s + u * (rb.time_s - ra.time_s);
                exactDist = (ra.distance_m || 0) + u * ((rb.distance_m || 0) - (ra.distance_m || 0));
                crossIdx = k + 1;
                break;
              }
            }
          }

          crossings.push({
            index: crossIdx,
            record: records[crossIdx],
            time_s: exactTime,
            distance_m: exactDist
          });
          lastFallbackT = exactTime;
        }
      }
    }
  }

  return crossings;
}

function computeLapSectorsFromGates(lapRecs, startTimeS, endTimeS, dur, splitGates) {
  const sectors = [];
  if (splitGates && splitGates.length >= 2 && lapRecs && lapRecs.length > 2) {
    const splitCrossings = [];
    splitGates.slice(0, 2).forEach(sg => {
      const scList = findGateCrossings(sg, lapRecs, 5.0);
      if (scList.length > 0) {
        splitCrossings.push({ time_s: scList[0].time_s });
      } else {
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

    if (
      splitCrossings.length === 2 &&
      splitCrossings[0].time_s > startTimeS + 4.0 &&
      splitCrossings[1].time_s > splitCrossings[0].time_s + 4.0 &&
      splitCrossings[1].time_s < endTimeS - 4.0
    ) {
      const s1 = splitCrossings[0].time_s - startTimeS;
      const s2 = splitCrossings[1].time_s - splitCrossings[0].time_s;
      const s3 = endTimeS - splitCrossings[1].time_s;
      sectors.push(s1, s2, s3);
    } else {
      const s1 = dur * 0.28;
      const s2 = dur * 0.38;
      const s3 = dur - s1 - s2;
      sectors.push(s1, s2, s3);
    }
  } else {
    const s1 = dur * 0.28;
    const s2 = dur * 0.38;
    const s3 = dur - s1 - s2;
    sectors.push(s1, s2, s3);
  }
  return sectors;
}

function getLapPeakMetrics(lapRecs) {
  let maxSpd = 0, maxGpsSpd = 0, maxLeanL = 0, maxLeanR = 0, maxRpm = 0;
  for (let i = 0; i < lapRecs.length; i++) {
    const r = lapRecs[i];
    if ((r.speed_kmh || 0) > maxSpd) maxSpd = r.speed_kmh || 0;
    if ((r.gps_speed_kmh || 0) > maxGpsSpd) maxGpsSpd = r.gps_speed_kmh || 0;
    const lean = r.lean_angle_deg || 0;
    if (lean < -0.5 && Math.abs(lean) > maxLeanL) maxLeanL = Math.abs(lean);
    if (lean > 0.5 && lean > maxLeanR) maxLeanR = lean;
    if ((r.rpm || 0) > maxRpm) maxRpm = r.rpm || 0;
  }
  return { maxSpd, maxGpsSpd, maxLeanL, maxLeanR, maxRpm };
}

function isLapIncluded(lap) {
  if (!lap) return false;
  if (state.hideOutInLaps && (lap.is_out_lap || lap.is_in_lap)) return false;
  if (state.excludedLapKeys && lap.lap_key && state.excludedLapKeys.has(lap.lap_key)) return false;
  return true;
}

function formatHour12(hour24) {
  const h = ((parseInt(hour24, 10) % 24) + 24) % 24;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = (h % 12 === 0) ? 12 : (h % 12);
  return `${h12}${ampm}`;
}

function extractSessionHourStr(sessMeta) {
  const isSingleSession = !state.sessions || state.sessions.filter(s => !s.is_reference && s.id !== 'REF').length <= 1;
  const hdr = (isSingleSession && state.sessionData && state.sessionData.header) ? state.sessionData.header : {};
  const dtStr = (sessMeta && sessMeta.session_datetime) || hdr.session_datetime || '';
  if (dtStr) {
    const parts = dtStr.trim().split(/\s+/);
    const timePart = parts[parts.length - 1] || dtStr;
    const m = timePart.match(/^(\d{1,2}):\d{2}$/);
    if (m) {
      return formatHour12(parseInt(m[1], 10));
    }
    const mSec = timePart.match(/^(\d{1,2}):\d{2}:(\d{2})$/);
    if (mSec && mSec[2] === '00') {
      return formatHour12(parseInt(mSec[1], 10));
    }
  }
  const unixTs = (sessMeta && sessMeta.unix_timestamp) || hdr.unix_timestamp || 0;
  if (unixTs > 0 && (Math.round(unixTs * 1000) % 60000) === 0) {
    const d = new Date(unixTs * 1000);
    if (!isNaN(d.getTime())) {
      return formatHour12(d.getHours());
    }
  }
  return '';
}

function assignSessionHourLabels(sessions) {
  if (!Array.isArray(sessions)) return;
  const regSessions = sessions.filter(s => !s.is_reference && s.id !== 'REF');
  const buckets = [];
  const counts = {};

  regSessions.forEach(s => {
    const hStr = extractSessionHourStr(s) || 'Session';
    buckets.push(hStr);
    counts[hStr] = (counts[hStr] || 0) + 1;
  });

  const seen = {};
  regSessions.forEach((s, idx) => {
    const hStr = buckets[idx];
    seen[hStr] = (seen[hStr] || 0) + 1;
    const runNum = seen[hStr];
    if (hStr === 'Session') {
      s.hour_name = counts[hStr] > 1 ? `Run ${runNum}` : 'Session 1';
    } else if (counts[hStr] > 1) {
      s.hour_name = `${hStr} Run ${runNum}`;
    } else {
      s.hour_name = hStr;
    }
    s.label = s.hour_name;
  });
}

function recalculateLapsAndSectors() {
  if (!state.records || state.records.length === 0) return;

  const sfGate = state.gates.find(g => g.type === 'sf');
  const splitGates = state.gates.filter(g => g.type === 'split');

  // Preserve any existing Reference Laps (single benchmark laps attached to the workspace)
  const existingRefLaps = (state.laps || []).filter(l => !l.is_optimal && (l.is_reference || l.session_id === 'REF'));

  // Partition state.records into contiguous non-reference session blocks (S1, S2, S3...)
  const sessionBlocks = [];
  let curBlock = null;
  for (let i = 0; i < state.records.length; i++) {
    const r = state.records[i];
    const sid = r.session_id || 'S1';
    if (sid === 'REF') continue;
    if (!curBlock || curBlock.id !== sid) {
      if (curBlock) sessionBlocks.push(curBlock);
      curBlock = { id: sid, startIdx: i, endIdx: i };
    } else {
      curBlock.endIdx = i;
    }
  }
  if (curBlock) sessionBlocks.push(curBlock);

  const isMulti = sessionBlocks.length > 1 || existingRefLaps.length > 0;
  const palette = ['#ff1801', '#00e5ff', '#ffb300', '#00e676', '#d500f9', '#ff4081', '#2979ff', '#ffd600'];

  if (!Array.isArray(state.sessions)) state.sessions = [];
  let newLaps = [];
  let globalLapCounter = 0;

  // Ensure every session block has a session metadata entry & compute hour-based session names ("2PM", "2PM Run 1", "2PM Run 2")
  sessionBlocks.forEach((block, bIdx) => {
    let sessMeta = state.sessions.find(s => s.id === block.id);
    if (!sessMeta) {
      sessMeta = {
        id: block.id,
        index: bIdx + 1,
        label: block.id,
        color: palette[bIdx % palette.length],
        track_name: (state.sessionData && state.sessionData.header && state.sessionData.header.track_name) || '',
        rider_name: (state.sessionData && state.sessionData.header && state.sessionData.header.rider_name) || '',
        session_datetime: (state.sessionData && state.sessionData.header && state.sessionData.header.session_datetime) || '',
        unix_timestamp: (state.sessionData && state.sessionData.header && state.sessionData.header.unix_timestamp) || 0,
        start_index: block.startIdx,
        end_index: block.endIdx,
        is_reference: false
      };
      state.sessions.push(sessMeta);
    } else {
      sessMeta.start_index = block.startIdx;
      sessMeta.end_index = block.endIdx;
      if (!sessMeta.color) sessMeta.color = palette[bIdx % palette.length];
    }
  });
  assignSessionHourLabels(state.sessions);

  // 1. Dynamically slice each session (S1, S2, S3...) independently through the S/F & sector gates
  sessionBlocks.forEach((block, bIdx) => {
    const sessMeta = state.sessions.find(s => s.id === block.id);
    const sDisplay = sessMeta.label || block.id;

    const sessRecs = state.records.slice(block.startIdx, block.endIdx + 1);
    const crossings = sfGate ? findGateCrossings(sfGate, sessRecs, 35.0) : [];
    const sessLaps = [];

    if (crossings.length >= 1) {
      // Out-Lap
      const outStartIdx = block.startIdx;
      const outEndIdx = block.startIdx + crossings[0].index;
      const outRecs = state.records.slice(outStartIdx, outEndIdx + 1);
      const outLapNum = isMulti ? (++globalLapCounter) : 0;
      for (let k = outStartIdx; k <= outEndIdx; k++) {
        state.records[k].lap = outLapNum;
      }
      const outPeaks = getLapPeakMetrics(outRecs);
      const outKey = `${block.id}:out_0`;
      const outLapObj = {
        lap_number: outLapNum,
        orig_lap_number: 0,
        lap_key: outKey,
        session_id: block.id,
        session_index: bIdx + 1,
        session_label: sDisplay,
        session_color: sessMeta.color,
        session_datetime: sessMeta.session_datetime || '',
        name: isMulti ? `${sDisplay} · Out-Lap` : 'Out-Lap',
        orig_name: 'Out-Lap',
        start_time_s: state.records[outStartIdx].time_s,
        end_time_s: crossings[0].time_s,
        duration_s: Math.max(0, crossings[0].time_s - state.records[outStartIdx].time_s),
        start_index: outStartIdx,
        end_index: outEndIdx,
        distance_m: Math.max(0, crossings[0].distance_m - (state.records[outStartIdx].distance_m || 0)),
        sectors: [null, null, null],
        sector_1_s: null,
        sector_2_s: null,
        sector_3_s: null,
        max_speed_kmh: outPeaks.maxSpd,
        max_gps_speed_kmh: outPeaks.maxGpsSpd,
        max_lean_left_deg: outPeaks.maxLeanL,
        max_lean_right_deg: outPeaks.maxLeanR,
        max_rpm: outPeaks.maxRpm,
        is_flying: false,
        is_out_lap: true,
        is_in_lap: false,
        is_reference: false,
        is_session_best: false,
        is_best: false
      };
      outLapObj.included = isLapIncluded(outLapObj);
      newLaps.push(outLapObj);
      sessLaps.push(outLapObj);

      // Timed Laps (Lap 1 .. N)
      for (let i = 0; i < crossings.length - 1; i++) {
        const c1 = crossings[i];
        const c2 = crossings[i + 1];
        const origLapNum = i + 1;
        const lapNum = isMulti ? (++globalLapCounter) : origLapNum;
        const startIdx = block.startIdx + c1.index;
        const endIdx = block.startIdx + c2.index;
        const dur = Math.max(0, c2.time_s - c1.time_s);
        const dist = Math.max(0, c2.distance_m - c1.distance_m);

        const lapRecs = state.records.slice(startIdx, endIdx + 1);
        for (let k = startIdx; k <= endIdx; k++) {
          state.records[k].lap = lapNum;
        }
        const sectors = computeLapSectorsFromGates(lapRecs, c1.time_s, c2.time_s, dur, splitGates);
        const peaks = getLapPeakMetrics(lapRecs);
        const lapKey = `${block.id}:${origLapNum}`;

        const timedLapObj = {
          lap_number: lapNum,
          orig_lap_number: origLapNum,
          lap_key: lapKey,
          session_id: block.id,
          session_index: bIdx + 1,
          session_label: sDisplay,
          session_color: sessMeta.color,
          session_datetime: sessMeta.session_datetime || '',
          name: isMulti ? `${sDisplay} · Lap ${origLapNum}` : `Lap ${origLapNum}`,
          orig_name: `Lap ${origLapNum}`,
          start_time_s: c1.time_s,
          end_time_s: c2.time_s,
          duration_s: dur,
          start_index: startIdx,
          end_index: endIdx,
          distance_m: dist,
          sectors: sectors,
          sector_1_s: sectors[0],
          sector_2_s: sectors[1],
          sector_3_s: sectors[2],
          max_speed_kmh: peaks.maxSpd,
          max_gps_speed_kmh: peaks.maxGpsSpd,
          max_lean_left_deg: peaks.maxLeanL,
          max_lean_right_deg: peaks.maxLeanR,
          max_rpm: peaks.maxRpm,
          is_flying: dur > 30.0 && dur < 600.0,
          is_out_lap: false,
          is_in_lap: false,
          is_reference: false,
          is_session_best: false,
          is_best: false
        };
        timedLapObj.included = isLapIncluded(timedLapObj);
        newLaps.push(timedLapObj);
        sessLaps.push(timedLapObj);
      }

      // In-Lap
      const lastCross = crossings[crossings.length - 1];
      const origInNum = crossings.length;
      const inLapNum = isMulti ? (++globalLapCounter) : origInNum;
      const inStartIdx = block.startIdx + lastCross.index;
      const inEndIdx = block.endIdx;
      const inRecs = state.records.slice(inStartIdx, inEndIdx + 1);
      for (let k = inStartIdx; k <= inEndIdx; k++) {
        state.records[k].lap = inLapNum;
      }
      const inPeaks = getLapPeakMetrics(inRecs);
      const inKey = `${block.id}:in_${origInNum}`;
      const inLapObj = {
        lap_number: inLapNum,
        orig_lap_number: origInNum,
        lap_key: inKey,
        session_id: block.id,
        session_index: bIdx + 1,
        session_label: sDisplay,
        session_color: sessMeta.color,
        session_datetime: sessMeta.session_datetime || '',
        name: isMulti ? `${sDisplay} · Lap ${origInNum} (In-Lap)` : `Lap ${origInNum} (In-Lap)`,
        orig_name: `Lap ${origInNum} (In-Lap)`,
        start_time_s: lastCross.time_s,
        end_time_s: state.records[inEndIdx].time_s,
        duration_s: Math.max(0, state.records[inEndIdx].time_s - lastCross.time_s),
        start_index: inStartIdx,
        end_index: inEndIdx,
        distance_m: Math.max(0, (state.records[inEndIdx].distance_m || 0) - lastCross.distance_m),
        sectors: [null, null, null],
        sector_1_s: null,
        sector_2_s: null,
        sector_3_s: null,
        max_speed_kmh: inPeaks.maxSpd,
        max_gps_speed_kmh: inPeaks.maxGpsSpd,
        max_lean_left_deg: inPeaks.maxLeanL,
        max_lean_right_deg: inPeaks.maxLeanR,
        max_rpm: inPeaks.maxRpm,
        is_flying: false,
        is_out_lap: false,
        is_in_lap: true,
        is_reference: false,
        is_session_best: false,
        is_best: false
      };
      inLapObj.included = isLapIncluded(inLapObj);
      newLaps.push(inLapObj);
      sessLaps.push(inLapObj);
    } else {
      // Fallback single full-session lap if S/F gate hasn't intersected this session yet
      const fbLapNum = isMulti ? (++globalLapCounter) : 1;
      for (let k = block.startIdx; k <= block.endIdx; k++) {
        state.records[k].lap = fbLapNum;
      }
      const fbPeaks = getLapPeakMetrics(sessRecs);
      const startT = state.records[block.startIdx].time_s || 0;
      const endT = state.records[block.endIdx].time_s || 0;
      const dur = Math.max(0, endT - startT);
      const dist = Math.max(0, (state.records[block.endIdx].distance_m || 0) - (state.records[block.startIdx].distance_m || 0));
      const fbKey = `${block.id}:full_1`;
      const fbLapObj = {
        lap_number: fbLapNum,
        orig_lap_number: 1,
        lap_key: fbKey,
        session_id: block.id,
        session_index: bIdx + 1,
        session_label: sDisplay,
        session_color: sessMeta.color,
        session_datetime: sessMeta.session_datetime || '',
        name: isMulti ? `${sDisplay} · Full Session` : 'Full Session',
        orig_name: 'Full Session',
        start_time_s: startT,
        end_time_s: endT,
        duration_s: dur,
        start_index: block.startIdx,
        end_index: block.endIdx,
        distance_m: dist,
        sectors: [null, null, null],
        sector_1_s: null,
        sector_2_s: null,
        sector_3_s: null,
        max_speed_kmh: fbPeaks.maxSpd,
        max_gps_speed_kmh: fbPeaks.maxGpsSpd,
        max_lean_left_deg: fbPeaks.maxLeanL,
        max_lean_right_deg: fbPeaks.maxLeanR,
        max_rpm: fbPeaks.maxRpm,
        is_flying: true,
        is_out_lap: false,
        is_in_lap: false,
        is_reference: false,
        is_session_best: false,
        is_best: false
      };
      fbLapObj.included = isLapIncluded(fbLapObj);
      newLaps.push(fbLapObj);
      sessLaps.push(fbLapObj);
    }

    // Update session best lap & counts from dynamic gate segmentation
    const includedFlying = sessLaps.filter(l => l.included !== false && l.is_flying && l.duration_s > 25.0);
    const fallbackPool = includedFlying.length > 0
      ? includedFlying
      : sessLaps.filter(l => l.included !== false && !l.is_out_lap && !l.is_in_lap);
    const bestInSess = fallbackPool.length > 0
      ? fallbackPool.reduce((min, l) => l.duration_s < min.duration_s ? l : min, fallbackPool[0])
      : null;
    if (bestInSess) {
      bestInSess.is_session_best = true;
    }
    sessMeta.lap_count = sessLaps.length;
    sessMeta.flying_lap_count = sessLaps.filter(l => l.is_flying).length;
    sessMeta.best_lap_time_s = bestInSess ? bestInSess.duration_s : null;
    sessMeta.best_lap_number = bestInSess ? bestInSess.lap_number : null;
  });

  // 2. Append any Reference Laps (REF) with dynamically recalculated sector splits
  existingRefLaps.forEach((refLap, rIdx) => {
    const refLapNum = ++globalLapCounter;
    const lapRecs = state.records.slice(refLap.start_index, refLap.end_index + 1);
    for (let k = refLap.start_index; k <= refLap.end_index; k++) {
      if (state.records[k]) state.records[k].lap = refLapNum;
    }
    const startT = lapRecs.length > 0 ? lapRecs[0].time_s : refLap.start_time_s;
    const endT = lapRecs.length > 0 ? lapRecs[lapRecs.length - 1].time_s : refLap.end_time_s;
    const dur = refLap.duration_s || Math.max(0, endT - startT);
    const sectors = lapRecs.length > 2
      ? computeLapSectorsFromGates(lapRecs, startT, endT, dur, splitGates)
      : (refLap.sectors || [null, null, null]);
    const peaks = getLapPeakMetrics(lapRecs);
    const refKey = refLap.lap_key || `REF:${refLap.ref_id || (rIdx + 1)}`;

    const updatedRef = Object.assign({}, refLap, {
      lap_number: refLapNum,
      orig_lap_number: rIdx + 1,
      lap_key: refKey,
      session_id: 'REF',
      session_color: '#ffd600',
      start_time_s: startT,
      end_time_s: endT,
      duration_s: dur,
      sectors: sectors,
      sector_1_s: sectors[0],
      sector_2_s: sectors[1],
      sector_3_s: sectors[2],
      max_speed_kmh: peaks.maxSpd || refLap.max_speed_kmh || 0,
      max_gps_speed_kmh: peaks.maxGpsSpd || refLap.max_gps_speed_kmh || 0,
      max_lean_left_deg: peaks.maxLeanL || refLap.max_lean_left_deg || 0,
      max_lean_right_deg: peaks.maxLeanR || refLap.max_lean_right_deg || 0,
      max_rpm: peaks.maxRpm || refLap.max_rpm || 0,
      is_reference: true,
      is_flying: true,
      is_out_lap: false,
      is_in_lap: false,
      is_session_best: true,
      is_best: false
    });
    updatedRef.included = isLapIncluded(updatedRef);
    newLaps.push(updatedRef);
  });

  // 3. Determine Overall Best Lap and Best Sectors across included laps (respecting activeSessionFilter if set)
  const filterSid = state.activeSessionFilter || 'ALL';
  const candidateLaps = newLaps.filter(l => {
    if (l.included === false) return false;
    const validTiming = !l.is_out_lap && !l.is_in_lap && l.duration_s > 30.0 && l.duration_s < 400.0;
    if (!validTiming) return false;
    if (filterSid !== 'ALL' && (l.session_id || 'S1') !== filterSid) return false;
    return true;
  });

  const nonRefCandidates = candidateLaps.filter(l => !l.is_reference);
  const bestPool = nonRefCandidates.length > 0 ? nonRefCandidates : candidateLaps;

  if (bestPool.length > 0) {
    const best = bestPool.reduce((min, l) => l.duration_s < min.duration_s ? l : min, bestPool[0]);
    best.is_best = true;
    best.is_session_best = true;
    if (dom.dataBestLapBadge) dom.dataBestLapBadge.textContent = `🏆 Best: ${formatTime(best.duration_s)}`;

    state.bestSectors = [null, null, null];
    for (let sIdx = 0; sIdx < 3; sIdx++) {
      const sTimes = candidateLaps.map(l => l.sectors && l.sectors[sIdx]).filter(t => t !== null && t !== undefined && t > 3.0);
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
  if (dom.metaDuration) {
    const timedCount = newLaps.filter(l => l.included !== false && l.lap_number >= 1 && !l.is_optimal && !l.is_out_lap && !l.is_in_lap && !(l.name && l.name.includes('In-Lap'))).length;
    const totalCount = timedCount > 0 ? timedCount : newLaps.filter(l => !l.is_optimal).length;
    const sessCount = sessionBlocks.length;
    if (sessCount > 1) {
      dom.metaDuration.textContent = `🏁 ${sessCount} Sessions · ${totalCount} Laps`;
    } else {
      dom.metaDuration.textContent = `🏁 ${totalCount} ${totalCount === 1 ? 'Lap' : 'Laps'}`;
    }
  }
  if (typeof generateTheoreticalOptimalLap === 'function') generateTheoreticalOptimalLap();
  if (typeof renderSessionFilterBar === 'function') renderSessionFilterBar();
  if (typeof renderLapListTable === 'function') renderLapListTable();
  renderMapGates();
  if (typeof selectLap === 'function') selectLap(state.selectedLapNum, false);
}
