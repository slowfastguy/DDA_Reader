/**
 * video_player.js - Integrated In-Browser Onboard Video Player & Synchronization Engine
 * Ducati DDA Telemetry & GPS Visualizer
 */

function initVideoPlayer() {
  const vPlayer = dom.videoPlayer;
  const vDropzone = dom.videoDropzone;
  const vInput = dom.videoFileInput;
  const vLapBInput = dom.videoLapBFileInput;

  if (!vPlayer) return;

  // File Input Listeners
  if (vInput) {
    vInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        loadVideoFile(e.target.files[0], false);
      }
    });
  }

  if (vLapBInput) {
    vLapBInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        loadVideoFile(e.target.files[0], true);
      }
    });
  }

  // Header Button
  if (dom.btnHeaderLoadVideo) {
    dom.btnHeaderLoadVideo.addEventListener('click', () => {
      if (!state.video.hasVideo) {
        if (vInput) vInput.click();
      } else {
        // Toggle view or open sync drawer
        const isDrawerOpen = dom.videoSyncDrawer && dom.videoSyncDrawer.style.display !== 'none';
        if (dom.videoSyncDrawer) dom.videoSyncDrawer.style.display = isDrawerOpen ? 'none' : 'block';
      }
    });
  }

  // Drag and Drop Handling on Video Dropzone & Workspace
  if (vDropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      vDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        vDropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      vDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        vDropzone.classList.remove('dragover');
      }, false);
    });

    vDropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('video/') || file.name.match(/\.(mp4|mov|webm|m4v)$/i)) {
          loadVideoFile(file, false);
        }
      }
    });
  }

  // View Mode Switcher
  if (dom.btnVideoViewMap) {
    dom.btnVideoViewMap.addEventListener('click', () => setVideoViewMode('map-only'));
  }
  if (dom.btnVideoViewSplit) {
    dom.btnVideoViewSplit.addEventListener('click', () => setVideoViewMode('split'));
  }
  if (dom.btnVideoViewVideo) {
    dom.btnVideoViewVideo.addEventListener('click', () => setVideoViewMode('video-only'));
  }
  if (dom.btnVideoViewPip) {
    dom.btnVideoViewPip.addEventListener('click', () => setVideoViewMode('pip'));
  }

  // Sync Calibration Drawer Toggle
  if (dom.btnOpenVideoSync) {
    dom.btnOpenVideoSync.addEventListener('click', () => {
      if (dom.videoSyncDrawer) {
        const isOpen = dom.videoSyncDrawer.style.display !== 'none';
        dom.videoSyncDrawer.style.display = isOpen ? 'none' : 'block';
      }
    });
  }

  // 1-Click Sync at Start/Finish Gate
  if (dom.btnSyncSF) {
    dom.btnSyncSF.addEventListener('click', syncVideoToCurrentSf);
  }

  // Nudge Buttons
  if (dom.btnNudgeBack10) dom.btnNudgeBack10.addEventListener('click', () => nudgeVideoOffset(-0.5));
  if (dom.btnNudgeBack1) dom.btnNudgeBack1.addEventListener('click', () => nudgeVideoOffset(-0.0333));
  if (dom.btnNudgeFwd1) dom.btnNudgeFwd1.addEventListener('click', () => nudgeVideoOffset(0.0333));
  if (dom.btnNudgeFwd10) dom.btnNudgeFwd10.addEventListener('click', () => nudgeVideoOffset(0.5));

  // Audio Mute Toggle
  if (dom.btnToggleVideoMute) {
    dom.btnToggleVideoMute.addEventListener('click', () => {
      state.video.audioMuted = !state.video.audioMuted;
      if (dom.videoPlayer) dom.videoPlayer.muted = state.video.audioMuted;
      const iconOn = document.getElementById('icon-vol-on');
      const iconOff = document.getElementById('icon-vol-off');
      if (iconOn) iconOn.style.display = state.video.audioMuted ? 'none' : 'block';
      if (iconOff) iconOff.style.display = state.video.audioMuted ? 'block' : 'none';
    });
  }

  // Live HUD Overlay Toggle
  if (dom.btnToggleVideoOverlay) {
    dom.btnToggleVideoOverlay.addEventListener('click', () => {
      state.video.overlayEnabled = !state.video.overlayEnabled;
      dom.btnToggleVideoOverlay.classList.toggle('active', state.video.overlayEnabled);
      dom.btnToggleVideoOverlay.textContent = state.video.overlayEnabled ? '📊 HUD: ON' : '📊 HUD: OFF';
      if (!state.video.overlayEnabled && dom.videoOverlayCanvas) {
        const ctx = dom.videoOverlayCanvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, dom.videoOverlayCanvas.width, dom.videoOverlayCanvas.height);
      }
    });
  }

  // Setup Overlay Canvas Resize Observer
  if (dom.videoPlayer && dom.videoOverlayCanvas) {
    const resizeObserver = new ResizeObserver(() => {
      resizeVideoOverlayCanvas();
    });
    resizeObserver.observe(dom.videoPlayer);
  }
}

function loadVideoFile(file, isLapB = false) {
  if (!file) return;

  const url = URL.createObjectURL(file);

  if (!isLapB) {
    state.video.hasVideo = true;
    state.video.file = file;
    state.video.videoUrl = url;

    if (dom.videoPlayer) {
      dom.videoPlayer.src = url;
      dom.videoPlayer.muted = state.video.audioMuted;
      dom.videoPlayer.load();
    }

    if (dom.videoDropzone) {
      dom.videoDropzone.style.display = 'none';
    }

    if (dom.lblHeaderVideoStatus) {
      dom.lblHeaderVideoStatus.textContent = '🎬 Video Synced';
    }

    // Default to split mode when video is loaded
    setVideoViewMode('split');

    // Default initial offset to 0.0s
    state.video.offsetSeconds = 0.0;
    updateOffsetDisplay();
  } else {
    state.video.videoLapB.hasVideo = true;
    state.video.videoLapB.file = file;
    state.video.videoLapB.videoUrl = url;

    if (dom.videoLapBPlayer) {
      dom.videoLapBPlayer.src = url;
      dom.videoLapBPlayer.muted = true;
      dom.videoLapBPlayer.load();
    }

    const dropB = document.getElementById('video-dropzone-b');
    if (dropB) dropB.style.display = 'none';
  }
}

function setVideoViewMode(mode) {
  state.video.viewMode = mode;
  const grid = document.querySelector('.workspace-grid');
  const panelVideo = dom.panelVideo;

  if (!grid || !panelVideo) return;

  // Update button active states
  if (dom.btnVideoViewMap) dom.btnVideoViewMap.classList.toggle('active', mode === 'map-only');
  if (dom.btnVideoViewSplit) dom.btnVideoViewSplit.classList.toggle('active', mode === 'split');
  if (dom.btnVideoViewVideo) dom.btnVideoViewVideo.classList.toggle('active', mode === 'video-only');
  if (dom.btnVideoViewPip) dom.btnVideoViewPip.classList.toggle('active', mode === 'pip');

  grid.classList.remove('video-split-active', 'video-primary-active');
  panelVideo.classList.remove('video-pip-mode');

  if (mode === 'map-only') {
    panelVideo.style.display = 'none';
    if (dom.mapContainer) dom.mapContainer.style.display = 'block';
  } else if (mode === 'split') {
    panelVideo.style.display = 'flex';
    grid.classList.add('video-split-active');
  } else if (mode === 'video-only') {
    panelVideo.style.display = 'flex';
    grid.classList.add('video-primary-active');
  } else if (mode === 'pip') {
    panelVideo.style.display = 'flex';
    panelVideo.classList.add('video-pip-mode');
  }

  // Trigger map and chart resizes
  setTimeout(() => {
    if (state.map) state.map.invalidateSize();
    if (typeof resizeCanvas === 'function') resizeCanvas();
    resizeVideoOverlayCanvas();
  }, 50);
}

function setVideoOffset(newOffset) {
  state.video.offsetSeconds = Math.round(newOffset * 1000) / 1000;
  updateOffsetDisplay();

  // Force video seek to updated position
  const curTelTime = state.records[state.currentIndex]?.time_s || 0;
  const targetVideoTime = curTelTime + state.video.offsetSeconds;
  if (dom.videoPlayer && isFinite(targetVideoTime) && targetVideoTime >= 0) {
    dom.videoPlayer.currentTime = targetVideoTime;
  }
}

function nudgeVideoOffset(delta) {
  setVideoOffset(state.video.offsetSeconds + delta);
}

function syncVideoToCurrentSf() {
  if (!state.records || state.records.length === 0) return;

  const currentLap = state.laps.find(l => l.lap_number === state.selectedLapNum) || state.laps[1];
  const sfTime = currentLap ? currentLap.start_time_s : 0;

  // Set offset so that at telemetry sfTime, video is at current video timestamp
  if (dom.videoPlayer) {
    const curVideoT = dom.videoPlayer.currentTime || 0;
    const newOffset = curVideoT - sfTime;
    setVideoOffset(newOffset);
  }
}

function updateOffsetDisplay() {
  if (dom.lblVideoOffset) {
    const s = state.video.offsetSeconds;
    const sign = s >= 0 ? '+' : '';
    dom.lblVideoOffset.textContent = `${sign}${s.toFixed(2)}s`;
  }
}

let lastVideoSyncSeekTime = 0;

function syncVideoPlayback(currentTimeS, isPlaying, playbackSpeed) {
  if (!state.video.hasVideo || !dom.videoPlayer) return;

  const vPlayer = dom.videoPlayer;
  const targetTime = currentTimeS + state.video.offsetSeconds;

  if (isFinite(targetTime) && targetTime >= 0 && vPlayer.duration && targetTime <= vPlayer.duration) {
    if (isPlaying) {
      if (vPlayer.paused) {
        vPlayer.currentTime = targetTime;
        vPlayer.playbackRate = playbackSpeed;
        vPlayer.play().catch(() => {});
      } else {
        const drift = targetTime - vPlayer.currentTime;
        // If huge drift (e.g. user jumped lap), hard seek once with throttle
        if (Math.abs(drift) > 0.8) {
          const now = performance.now();
          if (now - lastVideoSyncSeekTime > 400) {
            vPlayer.currentTime = targetTime;
            lastVideoSyncSeekTime = now;
          }
        } else if (Math.abs(drift) > 0.08) {
          // Soft rate micro-adjustment to smoothly catch up without seeking
          const nudgeRate = drift > 0 ? 1.06 : 0.94;
          vPlayer.playbackRate = playbackSpeed * nudgeRate;
        } else {
          vPlayer.playbackRate = playbackSpeed;
        }
      }
    } else {
      if (!vPlayer.paused) {
        vPlayer.pause();
      }
      // When paused or scrubbing, update currentTime cleanly
      if (Math.abs(vPlayer.currentTime - targetTime) > 0.033) {
        vPlayer.currentTime = targetTime;
      }
    }
  }

  // Draw Live HUD Canvas Overlay
  if (state.video.overlayEnabled) {
    drawLiveVideoOverlay();
  }

  // Compare Mode Dual Video Sync
  if (state.isCompareMode && state.video.videoLapB.hasVideo && dom.videoLapBPlayer) {
    const vLapB = dom.videoLapBPlayer;
    const targetB = currentTimeS + state.video.videoLapB.offsetSeconds;
    if (isFinite(targetB) && targetB >= 0 && vLapB.duration) {
      if (isPlaying) {
        if (vLapB.paused) {
          vLapB.currentTime = targetB;
          vLapB.playbackRate = playbackSpeed;
          vLapB.play().catch(() => {});
        } else {
          const driftB = targetB - vLapB.currentTime;
          if (Math.abs(driftB) > 0.8) {
            vLapB.currentTime = targetB;
          } else if (Math.abs(driftB) > 0.08) {
            vLapB.playbackRate = playbackSpeed * (driftB > 0 ? 1.06 : 0.94);
          } else {
            vLapB.playbackRate = playbackSpeed;
          }
        }
      } else {
        if (!vLapB.paused) vLapB.pause();
        if (Math.abs(vLapB.currentTime - targetB) > 0.033) {
          vLapB.currentTime = targetB;
        }
      }
    }
  }
}

function resizeVideoOverlayCanvas() {
  if (!dom.videoPlayer || !dom.videoOverlayCanvas) return;
  const rect = dom.videoPlayer.getBoundingClientRect();
  dom.videoOverlayCanvas.width = rect.width * (window.devicePixelRatio || 1);
  dom.videoOverlayCanvas.height = rect.height * (window.devicePixelRatio || 1);
}

/**
 * Draws crisp, broadcast-grade telemetry HUD overlay directly onto the video canvas
 */
function drawLiveVideoOverlay() {
  if (!dom.videoOverlayCanvas || !state.activeRecords || state.activeRecords.length === 0) return;

  const canvas = dom.videoOverlayCanvas;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const r = state.activeRecords[state.currentIndex];
  if (!r) return;

  const dpr = window.devicePixelRatio || 1;
  const s = (w / 800) * dpr;

  const spd = (r.speed_kmh || 0) * (state.unitMph ? 0.621371 : 1.0);
  const spdUnit = state.unitMph ? 'MPH' : 'KM/H';
  const rpm = r.rpm || 0;
  const gear = r.gear || 0;
  const tps = r.tps_pct || 0;
  const lean = r.lean_angle_deg || 0;
  const gLong = r.accel_long_g || 0;
  const gLat = r.accel_lat_g || 0;

  // =========================================================
  // 1. Lower Left: Cockpit Cluster (Speedometer, Gear, Lean)
  // =========================================================
  const clusterX = 24 * s;
  const clusterY = h - 110 * s;

  // Dark Matte Glassmorphic Background Card
  ctx.fillStyle = 'rgba(10, 13, 18, 0.78)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  ctx.roundRect(clusterX, clusterY, 210 * s, 85 * s, 8 * s);
  ctx.fill();
  ctx.stroke();

  // Speed Digits
  ctx.font = `900 ${36 * s}px "Outfit", sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(Math.round(spd), clusterX + 14 * s, clusterY + 10 * s);

  // Speed Unit
  ctx.font = `800 ${11 * s}px "Outfit", sans-serif`;
  ctx.fillStyle = '#00e5ff';
  ctx.fillText(spdUnit, clusterX + 14 * s, clusterY + 54 * s);

  // Gear Indicator
  ctx.font = `900 ${36 * s}px "Outfit", sans-serif`;
  ctx.fillStyle = '#d500f9';
  ctx.textAlign = 'center';
  ctx.fillText(gear === 0 ? 'N' : gear, clusterX + 115 * s, clusterY + 10 * s);

  ctx.font = `800 ${10 * s}px "Outfit", sans-serif`;
  ctx.fillStyle = '#62697d';
  ctx.fillText('GEAR', clusterX + 115 * s, clusterY + 54 * s);

  // Lean Angle Arc Gauge
  const leanGaugeX = clusterX + 172 * s;
  const leanGaugeY = clusterY + 36 * s;
  const gaugeR = 26 * s;

  // Base Arc
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.arc(leanGaugeX, leanGaugeY, gaugeR, Math.PI * 0.75, Math.PI * 2.25);
  ctx.stroke();

  // Active Lean Arc
  const leanAngleRad = Math.PI * 1.5 + (lean / 60) * (Math.PI * 0.5);
  ctx.strokeStyle = Math.abs(lean) > 42 ? '#ff0055' : '#ffd600';
  ctx.beginPath();
  ctx.arc(leanGaugeX, leanGaugeY, gaugeR, Math.PI * 1.5, leanAngleRad, lean < 0);
  ctx.stroke();

  ctx.font = `800 ${12 * s}px "Outfit", sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.abs(Math.round(lean))}°`, leanGaugeX, leanGaugeY + 4 * s);

  // =========================================================
  // 2. Throttle & Brake Bars (Right Side of Cluster)
  // =========================================================
  const barX = clusterX + 218 * s;
  const barH = 85 * s;
  const barW = 8 * s;

  // Throttle Bar (Green)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fillRect(barX, clusterY, barW, barH);
  ctx.fillStyle = '#00e676';
  const tpsFillH = (tps / 100) * barH;
  ctx.fillRect(barX, clusterY + barH - tpsFillH, barW, tpsFillH);

  // Brake Bar (Red)
  const brakeX = barX + 12 * s;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fillRect(brakeX, clusterY, barW, barH);
  if (gLong < -0.2) {
    const brakeIntensity = Math.min(1.0, Math.abs(gLong) / 1.5);
    ctx.fillStyle = '#ff1744';
    const brakeFillH = brakeIntensity * barH;
    ctx.fillRect(brakeX, clusterY + barH - brakeFillH, barW, brakeFillH);
  }

  // =========================================================
  // 3. Top Left: MotoGP Broadcast Timing Card Overlay
  // =========================================================
  if (state.motogp.showCard && typeof drawMotoGPOverlayCanvas === 'function') {
    const curLap = state.laps.find(l => l.lap_number === state.selectedLapNum) || state.laps[1];
    let timeDigits = '0:00.000';
    let deltaStr = '+0.000';
    let deltaColor = '#62697d';

    if (curLap) {
      const elapsed = Math.max(0, r.time_s - curLap.start_time_s);
      timeDigits = formatLapTimePrecision(elapsed);

      // Delta against best lap
      const bestLap = state.laps.find(l => l.is_best);
      if (bestLap && bestLap.lap_number !== curLap.lap_number) {
        const delta = elapsed - (bestLap.duration_s * (elapsed / Math.max(0.1, curLap.duration_s)));
        const sign = delta >= 0 ? '+' : '-';
        deltaStr = `${sign}${Math.abs(delta).toFixed(3)}`;
        deltaColor = delta <= 0 ? '#00e676' : '#ff1744';
      }
    }

    const cardW = 320 * s;
    const cardH = 92 * s;
    ctx.save();
    ctx.translate(24 * s, 24 * s);

    // Render timing card
    drawMotoGPOverlayCanvas(
      ctx,
      cardW,
      cardH,
      state.motogp.riderName,
      state.motogp.bikeName,
      state.motogp.riderNum,
      state.motogp.tyreFront,
      state.motogp.tyreRear,
      state.motogp.badgeColor,
      timeDigits,
      deltaStr,
      deltaColor,
      '#ffffff',
      [curLap?.sectors?.[0] ? 'good' : 'pending', curLap?.sectors?.[1] ? 'good' : 'pending', curLap?.sectors?.[2] ? 'good' : 'pending'],
      0.5,
      false,
      'transparent',
      1.0 * s
    );
    ctx.restore();
  }
}

function formatLapTimePrecision(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}
