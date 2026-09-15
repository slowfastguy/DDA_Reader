/**
 * motogp_card.js - MotoGP Broadcast HUD Live Card Controller
 * Ducati DDA Telemetry & GPS Visualizer
 */

function initMotoGPOverlay() {
  syncMotoGPConfigToUI();
  makeElementDraggable(dom.motogpLiveCard);
}

function syncMotoGPConfigToUI() {
  if (dom.motogpNameDisplay) dom.motogpNameDisplay.textContent = state.motogp.riderName;
  if (dom.previewNameDisplay) dom.previewNameDisplay.textContent = state.motogp.riderName;
  if (dom.inputRiderName) dom.inputRiderName.value = state.motogp.riderName;

  if (dom.motogpBikeDisplay) dom.motogpBikeDisplay.textContent = state.motogp.bikeName;
  if (dom.previewBikeDisplay) dom.previewBikeDisplay.textContent = state.motogp.bikeName;
  if (dom.inputBikeName) dom.inputBikeName.value = state.motogp.bikeName;

  if (dom.motogpNumDisplay) dom.motogpNumDisplay.textContent = state.motogp.riderNum;
  if (dom.previewNumDisplay) dom.previewNumDisplay.textContent = state.motogp.riderNum;
  if (dom.inputRiderNum) dom.inputRiderNum.value = state.motogp.riderNum;

  if (dom.motogpTyreFront) dom.motogpTyreFront.textContent = (state.motogp.tyreFront || 'M').toUpperCase();
  if (dom.previewTyreFront) dom.previewTyreFront.textContent = (state.motogp.tyreFront || 'M').toUpperCase();
  if (dom.inputTyreFront) dom.inputTyreFront.value = (state.motogp.tyreFront || 'M').toUpperCase();

  if (dom.motogpTyreRear) dom.motogpTyreRear.textContent = (state.motogp.tyreRear || 'S').toUpperCase();
  if (dom.previewTyreRear) dom.previewTyreRear.textContent = (state.motogp.tyreRear || 'S').toUpperCase();
  if (dom.inputTyreRear) dom.inputTyreRear.value = (state.motogp.tyreRear || 'S').toUpperCase();

  if (dom.motogpNumBadge) dom.motogpNumBadge.style.backgroundColor = state.motogp.badgeColor;
  if (dom.previewNumBadge) dom.previewNumBadge.style.backgroundColor = state.motogp.badgeColor;
  if (dom.inputNumberColor) dom.inputNumberColor.value = state.motogp.badgeColor;

  if (dom.motogpLiveCard) {
    dom.motogpLiveCard.style.display = state.motogp.showCard ? 'flex' : 'none';
  }
}

function getBenchmarkReference(lapObj) {
  if (!lapObj) return null;

  // 1. If in compare mode, compare against Compare Lap B
  if (state.isCompareMode && state.compareLapB) {
    const lapB = state.laps && state.laps.find(l => l.lap_number === state.compareLapB);
    if (lapB && lapB.duration_s > 10) {
      const s1 = (lapB.sectors && lapB.sectors[0]) || (lapB.duration_s * 0.28);
      const s2 = (lapB.sectors && lapB.sectors[1]) || (lapB.duration_s * 0.38);
      const s3 = (lapB.sectors && lapB.sectors[2]) || (lapB.duration_s * 0.34);
      return { s1, s2, s3, total: lapB.duration_s, name: lapB.name, lap_number: lapB.lap_number };
    }
  }

  // 2. Find best valid lap completed PRIOR to this lap in the session (strictly no future laps)
  if (state.laps && state.laps.length > 0) {
    const priorLaps = state.laps.filter(l =>
      l.lap_number >= 1 &&
      l.lap_number < lapObj.lap_number &&
      l.duration_s > 30 &&
      l.duration_s < 600 &&
      !l.is_out_lap &&
      !l.is_in_lap
    );
    if (priorLaps.length > 0) {
      const bestPrior = priorLaps.reduce((min, l) => l.duration_s < min.duration_s ? l : min, priorLaps[0]);
      const s1 = (bestPrior.sectors && bestPrior.sectors[0]) || (bestPrior.duration_s * 0.28);
      const s2 = (bestPrior.sectors && bestPrior.sectors[1]) || (bestPrior.duration_s * 0.38);
      const s3 = (bestPrior.sectors && bestPrior.sectors[2]) || (bestPrior.duration_s * 0.34);
      return { s1, s2, s3, total: bestPrior.duration_s, name: bestPrior.name, lap_number: bestPrior.lap_number };
    }
  }

  // No completed flying lap prior to this in the session exists yet (e.g. Lap 1 or out-lap)
  return null;
}

function updateMotoGPCard(lapObj, interpTime) {
  if (!dom.motogpLiveCard || !lapObj) return;

  const lapElapsed = Math.max(0, interpTime - lapObj.start_time_s);

  const s1Dur = (lapObj.sectors && lapObj.sectors[0]) || (lapObj.duration_s * 0.28);
  const s2Dur = (lapObj.sectors && lapObj.sectors[1]) || (lapObj.duration_s * 0.38);
  const s3Dur = (lapObj.sectors && lapObj.sectors[2]) || (lapObj.duration_s * 0.34);

  const tSplit1 = s1Dur;
  const tSplit2 = s1Dur + s2Dur;
  const tSplit3 = lapObj.duration_s;

  const ref = getBenchmarkReference(lapObj);
  const hasRef = ref !== null && ref !== undefined && typeof ref.s1 === 'number';
  const r1 = hasRef ? ref.s1 : 0;
  const r2 = hasRef ? ref.s2 : 0;
  const r3 = hasRef ? ref.s3 : 0;
  const refTotal = hasRef ? ref.total : 0;

  // Tic marker progress across the 3 segments (0% to 100%)
  let ticPct = 0;
  if (lapElapsed < tSplit1) {
    ticPct = (lapElapsed / tSplit1) * (100 / 3);
  } else if (lapElapsed < tSplit2) {
    ticPct = (100 / 3) + ((lapElapsed - tSplit1) / s2Dur) * (100 / 3);
  } else {
    ticPct = (200 / 3) + (Math.min(1.0, (lapElapsed - tSplit2) / s3Dur)) * (100 / 3);
  }
  if (dom.motogpTicCursor) {
    dom.motogpTicCursor.style.left = `${Math.max(0, Math.min(100, ticPct))}%`;
  }

  let isGateHighlight = false;
  let displayedTimeStr = formatMotoGPTimer(lapElapsed);
  let deltaStr = '';
  let deltaColorClass = 'motogp-text-grey';
  let timeColorClass = 'motogp-text-orange';
  let showDelta = false;

  // 1. LAP-TO-LAP FINISHED DISPLAY & FASTEST CELEBRATION:
  const prevLapObj = state.laps && state.laps.find(l => l.lap_number === lapObj.lap_number - 1);
  if (prevLapObj && prevLapObj.duration_s > 10) {
    const prevRef = getBenchmarkReference(prevLapObj);
    const hasPrevRef = prevRef !== null && prevRef !== undefined && typeof prevRef.total === 'number';
    const pd3 = hasPrevRef ? (prevLapObj.duration_s - prevRef.total) : 0;
    const isFastest = prevLapObj.is_best || (hasPrevRef && pd3 < 0);
    const holdDuration = isFastest ? 7.0 : 5.0;

    if (lapElapsed < holdDuration) {
      dom.motogpLiveCard.classList.add('motogp-lap-finished');
      deltaStr = hasPrevRef ? `${pd3 < 0 ? '' : '+'}${pd3.toFixed(3)}` : '★ PB';
      deltaColorClass = hasPrevRef ? getMotoGPTextClass(pd3) : 'motogp-text-red';
      timeColorClass = isFastest ? 'motogp-text-red' : deltaColorClass;
      displayedTimeStr = formatMotoGPTimer(prevLapObj.duration_s);

      if (dom.motogpFooterDelta) {
        dom.motogpFooterDelta.textContent = deltaStr;
        dom.motogpFooterDelta.className = `motogp-footer-delta ${deltaColorClass}`;
        dom.motogpFooterDelta.style.display = 'flex';
      }

      if (isFastest && dom.motogpFastestBanner && dom.motogpFastestSlider) {
        if (lapElapsed < 0.35) {
          dom.motogpFastestBanner.style.display = 'flex';
          const wipePct = Math.min(100, (lapElapsed / 0.35) * 100);
          dom.motogpFastestBanner.style.clipPath = `polygon(${100 - wipePct}% 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, ${100 - wipePct}% 100%)`;
          dom.motogpFastestSlider.style.transform = 'translateY(0px)';
        } else if (lapElapsed < 0.85) {
          dom.motogpFastestBanner.style.display = 'flex';
          dom.motogpFastestBanner.style.clipPath = 'polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)';
          dom.motogpFastestSlider.style.transform = 'translateY(0px)';
        } else if (lapElapsed < 1.15) {
          dom.motogpFastestBanner.style.display = 'flex';
          dom.motogpFastestBanner.style.clipPath = 'polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)';
          const panU = (lapElapsed - 0.85) / 0.30;
          const panEase = panU * panU * (3 - 2 * panU);
          dom.motogpFastestSlider.style.transform = `translateY(${-66 * panEase}px)`;
        } else if (lapElapsed < 1.65) {
          dom.motogpFastestBanner.style.display = 'flex';
          dom.motogpFastestBanner.style.clipPath = 'polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)';
          dom.motogpFastestSlider.style.transform = 'translateY(-66px)';
        } else if (lapElapsed < 2.00) {
          dom.motogpFastestBanner.style.display = 'flex';
          const wipeAwayPct = Math.min(100, ((lapElapsed - 1.65) / 0.35) * 100);
          dom.motogpFastestBanner.style.clipPath = `polygon(${wipeAwayPct}% 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, ${wipeAwayPct}% 100%)`;
          dom.motogpFastestSlider.style.transform = 'translateY(-66px)';
        } else {
          dom.motogpFastestBanner.style.display = 'none';
        }
      }

      if (dom.motogpTimeDisplay) {
        dom.motogpTimeDisplay.textContent = displayedTimeStr;
        dom.motogpTimeDisplay.className = `motogp-time-digits ${timeColorClass}`;
      }
      if (dom.motogpDeltaDisplay) {
        dom.motogpDeltaDisplay.style.display = 'none';
      }
      return;
    }
  }

  // Not in post-lap hold: ensure finished lap styles & banners are off
  dom.motogpLiveCard.classList.remove('motogp-lap-finished');
  if (dom.motogpFastestBanner) dom.motogpFastestBanner.style.display = 'none';
  if (dom.motogpFooterDelta) dom.motogpFooterDelta.style.display = 'none';

  if (!hasRef) {
    // No prior benchmark completed in this session:
    // Sectors stay pending/clean, zero delta shown, clean running timer
    if (dom.motogpSec1) dom.motogpSec1.className = 'motogp-sec-segment ' + (lapElapsed >= tSplit1 ? 'motogp-sec-white' : 'motogp-sec-pending');
    if (dom.motogpSec2) dom.motogpSec2.className = 'motogp-sec-segment ' + (lapElapsed >= tSplit2 ? 'motogp-sec-white' : 'motogp-sec-pending');
    if (dom.motogpSec3) dom.motogpSec3.className = 'motogp-sec-segment ' + (lapElapsed >= tSplit3 ? 'motogp-sec-white' : 'motogp-sec-pending');
    showDelta = false;
    isGateHighlight = false;
  } else {
    // Benchmark lap exists: compute sector split deltas
    const d1 = s1Dur - r1;
    const d2 = (s1Dur + s2Dur) - (r1 + r2);
    const d3 = lapObj.duration_s - refTotal;

    if (lapElapsed < tSplit1) {
      // Sector 1 In Progress
      if (dom.motogpSec1) dom.motogpSec1.className = 'motogp-sec-segment motogp-sec-pending';
      if (dom.motogpSec2) dom.motogpSec2.className = 'motogp-sec-segment motogp-sec-pending';
      if (dom.motogpSec3) dom.motogpSec3.className = 'motogp-sec-segment motogp-sec-pending';
      showDelta = false;
      isGateHighlight = false;
    } else if (lapElapsed < tSplit2) {
      // Sector 1 Completed, Sector 2 In Progress
      if (dom.motogpSec1) dom.motogpSec1.className = `motogp-sec-segment ${getMotoGPSectorClass(d1)}`;
      if (dom.motogpSec2) dom.motogpSec2.className = 'motogp-sec-segment motogp-sec-pending';
      if (dom.motogpSec3) dom.motogpSec3.className = 'motogp-sec-segment motogp-sec-pending';

      // Only show delta during the 5-second split popup window
      if (lapElapsed >= tSplit1 && lapElapsed < tSplit1 + 5.0) {
        showDelta = true;
        isGateHighlight = true;
        displayedTimeStr = formatMotoGPTimer(tSplit1); // Freeze on Gate 1 split time
        deltaStr = `${d1 < 0 ? '' : '+'}${d1.toFixed(3)}`;
        deltaColorClass = getMotoGPTextClass(d1);
        timeColorClass = deltaColorClass;
      } else {
        showDelta = false;
        isGateHighlight = false;
      }
    } else if (lapElapsed < tSplit3) {
      // Sector 2 Completed, Sector 3 In Progress
      if (dom.motogpSec1) dom.motogpSec1.className = `motogp-sec-segment ${getMotoGPSectorClass(d1)}`;
      if (dom.motogpSec2) dom.motogpSec2.className = `motogp-sec-segment ${getMotoGPSectorClass(d2)}`;
      if (dom.motogpSec3) dom.motogpSec3.className = 'motogp-sec-segment motogp-sec-pending';

      // Only show delta during the 5-second split popup window
      if (lapElapsed >= tSplit2 && lapElapsed < tSplit2 + 5.0) {
        showDelta = true;
        isGateHighlight = true;
        displayedTimeStr = formatMotoGPTimer(tSplit2); // Freeze on Gate 2 split time
        deltaStr = `${d2 < 0 ? '' : '+'}${d2.toFixed(3)}`;
        deltaColorClass = getMotoGPTextClass(d2);
        timeColorClass = deltaColorClass;
      } else {
        showDelta = false;
        isGateHighlight = false;
      }
    } else {
      // Sector 3 / Finish Line Completed
      if (dom.motogpSec1) dom.motogpSec1.className = `motogp-sec-segment ${getMotoGPSectorClass(d1)}`;
      if (dom.motogpSec2) dom.motogpSec2.className = `motogp-sec-segment ${getMotoGPSectorClass(d2)}`;
      if (dom.motogpSec3) dom.motogpSec3.className = `motogp-sec-segment ${getMotoGPSectorClass(d3)}`;

      showDelta = true;
      isGateHighlight = true;
      displayedTimeStr = formatMotoGPTimer(tSplit3);
      deltaStr = `${d3 < 0 ? '' : '+'}${d3.toFixed(3)}`;
      deltaColorClass = getMotoGPTextClass(d3);
      timeColorClass = deltaColorClass;
    }
  }

  // Update DOM displays
  if (dom.motogpTimeDisplay) {
    dom.motogpTimeDisplay.textContent = displayedTimeStr;
    dom.motogpTimeDisplay.className = `motogp-time-digits ${timeColorClass}`;
  }

  if (dom.motogpDeltaDisplay) {
    if (showDelta && deltaStr) {
      dom.motogpDeltaDisplay.textContent = deltaStr;
      dom.motogpDeltaDisplay.className = `motogp-delta-display ${deltaColorClass}`;
      dom.motogpDeltaDisplay.style.display = 'flex';
    } else {
      dom.motogpDeltaDisplay.style.display = 'none';
    }
  }

  if (dom.motogpBody) {
    dom.motogpBody.classList.toggle('motogp-gate-highlight', isGateHighlight);
  }
}

function getMotoGPSectorClass(delta) {
  if (delta < 0.000) return 'motogp-sec-red';
  if (delta <= 0.500) return 'motogp-sec-orange';
  return 'motogp-sec-grey';
}

function getMotoGPTextClass(delta) {
  if (delta < 0.000) return 'motogp-text-red';
  if (delta <= 0.500) return 'motogp-text-orange';
  return 'motogp-text-grey';
}

function formatMotoGPTimer(sec) {
  if (sec === undefined || sec === null || isNaN(sec)) return '0:00.000';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function makeElementDraggable(elm) {
  if (!elm) return;
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  elm.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    elm.style.top = (elm.offsetTop - pos2) + "px";
    elm.style.left = (elm.offsetLeft - pos1) + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}
