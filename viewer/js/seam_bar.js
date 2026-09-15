/**
 * seam_bar.js - Modular Vertical Seam Data Bar Motion Graphics Engine
 * Ducati DDA Telemetry & GPS Visualizer
 *
 * Designed for 16:9 split camera layouts (4:3 Front Cam + Vertical 9:16 Rear Cam).
 * Features:
 *  - Authentic MotoGP-style Rider & Timing Card with colored sector progress and expanding lap drawer.
 *  - Floating smoothed single-lap Circuit Map with glowing Ducati red bike dot.
 *  - High-tech horizontal scrolling Turn Ticker with bracketed active turn and distance-to-apex.
 *  - Unified circular G-Meter & Rotating Multi-Zone Lean Angle Instrument.
 *  - Precision dual Throttle & Brake strips.
 */

/**
 * Main entry point: Renders the entire vertical seam bar onto a canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx - 2D context to render to
 * @param {number} barW - Total width of the bar (e.g. 180 - 220px)
 * @param {number} barH - Total height of the bar (e.g. 1080px or 2160px)
 * @param {Object} frameData - Complete telemetry and session state for the frame
 * @param {Object} config - User configuration (active modules, order, opacity, dotColor, etc.)
 * @param {number} animTime - Animation elapsed time in seconds (0.0 to >= 2.5)
 */
function drawSeamBarCanvas(ctx, barW, barH, frameData, config, animTime = 2.5) {
  ctx.clearRect(0, 0, barW, barH);

  if (animTime <= 0) return;

  const conf = config || {};
  const s = barW / 200.0; // Scale factor based on baseline 200px width
  const glassAlpha = conf.glassOpacity !== undefined ? conf.glassOpacity : 0.68;
  const dotColor = conf.dotColor || '#e10600'; // Default Ducati Red

  // Geometry: Background spans full frame height with signature chamfers
  const bgX = Math.round(2 * s);
  const bgY = Math.round(4 * s);
  const bgW = barW - Math.round(4 * s);
  const bgH = barH - Math.round(8 * s);

  // Left Aero Spine zone (Red stripe + Rotated 90deg text + White speed blade)
  const spineW = Math.round(25 * s);
  const padLeft = bgX + spineW + Math.round(6 * s);
  const padRight = Math.round(6 * s);
  const cardW = barW - padLeft - padRight;
  const gapY = Math.round(8 * s);

  const enabledMap = conf.enabled || {
    motogp: true,
    timing: true,
    map: true,
    turn: true,
    gmeter: true,
    pedals: true
  };

  // Top Cluster: MotoGP Timing Card + Expanding Lap History Drawer
  const completedLaps = (frameData.timing && frameData.timing.completedLaps) || [];
  const numDisplayLaps = Math.min(3, completedLaps.length);
  const drawerH = numDisplayLaps > 0 ? Math.round((numDisplayLaps * 20 + 24) * s) : 0;
  const timingBaseH = Math.round(58 * s);
  const motogpTotalH = timingBaseH + drawerH;

  // Bottom Cluster: Map, Turn Ticker, G-Meter & Lean Arc, Pedals (Pinned to bottom of video frame)
  const bottomModuleHeights = {
    map: Math.round(136 * s),
    turn: Math.round(48 * s),
    gmeter: Math.round(156 * s),
    pedals: Math.round(44 * s)
  };

  const bottomOrder = ['map', 'turn', 'gmeter', 'pedals'].filter(k => enabledMap[k] !== false);
  let bottomStackH = 0;
  bottomOrder.forEach(k => {
    bottomStackH += bottomModuleHeights[k];
  });
  if (bottomOrder.length > 1) {
    bottomStackH += (bottomOrder.length - 1) * gapY;
  }

  const bottomPadY = Math.round(14 * s);
  // Calculate bottom cluster start Y (ensuring it never overlaps the top cluster even on small preview screens)
  const topClusterEndY = Math.round(10 * s) + motogpTotalH;
  const bottomStartY = Math.max(topClusterEndY + Math.round(24 * s), barH - bottomPadY - bottomStackH);

  ctx.save();

  // 1. Draw unified vertical racing background element spanning full frame height
  drawVerticalRacingBackground(ctx, bgX, bgY, bgW, bgH, animTime, s, glassAlpha, frameData.rider);

  const isIntro = animTime < 2.5;

  // 2. Render Top Cluster: Timing Card & Expanding Previous Laps Drawer (Slides in from left)
  const showTiming = enabledMap.motogp !== false && enabledMap.timing !== false;
  if (showTiming) {
    const topStartT = 1.15;
    const topDur = 0.40;
    let topAnim = 1.0;
    if (isIntro) {
      if (animTime < topStartT) topAnim = 0.0;
      else if (animTime < topStartT + topDur) {
        const u = (animTime - topStartT) / topDur;
        topAnim = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      } else topAnim = 1.0;
    }

    if (topAnim > 0) {
      ctx.save();
      if (isIntro && topAnim < 1.0) {
        // Slide in from behind the left aero spine
        ctx.translate((topAnim - 1) * 36 * s, 0);
        ctx.globalAlpha = topAnim;
      }
      drawMotoGPTimingCard(ctx, padLeft, Math.round(10 * s), cardW, motogpTotalH, frameData.rider, frameData.timing, s, glassAlpha, animTime, drawerH, numDisplayLaps);
      ctx.restore();
    }
  }

  // 3. Render Bottom Cluster: Pinned to bottom of the 1080p/4K frame
  // Each widget handles its own high-tech bespoke entrance choreography
  let curBottomY = bottomStartY;
  bottomOrder.forEach((modKey) => {
    const modH = bottomModuleHeights[modKey];
    const modX = padLeft;
    const modY = curBottomY;

    ctx.save();
    switch (modKey) {
      case 'map':
        drawFloatingTrackMap(ctx, modX, modY, cardW, modH, frameData.map, s, dotColor, animTime);
        break;
      case 'turn':
        drawScrollingTurnTicker(ctx, modX, modY, cardW, modH, frameData.turn, s, animTime);
        break;
      case 'gmeter':
        drawUnifiedGAndLeanInstrument(ctx, modX, modY, cardW, modH, frameData.gmeter, frameData.lean, s, animTime);
        break;
      case 'pedals':
        drawThrottleBrakeCard(ctx, modX, modY, cardW, modH, frameData.pedals, s, glassAlpha, animTime);
        break;
    }
    ctx.restore();

    curBottomY += modH + gapY;
  });

  ctx.restore();
}

/**
 * Draws an integrated vertical structural racing background with a White, Red, and Black motif.
 * Choreography:
 *  1. Left Aero Spine (red stripe, white speed blade, rotated typography, number badge) wipes UP from the bottom (0.00s -> 0.90s).
 *  2. Carbon-dark frosted glass backplate slides out to the right from behind the spine (0.85s -> 1.25s).
 */
function drawVerticalRacingBackground(ctx, x, y, w, h, animTime, s, glassAlpha = 0.68, riderData = null) {
  if (h <= 10) return;

  const isIntro = animTime < 2.5;
  const chamfer = Math.round(14 * s);

  const stripeW = Math.round(4.5 * s);
  const stripeX = x + Math.round(2 * s);
  const topChevronY = y + Math.round(12 * s);
  const btmChevronY = y + h - Math.round(14 * s);

  const bladeW = Math.round(1.6 * s);
  const bladeX = x + Math.round(25 * s);
  const bladeTopY = y + Math.round(16 * s);
  const bladeBtmY = y + h - Math.round(18 * s);
  const spineW = (bladeX + bladeW + Math.round(3 * s)) - x;

  // ---------------------------------------------------------------------------
  // 1. CARBON-DARK FROSTED GLASS BACKPLATE (Slides out to right: 0.85s -> 1.25s)
  // ---------------------------------------------------------------------------
  let bgSlide = 1.0;
  if (isIntro) {
    if (animTime < 0.85) bgSlide = 0;
    else if (animTime < 1.25) {
      const u = (animTime - 0.85) / 0.40;
      bgSlide = u * u * (3 - 2 * u); // Smooth Hermite ease
    } else {
      bgSlide = 1.0;
    }
  }

  if (bgSlide > 0) {
    ctx.save();
    // Expanding clip from behind the spine to full width
    const curPlateW = spineW + (w - spineW) * bgSlide;
    ctx.beginPath();
    ctx.rect(x - 2 * s, y - 2 * s, curPlateW + 4 * s, h + 4 * s);
    ctx.clip();

    // Angled polygon with beveled top-right and bottom-left chamfers
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - chamfer, y);
    ctx.lineTo(x + w, y + chamfer);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + chamfer, y + h);
    ctx.lineTo(x, y + h - chamfer);
    ctx.closePath();

    // Dark glass fill with subtle carbon gradient
    const bgGrad = ctx.createLinearGradient(x, y, x + w, y + h);
    bgGrad.addColorStop(0, `rgba(12, 16, 24, ${Math.min(0.88, glassAlpha + 0.18)})`);
    bgGrad.addColorStop(0.5, `rgba(8, 10, 16, ${Math.min(0.82, glassAlpha + 0.14)})`);
    bgGrad.addColorStop(1, `rgba(5, 7, 12, ${Math.min(0.92, glassAlpha + 0.22)})`);
    ctx.fillStyle = bgGrad;
    ctx.fill();

    // Subtle 1px boundary stroke
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.stroke();

    // Faint diagonal technical pinstripes in upper section
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let py = y + 10 * s; py < y + Math.min(h, 240 * s); py += 12 * s) {
      ctx.beginPath();
      ctx.moveTo(x + 10 * s, py);
      ctx.lineTo(x + w - 10 * s, py + 18 * s);
      ctx.stroke();
    }
    ctx.restore();

    // Top-Right Angled Winglet Notch along the 45° cut
    if (bgSlide > 0.85) {
      const notchAlpha = Math.min(1.0, (bgSlide - 0.85) / 0.15);
      ctx.save();
      ctx.globalAlpha = notchAlpha;
      ctx.beginPath();
      ctx.moveTo(x + w - chamfer - 8 * s, y);
      ctx.lineTo(x + w - chamfer, y);
      ctx.lineTo(x + w, y + chamfer);
      ctx.lineTo(x + w, y + chamfer + 8 * s);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.restore();
    }

    // High-tech glowing cyan laser sweep line along leading edge
    if (isIntro && bgSlide < 1.0 && bgSlide > 0.02) {
      const sweepX = x + curPlateW;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sweepX, y);
      ctx.lineTo(sweepX, y + h);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
      ctx.lineWidth = 2 * s;
      ctx.shadowColor = 'rgba(0, 229, 255, 0.9)';
      ctx.shadowBlur = 8 * s;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // 2. LEFT AERO SPINE: Wipes UP from the bottom (0.00s -> 0.90s)
  // ---------------------------------------------------------------------------
  let spineWipeUp = 1.0;
  if (isIntro) {
    if (animTime <= 0) spineWipeUp = 0;
    else if (animTime < 0.90) {
      const u = animTime / 0.90;
      spineWipeUp = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // Snappy cubic ease
    } else {
      spineWipeUp = 1.0;
    }
  }

  if (spineWipeUp > 0) {
    ctx.save();
    // Vertical wipe-up clipping mask: starts at bottom (y + h) and wipes upward
    const clipTopY = y + h * (1 - spineWipeUp);
    const clipH = h * spineWipeUp + 2 * s;
    ctx.beginPath();
    ctx.rect(x - 4 * s, clipTopY, spineW + 8 * s, clipH);
    ctx.clip();

    // High-contrast dark spine backing behind red & white strips
    ctx.fillStyle = 'rgba(8, 10, 16, 0.72)';
    ctx.beginPath();
    ctx.rect(x, clipTopY, spineW, clipH);
    ctx.fill();

    // --- Red Racing Stripe ---
    ctx.beginPath();
    ctx.moveTo(stripeX, topChevronY + Math.round(6 * s));
    ctx.lineTo(stripeX + stripeW, topChevronY);
    ctx.lineTo(stripeX + stripeW, btmChevronY);
    ctx.lineTo(stripeX, btmChevronY - Math.round(6 * s));
    ctx.closePath();

    const redGrad = ctx.createLinearGradient(stripeX, y, stripeX, y + h);
    redGrad.addColorStop(0, '#ff1744');
    redGrad.addColorStop(0.2, '#e10600');
    redGrad.addColorStop(0.8, '#d50000');
    redGrad.addColorStop(1, '#9b0000');
    ctx.fillStyle = redGrad;

    ctx.shadowColor = 'rgba(225, 6, 0, 0.45)';
    ctx.shadowBlur = 6 * s;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Inner bright red core line
    ctx.beginPath();
    ctx.moveTo(stripeX + stripeW - 1 * s, topChevronY + 2 * s);
    ctx.lineTo(stripeX + stripeW - 1 * s, btmChevronY - 2 * s);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1 * s;
    ctx.stroke();

    // --- White Speed Blade & Bottom Chevrons ---
    ctx.beginPath();
    ctx.moveTo(bladeX, bladeTopY);
    ctx.lineTo(bladeX, bladeBtmY);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = bladeW;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
    ctx.shadowBlur = 4 * s;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Bottom-Left Angled Chevron Accent along the bottom cut
    ctx.beginPath();
    ctx.moveTo(x, y + h - chamfer - 8 * s);
    ctx.lineTo(x, y + h - chamfer);
    ctx.lineTo(x + chamfer, y + h);
    ctx.lineTo(x + chamfer + 8 * s, y + h);
    ctx.strokeStyle = '#e10600';
    ctx.lineWidth = 2.2 * s;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + chamfer + 10 * s, y + h);
    ctx.lineTo(x + chamfer + 18 * s, y + h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * s;
    ctx.stroke();

    // --- Rotated 90° Typography running UP the vertical rail ---
    const r = riderData || {};
    const riderName = (r.riderName || 'SLOW FAST GUY').toUpperCase();
    const bikeName = r.bikeName || 'SFV2';
    const shortBike = formatShortBikeModel(bikeName);

    const badgeH = Math.round(24 * s);
    const badgeY = y + Math.round(10 * s);
    const railCenterX = (stripeX + stripeW + bladeX) / 2;
    const spineTopY = badgeY + badgeH + Math.round(16 * s);
    const spineBtmY = y + h - Math.round(28 * s);
    const spineCenterY = (spineTopY + spineBtmY) / 2;

    ctx.save();
    ctx.translate(railCenterX, spineCenterY);
    ctx.rotate(-Math.PI / 2); // Rotated 90° counter-clockwise: reads UP the spine

    ctx.font = `900 ${9.5 * s}px "Outfit", sans-serif`;
    ctx.textBaseline = 'middle';

    const seg1 = riderName;
    const seg2 = '  //  ';
    const seg3 = shortBike;
    const w1 = ctx.measureText(seg1).width;
    const w2 = ctx.measureText(seg2).width;
    const w3 = ctx.measureText(seg3).width;
    const totalSpineW = w1 + w2 + w3;

    let curTx = -totalSpineW / 2;
    ctx.textAlign = 'left';

    ctx.fillStyle = '#ffffff';
    ctx.fillText(seg1, curTx, 0);
    curTx += w1;

    ctx.fillStyle = '#e10600';
    ctx.fillText(seg2, curTx, 0);
    curTx += w2;

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(seg3, curTx, 0);
    ctx.restore();

    ctx.restore(); // end spine wipe clip
  }

  // ---------------------------------------------------------------------------
  // 3. RIDER NUMBER BADGE: Pops and settles at top of spine (0.70s -> 0.95s)
  // ---------------------------------------------------------------------------
  let badgeAnim = 1.0;
  if (isIntro) {
    if (animTime < 0.70) badgeAnim = 0;
    else if (animTime < 0.95) {
      const ub = (animTime - 0.70) / 0.25;
      badgeAnim = ub < 0.5 ? 4 * ub * ub * ub : 1 - Math.pow(-2 * ub + 2, 3) / 2;
    } else {
      badgeAnim = 1.0;
    }
  }

  if (badgeAnim > 0) {
    const r = riderData || {};
    const riderNum = (r.riderNum || '512').toString();
    const badgeColor = r.badgeColor || '#e10600';

    const badgeX = stripeX;
    const badgeY = y + Math.round(10 * s);
    const badgeW = (bladeX + bladeW) - stripeX;
    const badgeH = Math.round(24 * s);
    const rBadge = Math.round(3.5 * s);

    ctx.save();
    if (isIntro && badgeAnim < 1.0) {
      // Subtle scale-pop from center
      const bCenterCX = badgeX + badgeW / 2;
      const bCenterCY = badgeY + badgeH / 2;
      ctx.translate(bCenterCX, bCenterCY);
      const scalePop = 0.80 + 0.20 * badgeAnim;
      ctx.scale(scalePop, scalePop);
      ctx.translate(-bCenterCX, -bCenterCY);
      ctx.globalAlpha = badgeAnim;
    }

    ctx.beginPath();
    roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, rBadge);
    ctx.fillStyle = badgeColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = `900 ${14 * s}px "Outfit", sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(riderNum, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5 * s);
    ctx.restore();
  }
}

/**
 * Helper: Draws a frosted dark glass card with subtle border
 */
function drawGlassCard(ctx, x, y, w, h, radius, isSolid = false, glassAlpha = 0.68) {
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, radius);

  if (isSolid) {
    ctx.fillStyle = '#0a0d14';
    ctx.fill();
  } else if (glassAlpha > 0) {
    ctx.fillStyle = `rgba(10, 13, 20, ${glassAlpha})`;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.stroke();
  }
  ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// =============================================================================
// HELPER: SHORTEN MOTORCYCLE MODEL (MAX 3-4 CHARACTERS)
// =============================================================================
function formatShortBikeModel(bikeStr) {
  if (!bikeStr) return 'V2';
  let str = bikeStr.trim().toUpperCase();
  const brands = ['DUCATI', 'YAMAHA', 'HONDA', 'KAWASAKI', 'SUZUKI', 'BMW', 'KTM', 'APRILIA', 'TRIUMPH'];
  for (const b of brands) {
    if (str.startsWith(b + ' ')) {
      str = str.substring(b.length + 1).trim();
      break;
    }
  }
  if (str.includes('STREETFIGHTER V2') || str === 'STREETFIGHTER V2' || str === 'SF V2') return 'SFV2';
  if (str.includes('STREETFIGHTER V4') || str === 'STREETFIGHTER V4' || str === 'SF V4') return 'SFV4';
  if (str.includes('PANIGALE V4R') || str === 'PANIGALE V4 R') return 'V4R';
  if (str.includes('PANIGALE V4S')) return 'V4S';
  if (str.includes('PANIGALE V4')) return 'V4';
  if (str.includes('PANIGALE V2')) return 'V2';
  if (str.includes('PANIGALE')) return 'PANI';
  if (str.includes('MONSTER')) return 'M937';

  const compact = str.replace(/[\s-_]+/g, '');
  if (compact.length <= 4) return compact;

  const words = str.split(/[\s-_]+/);
  if (words.length >= 2) {
    let acronym = '';
    words.forEach(w => { if (w.length > 0) acronym += w[0]; });
    const lastWord = words[words.length - 1];
    if (/^[0-9VvRr]+$/.test(lastWord) && acronym.length + lastWord.length <= 4) {
      acronym = acronym.slice(0, -1) + lastWord;
    }
    if (acronym.length >= 2 && acronym.length <= 4) return acronym.toUpperCase();
  }
  return compact.slice(0, 4).toUpperCase();
}

// =============================================================================
// WIDGET 1: MOTOGP RIDER & TIMING CARD WITH EXPANDING DRAWER
// =============================================================================
function drawMotoGPTimingCard(ctx, x, y, w, h, riderData, timingData, s, glassAlpha, animTime, drawerH, numDisplayLaps) {
  const r = riderData || {};
  const t = timingData || {};
  const baseH = Math.round(58 * s);
  const chamfer = Math.round(10 * s);
  const topChamfer = Math.round(14 * s);
  const isDrawerOpen = drawerH > 2 && numDisplayLaps > 0;

  ctx.save();

  // ---------------------------------------------------------------------------
  // 1. STREAMLINED TIMING CARD (Rider & Number live on the Left Aero Spine)
  // ---------------------------------------------------------------------------
  // Base Card Background (Top-right chamfer matches background cut, bottom-right chamfer if drawer closed)
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - topChamfer, y);
  ctx.lineTo(x + w, y + topChamfer);
  if (!isDrawerOpen) {
    ctx.lineTo(x + w, y + baseH - chamfer);
    ctx.lineTo(x + w - chamfer, y + baseH);
  } else {
    ctx.lineTo(x + w, y + baseH);
  }
  ctx.lineTo(x, y + baseH);
  ctx.closePath();

  // Dark glass fill with subtle racing border
  ctx.fillStyle = `rgba(10, 13, 20, ${Math.min(0.92, glassAlpha + 0.12)})`;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.stroke();

  // Check Finish State
  const finishState = t.finishState;
  if (finishState && finishState.isFinished) {
    // Authentic Centered Lap Time
    ctx.font = `900 ${24 * s}px "JetBrains Mono", monospace`;
    ctx.fillStyle = finishState.isFastest ? '#ff1744' : (finishState.deltaColor || '#ff8c00');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(finishState.lapTimeStr || t.timeStr || '0:00.000', x + w / 2, y + 20 * s);

    // Centered Delta in Footer
    if (finishState.deltaStr) {
      ctx.font = `900 ${11.5 * s}px "JetBrains Mono", monospace`;
      ctx.fillStyle = finishState.deltaColor || '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(finishState.deltaStr, x + w / 2, y + baseH - 12 * s);
    }
  } else {
    // Normal Live Running Lap:
    // Row 1: Lap Time Digits (Left) & Delta (Right - only shown at sector splits)
    const midY = y + Math.round(19 * s);
    const gatePop = typeof t.isGateHighlight === 'number'
      ? Math.max(0, Math.min(1, t.isGateHighlight))
      : (t.isGateHighlight ? 1.0 : (t.hasSplit ? 1.0 : 0.0));

    const hasDelta = t.hasSplit && t.deltaStr && (typeof t.deltaStr === 'string') && t.deltaStr.trim().length > 0 && gatePop > 0.01;
    const timeColor = t.isFastest ? '#ff1744' : (t.timeColor || '#ff8c00');
    const timerStr = t.timeStr || '0:00.000';

    if (!hasDelta) {
      // Clean running lap: Only display the timer digits, full card width available with zero clutter
      const timerFontSize = Math.round(20 * s);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${timerFontSize}px "JetBrains Mono", monospace`;
      ctx.fillStyle = timeColor;
      ctx.fillText(timerStr, x + 8 * s, midY);
    } else {
      // Sector Split Pop: Display frozen split time + split delta
      const deltaStr = t.deltaStr;
      const deltaColor = t.deltaColor || '#8e94a5';

      let tSize = Math.round((20 - 7 * gatePop) * s);
      let dSize = Math.round((12 + 6 * gatePop) * s);

      // Measure text to guarantee zero overlap even if difference is 10+ seconds (+14.250, etc.)
      ctx.font = `900 ${tSize}px "JetBrains Mono", monospace`;
      let tW = ctx.measureText(timerStr).width;
      ctx.font = `800 ${dSize}px "JetBrains Mono", monospace`;
      let dW = ctx.measureText(deltaStr).width;

      const availW = w - 18 * s;
      const minGap = 6 * s;

      if (tW + dW + minGap > availW) {
        const scaleFit = availW / (tW + dW + minGap);
        tSize = Math.max(8 * s, Math.floor(tSize * scaleFit));
        dSize = Math.max(8 * s, Math.floor(dSize * scaleFit));
      }

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${tSize}px "JetBrains Mono", monospace`;
      ctx.fillStyle = timeColor;
      ctx.fillText(timerStr, x + 8 * s, midY);

      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${dSize}px "JetBrains Mono", monospace`;
      ctx.fillStyle = deltaColor;
      if (gatePop > 0.3) {
        ctx.shadowColor = deltaColor;
        ctx.shadowBlur = 6 * s * gatePop;
        ctx.fillText(deltaStr, x + w - 10 * s, midY);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillText(deltaStr, x + w - 10 * s, midY);
      }
    }

    // Row 2: Tyre Pills (Left) + MotoGP Sectors Track (Right)
    const footCenterY = y + baseH - Math.round(13 * s);
    const tf = ((r.tyreFront || 'M').toString()).toUpperCase();
    const tr = ((r.tyreRear || 'S').toString()).toUpperCase();
    const pillH = Math.round(12 * s);
    const pillY = Math.round(footCenterY - pillH / 2);

    // Front Tyre
    const pill1W = Math.round((tf.length <= 1 ? 14 : 19) * s);
    const pill1X = Math.round(x + 8 * s);
    ctx.fillStyle = '#1e222d';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRectPath(ctx, pill1X, pillY, pill1W, pillH, 3.5 * s);
    ctx.fill();
    ctx.stroke();

    ctx.font = `900 ${7.5 * s}px "Inter", "Outfit", sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tf, pill1X + pill1W / 2, pillY + pillH / 2 + 0.5 * s);

    // Rear Tyre
    const pill2W = Math.round((tr.length <= 1 ? 14 : 19) * s);
    const pill2X = pill1X + pill1W + Math.round(3 * s);
    ctx.fillStyle = '#1e222d';
    ctx.beginPath();
    roundRectPath(ctx, pill2X, pillY, pill2W, pillH, 3.5 * s);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(tr, pill2X + pill2W / 2, pillY + pillH / 2 + 0.5 * s);

    // Sectors Track Bar (Right of tyres)
    const secStartX = pill2X + pill2W + Math.round(8 * s);
    const secTotalW = (x + w - Math.round(8 * s)) - secStartX;
    const secH = Math.round(4.5 * s);
    const secY = Math.round(footCenterY - secH / 2);

    const numSecs = (t.sectors && t.sectors.length > 0) ? t.sectors.length : 3;
    const secGap = Math.round(2 * s);
    const secBlockW = (secTotalW - (numSecs - 1) * secGap) / numSecs;

    for (let si = 0; si < numSecs; si++) {
      const sbX = secStartX + si * (secBlockW + secGap);
      const secObj = (t.sectors && t.sectors[si]) ? t.sectors[si] : null;
      const secColor = secObj ? secObj.color : '#2a2e3c';

      ctx.fillStyle = secColor;
      ctx.beginPath();
      roundRectPath(ctx, sbX, secY, secBlockW, secH, 1.5 * s);
      ctx.fill();
    }

    // Live Tic Cursor
    const ticPos = t.lapProgressFrac !== undefined ? Math.max(0, Math.min(1, t.lapProgressFrac)) : 0.45;
    const ticX = secStartX + secTotalW * ticPos;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 4 * s;
    ctx.fillRect(ticX - 1 * s, secY - 1.5 * s, 2 * s, secH + 3 * s);
    ctx.shadowBlur = 0;
  }

  // ---------------------------------------------------------------------------
  // 2. EXPANDING PREVIOUS LAPS DRAWER (DROPS DOWN OUT OF BOTTOM)
  // ---------------------------------------------------------------------------
  if (isDrawerOpen) {
    const drawerY = y + baseH;
    const dH = drawerH;

    ctx.save();
    // Drawer container with signature bottom-right chamfer
    ctx.beginPath();
    ctx.moveTo(x, drawerY);
    ctx.lineTo(x + w, drawerY);
    ctx.lineTo(x + w, drawerY + dH - chamfer);
    ctx.lineTo(x + w - chamfer, drawerY + dH);
    ctx.lineTo(x, drawerY + dH);
    ctx.closePath();

    ctx.fillStyle = `rgba(6, 8, 14, ${Math.min(0.94, glassAlpha + 0.22)})`;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.stroke();

    // Clip contents inside drawer container path immediately
    ctx.clip();

    // Subtle seam divider at joint
    ctx.beginPath();
    ctx.moveTo(x + 4 * s, drawerY);
    ctx.lineTo(x + w - 4 * s, drawerY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Drawer Header
    ctx.font = `800 ${7.5 * s}px "Outfit", sans-serif`;
    ctx.fillStyle = '#8e94a5';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('PREVIOUS LAPS', x + 8 * s, drawerY + 6 * s);

    // Completed Laps Rows
    const startIdx = Math.max(0, t.completedLaps.length - numDisplayLaps);
    const lapsToShow = t.completedLaps.slice(startIdx);
    const rowH = Math.round(20 * s);

    lapsToShow.forEach((l, idx) => {
      const rowY = drawerY + Math.round(18 * s) + idx * rowH;

      // Subtle row divider between laps
      if (idx > 0) {
        ctx.beginPath();
        ctx.moveTo(x + 8 * s, rowY - 2 * s);
        ctx.lineTo(x + w - 8 * s, rowY - 2 * s);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Column 1: Lap number tag
      ctx.font = `800 ${9 * s}px "JetBrains Mono", monospace`;
      ctx.fillStyle = '#a5b4fc';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`L${l.lapNumber}`, x + 8 * s, rowY + 7 * s);

      // Column 2: Lap Time
      ctx.font = `700 ${9.5 * s}px "JetBrains Mono", monospace`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(l.lapTimeStr, x + 36 * s, rowY + 7 * s);

      // Column 3: PB Badge or Delta
      if (l.isPb) {
        const pillW = Math.round(32 * s);
        const pillH = Math.round(13 * s);
        const pillX = x + w - pillW - Math.round(8 * s);
        const pillY = rowY + Math.round(7 * s) - pillH / 2;

        ctx.fillStyle = 'rgba(111, 45, 189, 0.45)';
        ctx.beginPath();
        roundRectPath(ctx, pillX, pillY, pillW, pillH, 3 * s);
        ctx.fill();
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.font = `800 ${7.5 * s}px "Outfit", sans-serif`;
        ctx.fillStyle = '#f3e8ff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★ PB', pillX + pillW / 2, pillY + pillH / 2 + 0.5 * s);
      } else {
        ctx.font = `800 ${8.5 * s}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#8e94a5';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(l.deltaStr, x + w - 8 * s, rowY + 7 * s);
      }
    });

    ctx.restore();
  }

  ctx.restore();
}

// =============================================================================
// WIDGET 2: FLOATING SMOOTHED CIRCUIT MAP & GLOWING BIKE DOT (>= 75% CARD WIDTH)
// =============================================================================
function drawFloatingTrackMap(ctx, x, y, w, h, mapData, s, dotColor = '#e10600', animTime = 2.5) {
  const d = mapData || {};
  const isIntro = animTime < 2.5;

  // Intro choreography:
  // 1. Progressive circuit trace draw: 1.35s -> 2.00s
  let drawFrac = 1.0;
  if (isIntro) {
    if (animTime < 1.35) drawFrac = 0.0;
    else if (animTime < 2.00) {
      const u = (animTime - 1.35) / 0.65;
      drawFrac = u * u * (3 - 2 * u);
    } else {
      drawFrac = 1.0;
    }
  }

  // 2. Track name header fades in: 1.85s -> 2.20s
  let hdrAlpha = 1.0;
  if (isIntro) {
    if (animTime < 1.85) hdrAlpha = 0.0;
    else if (animTime < 2.20) {
      hdrAlpha = (animTime - 1.85) / 0.35;
    } else {
      hdrAlpha = 1.0;
    }
  }

  // 3. Bike dot fades in: 1.95s -> 2.25s
  let bikeAlpha = 1.0;
  if (isIntro) {
    if (animTime < 1.95) bikeAlpha = 0.0;
    else if (animTime < 2.25) {
      bikeAlpha = (animTime - 1.95) / 0.30;
    } else {
      bikeAlpha = 1.0;
    }
  }

  ctx.save();

  // Clean Header Tag: Track Name (fades in 1.30s -> 1.65s)
  if (hdrAlpha > 0) {
    const rawTitle = d.trackName || (state.sessionInfo && state.sessionInfo.track) || 'THUNDERHILL RACEWAY';
    let trackTitle = rawTitle.toUpperCase();

    ctx.save();
    ctx.globalAlpha = hdrAlpha;
    ctx.font = `800 ${8 * s}px "Outfit", sans-serif`;
    ctx.fillStyle = '#8e94a5';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const maxTitleW = w - 12 * s;
    if (ctx.measureText(trackTitle).width > maxTitleW) {
      trackTitle = trackTitle.replace(/\s*\(.*?\)/, '').trim();
      if (ctx.measureText(trackTitle).width > maxTitleW) {
        while (trackTitle.length > 5 && ctx.measureText(trackTitle + '…').width > maxTitleW) {
          trackTitle = trackTitle.slice(0, -1);
        }
        trackTitle += '…';
      }
    }
    ctx.fillText(trackTitle, x + 6 * s, y + 2 * s);
    ctx.restore();
  }

  // Scaled & Centered 2D Track: Widen to take at least 3/4 (82%) of card width
  const mapY = y + 16 * s;
  const mapH = h - 22 * s;

  if (d.pathPoints && d.pathPoints.length > 2 && drawFrac > 0) {
    const pts = d.pathPoints;
    let minPX = Infinity, maxPX = -Infinity, minPY = Infinity, maxPY = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i][0] < minPX) minPX = pts[i][0];
      if (pts[i][0] > maxPX) maxPX = pts[i][0];
      if (pts[i][1] < minPY) minPY = pts[i][1];
      if (pts[i][1] > maxPY) maxPY = pts[i][1];
    }
    const spanPX = maxPX - minPX || 0.001;
    const spanPY = maxPY - minPY || 0.001;

    // Scale so that track width takes at least 82% of card width
    const targetW = w * 0.82;
    const targetH = mapH - 4 * s;
    const scale = Math.min(targetW / spanPX, targetH / spanPY);
    const trackW = spanPX * scale;
    const trackH = spanPY * scale;

    const trackX = x + (w - trackW) / 2 - minPX * scale;
    const trackY = mapY + (mapH - trackH) / 2 - minPY * scale;

    // Determine how many points to draw along the circuit loop
    const numPtsToDraw = Math.max(2, Math.min(pts.length, Math.floor(pts.length * drawFrac)));
    const isFullLoop = drawFrac >= 1.0;

    // 1. Draw Progressive Circuit Trace
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(trackX + pts[0][0] * scale, trackY + pts[0][1] * scale);
    for (let i = 1; i < numPtsToDraw; i++) {
      ctx.lineTo(trackX + pts[i][0] * scale, trackY + pts[i][1] * scale);
    }
    if (isFullLoop) {
      ctx.closePath();
    }

    // Soft outer shadow/glow
    ctx.lineWidth = 5 * s;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Main sharp track line
    ctx.lineWidth = 2.8 * s;
    ctx.strokeStyle = '#475569';
    ctx.stroke();

    // Inner subtle neon core
    ctx.lineWidth = 1.0 * s;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.stroke();
    ctx.restore();

    // Leading glowing spark while track is actively being laser-drawn
    if (!isFullLoop && numPtsToDraw > 1) {
      const leadPt = pts[numPtsToDraw - 1];
      const lx = trackX + leadPt[0] * scale;
      const ly = trackY + leadPt[1] * scale;

      ctx.save();
      const sparkGrad = ctx.createRadialGradient(lx, ly, 0.5 * s, lx, ly, 6.5 * s);
      sparkGrad.addColorStop(0, '#ffffff');
      sparkGrad.addColorStop(0.4, '#00e5ff');
      sparkGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
      ctx.fillStyle = sparkGrad;
      ctx.beginPath();
      ctx.arc(lx, ly, 6.5 * s, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(lx, ly, 2 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 2. Start / Finish Line (Drawn once drawing begins)
    if (d.sfPos) {
      const sfx = trackX + d.sfPos.x * scale;
      const sfy = trackY + d.sfPos.y * scale;
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sfx, sfy, 2.5 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Glowing Bike Dot (Fades in: 1.40s -> 1.70s)
    if (bikeAlpha > 0 && d.bikePos) {
      const bx = trackX + d.bikePos.x * scale;
      const by = trackY + d.bikePos.y * scale;

      ctx.save();
      ctx.globalAlpha = bikeAlpha;
      const pulse = 0.85 + 0.15 * Math.sin(animTime * 6.0);
      const grad = ctx.createRadialGradient(bx, by, 1 * s, bx, by, 7.5 * s * pulse);
      grad.addColorStop(0, dotColor);
      grad.addColorStop(0.4, dotColor);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bx, by, 7.5 * s * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Crisp Solid Core Dot
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(bx, by, 3.2 * s, 0, Math.PI * 2);
      ctx.fill();

      // White specular glint
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bx, by, 1.3 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore();
}

// =============================================================================
// WIDGET 3: HORIZONTAL SCROLLING TURN TICKER RIBBON (ARROWLESS, ACCELERATED SLIDE)
// =============================================================================
function drawScrollingTurnTicker(ctx, x, y, w, h, turnData, s, animTime = 2.5) {
  const d = turnData || {};
  const turns = d.turns || [];
  const distM = d.distM !== undefined ? Math.round(d.distM) : 85;
  const isIntro = animTime < 2.5;

  // Intro choreography:
  // 1. Bracket HUD flicker into view: 1.50s -> 1.80s
  let bracketAlpha = 1.0;
  if (isIntro) {
    if (animTime < 1.50) bracketAlpha = 0.0;
    else if (animTime < 1.80) {
      const u = (animTime - 1.50) / 0.30;
      const strobe = Math.sin((animTime - 1.50) * 55) > 0;
      bracketAlpha = strobe ? 1.0 : (0.15 + 0.70 * u);
    } else {
      bracketAlpha = 1.0;
    }
  }

  // 2. Active turn number slides in from the right: 1.75s -> 2.10s
  let turnSlide = 1.0;
  let turnAlpha = 1.0;
  if (isIntro) {
    if (animTime < 1.75) { turnSlide = 0.0; turnAlpha = 0.0; }
    else if (animTime < 2.10) {
      const u = (animTime - 1.75) / 0.35;
      turnSlide = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      turnAlpha = u;
    } else {
      turnSlide = 1.0;
      turnAlpha = 1.0;
    }
  }

  // 3. Apex countdown fades in: 2.00s -> 2.30s
  let apexAlpha = 1.0;
  if (isIntro) {
    if (animTime < 2.00) apexAlpha = 0.0;
    else if (animTime < 2.30) {
      apexAlpha = (animTime - 2.00) / 0.30;
    } else {
      apexAlpha = 1.0;
    }
  }

  ctx.save();

  // Floating horizontal ribbon center
  const cx = x + w / 2;
  const cy = y + 16 * s;

  // Active turn scroll position and transition pulse
  let scrollPos = d.scrollPos !== undefined ? d.scrollPos : (d.activeIdx !== undefined ? d.activeIdx : 0);
  const transPhase = Math.abs(scrollPos - Math.round(scrollPos));
  const transPulse = Math.sin(transPhase * Math.PI); // 0 at rest, 1.0 at midpoint of slide

  // Active Bracketed Box Dimensions with dynamic breathing pulse during slide
  const boxW = Math.round((48 + 4 * transPulse) * s);
  const boxH = Math.round((24 + 1.5 * transPulse) * s);
  const boxX = cx - boxW / 2;
  const boxY = cy - boxH / 2;

  // 1. Draw Active Turn Tech Box Background & Glowing [ ] Brackets (Flickers 0.95s -> 1.25s)
  if (bracketAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = bracketAlpha;

    ctx.fillStyle = 'rgba(10, 14, 22, 0.75)';
    ctx.beginPath();
    roundRectPath(ctx, boxX, boxY, boxW, boxH, 4 * s);
    ctx.fill();

    // High-tech Glowing Square Brackets [ ] with transition pulse
    const bracketColor = '#ffd600'; // Electric yellow
    const arm = 5 * s;
    ctx.lineWidth = (1.8 + 0.8 * transPulse) * s;
    ctx.strokeStyle = bracketColor;
    if (transPulse > 0.05) {
      ctx.shadowColor = `rgba(255, 214, 0, ${0.55 * transPulse})`;
      ctx.shadowBlur = 7 * s * transPulse;
    }

    // Left bracket [
    ctx.beginPath();
    ctx.moveTo(boxX + arm, boxY);
    ctx.lineTo(boxX, boxY);
    ctx.lineTo(boxX, boxY + boxH);
    ctx.lineTo(boxX + arm, boxY + boxH);
    ctx.stroke();

    // Right bracket ]
    ctx.beginPath();
    ctx.moveTo(boxX + boxW - arm, boxY);
    ctx.lineTo(boxX + boxW, boxY);
    ctx.lineTo(boxX + boxW, boxY + boxH);
    ctx.lineTo(boxX + boxW - arm, boxY + boxH);
    ctx.stroke();

    ctx.restore();
  }

  // 2. Horizontal Turns Ribbon with Quick Snapping Accelerated Slide & Dynamic Grow/Shrink
  if (turnAlpha > 0) {
    const spacing = 44 * s;

    // Clip ribbon to card width so outer numbers don't bleed
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 4 * s, cy - boxH / 2 - 4 * s, w - 8 * s, boxH + 8 * s);
    ctx.clip();

    ctx.save();
    if (isIntro && turnSlide < 1.0) {
      const slideOffsetX = (1 - turnSlide) * 45 * s;
      ctx.translate(slideOffsetX, 0);
      ctx.globalAlpha = turnAlpha;
    }

    if (turns.length > 0) {
      const baseK = Math.floor(scrollPos);
      const isLoop = turns.length > 2;

      for (let offset = -2; offset <= 2; offset++) {
        const virtualK = baseK + offset;
        let turnIdx = virtualK;
        if (isLoop) {
          turnIdx = ((virtualK % turns.length) + turns.length) % turns.length;
        } else {
          if (turnIdx < 0 || turnIdx >= turns.length) continue;
        }

        const turn = turns[turnIdx];
        if (!turn) continue;

        const tx = cx + (virtualK - scrollPos) * spacing;
        const distFromCenter = Math.abs(tx - cx);
        if (distFromCenter > spacing * 1.85) continue;

        // Smooth Hann window cosine profile: 1.0 at center, drops to 0.0 at spacing
        const normDist = Math.min(1.0, distFromCenter / (spacing * 0.95));
        const q = 0.5 * (1.0 + Math.cos(normDist * Math.PI));

        // High-dynamic-range Grow / Shrink scale:
        // Flanking turns shrink to 0.58x (~9.3px), center turn boldly pops to 1.06x (~17px)
        const scale = 0.58 + 0.48 * Math.pow(q, 1.25);
        const alpha = 0.28 + 0.72 * q;

        // Smooth RGB morph from muted cool slate (#94a3b8) to brilliant pure white (#ffffff)
        const r = Math.round(148 + (255 - 148) * q);
        const g = Math.round(163 + (255 - 163) * q);
        const b = Math.round(184 + (255 - 184) * q);

        ctx.save();
        ctx.translate(tx, cy + 0.5 * s);
        ctx.scale(scale, scale);

        ctx.font = `900 ${Math.round(16 * s)}px "Outfit", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

        if (q > 0.75) {
          const glowP = (q - 0.75) / 0.25;
          ctx.shadowColor = `rgba(255, 255, 255, ${0.45 * glowP})`;
          ctx.shadowBlur = 5 * s * glowP;
        }

        ctx.fillText(`T${turn.num}`, 0, 0);
        ctx.restore();
      }
    } else {
      // Fallback if no turns array
      ctx.font = `900 ${15 * s}px "Outfit", sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`T${d.turnNum || '1'}`, cx, cy + 0.5 * s);
    }
    ctx.restore();

    ctx.restore(); // end ribbon clip
  }

  // 3. Distance to Apex Countdown (Fades in: 2.00s -> 2.30s)
  if (apexAlpha > 0) {
    const distY = cy + boxH / 2 + 10 * s;
    ctx.save();
    ctx.globalAlpha = apexAlpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${11 * s}px "JetBrains Mono", monospace`;
    if (distM === 0) {
      ctx.fillStyle = '#00e676'; // Neon green APEX hit!
      ctx.fillText('APEX', cx, distY);
    } else {
      ctx.fillStyle = '#00e5ff'; // Cyan countdown
      ctx.fillText(`${distM}m to apex`, cx, distY);
    }
    ctx.restore();
  }

  ctx.restore();
}

// =============================================================================
// WIDGET 4: UNIFIED WIDE G-METER & INTEGRATED LEAN ARC (>= 75% OF CARD WIDTH)
// =============================================================================
function drawUnifiedGAndLeanInstrument(ctx, x, y, w, h, gmeterData, leanData, s, animTime = 2.5) {
  const isIntro = animTime < 2.5;

  // Intro choreography: Circular Iris Wipe (1.65s -> 2.20s)
  let circleWipe = 1.0;
  if (isIntro) {
    if (animTime < 1.65) circleWipe = 0.0;
    else if (animTime < 2.20) {
      const u = (animTime - 1.65) / 0.55;
      circleWipe = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    } else {
      circleWipe = 1.0;
    }
  }

  if (circleWipe <= 0) return;

  const g = gmeterData || {};
  const l = leanData || {};

  const gLong = g.gLong !== undefined ? g.gLong : 0.0;
  const gLat = g.gLat !== undefined ? g.gLat : 0.0;
  const leanDeg = l.leanDeg !== undefined ? l.leanDeg : 0;

  const cx = x + w / 2;

  // Geometry: Widen to take at least 3/4 (80%) of card width
  const rOuter = Math.round(w * 0.40); // 80% of width total diameter
  const arcThick = Math.round(15 * s);
  const rGMax = rOuter - arcThick; // 1.5G outer friction ring sits seamlessly against inner rim of lean arc
  const rArc = rGMax + arcThick / 2; // Center radius of lean arc band

  const cy = y + rOuter + 6 * s; // Shared unified center
  const maxR = rOuter + arcThick / 2 + 10 * s;

  const zeroAngle = -Math.PI / 2; // 12 o'clock (upright)
  const maxAngleSpan = (58 * Math.PI) / 180; // +/- 58 deg arc span across the top

  ctx.save();

  // Circular Iris Clipping Mask
  if (isIntro && circleWipe < 1.0) {
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * circleWipe, 0, Math.PI * 2);
    ctx.clip();
  }

  // ---------------------------------------------------------------------------
  // 1. LEAN ANGLE ARC (Attached directly to 1.5G ring perimeter with zero gap)
  // ---------------------------------------------------------------------------
  ctx.save();

  // Baseline arc track (dim background attached to top rim of 1.5G ring)
  ctx.beginPath();
  ctx.arc(cx, cy, rArc, zeroAngle - maxAngleSpan, zeroAngle + maxAngleSpan);
  ctx.lineWidth = arcThick;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Active Segmented Lean Arc (fills from 0° outward on the active lean side)
  const absLean = Math.abs(leanDeg);
  let leanColor = '#00e676'; // green (0-30°)
  if (absLean >= 50) leanColor = '#e10600'; // red (50°+)
  else if (absLean >= 40) leanColor = '#ff9100'; // orange (40-50°)
  else if (absLean >= 30) leanColor = '#ffd600'; // yellow (30-40°)

  if (absLean > 0.5) {
    const isL = leanDeg < 0;
    const sign = isL ? -1 : 1;

    // Helper to draw a specific angular zone segment
    const drawSegment = (startDeg, endDeg, color) => {
      if (absLean <= startDeg) return;
      const actEndDeg = Math.min(absLean, endDeg);
      const a1 = zeroAngle + sign * (startDeg * Math.PI) / 180;
      const a2 = zeroAngle + sign * (actEndDeg * Math.PI) / 180;

      ctx.beginPath();
      if (isL) {
        ctx.arc(cx, cy, rArc, a1, a2, true);
      } else {
        ctx.arc(cx, cy, rArc, a1, a2, false);
      }
      ctx.lineWidth = arcThick;
      ctx.strokeStyle = color;
      ctx.lineCap = actEndDeg === absLean ? 'round' : 'butt';
      ctx.stroke();
    };

    // Zone 1: 0° to 30° -> Green
    drawSegment(0, 30, '#00e676');
    // Zone 2: 30° to 40° -> Yellow
    drawSegment(30, 40, '#ffd600');
    // Zone 3: 40° to 50° -> Orange
    drawSegment(40, 50, '#ff9100');
    // Zone 4: 50°+ -> Ducati Red
    drawSegment(50, 60, '#e10600');
  }

  // Centered Lean Angle Readout (embedded directly inside the arc at 12 o'clock)
  const numCenterY = cy - rArc;
  const pillW = Math.round(36 * s);
  const pillH = Math.round(16 * s);

  ctx.save();
  ctx.fillStyle = 'rgba(8, 11, 18, 0.94)';
  ctx.beginPath();
  roundRectPath(ctx, cx - pillW / 2, numCenterY - pillH / 2, pillW, pillH, 4 * s);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.stroke();

  // Digital readout
  ctx.font = `900 ${12.5 * s}px "JetBrains Mono", monospace`;
  ctx.fillStyle = leanColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${absLean}°`, cx, numCenterY + 0.5 * s);
  ctx.restore();

  ctx.restore(); // end lean arc

  // ---------------------------------------------------------------------------
  // 2. FRICTION CIRCLE G-METER (Clean, seamless outer rim attached to lean arc)
  // ---------------------------------------------------------------------------
  ctx.save();

  // 0.5G Ring
  ctx.beginPath();
  ctx.arc(cx, cy, rGMax * (0.5 / 1.5), 0, Math.PI * 2);
  ctx.lineWidth = 1.0 * s;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.stroke();

  // 1.0G Ring
  ctx.beginPath();
  ctx.arc(cx, cy, rGMax * (1.0 / 1.5), 0, Math.PI * 2);
  ctx.lineWidth = 1.6 * s;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
  ctx.stroke();

  // 1.5G Outer Ring Limit (Seamlessly attached to lean arc inner rim)
  ctx.beginPath();
  ctx.arc(cx, cy, rGMax, 0, Math.PI * 2);
  ctx.lineWidth = 2.0 * s;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.stroke();

  // Crosshairs (Dashed lines, clean with no labels)
  ctx.lineWidth = 1 * s;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.setLineDash([2 * s, 3 * s]);

  // Vertical axis
  ctx.beginPath();
  ctx.moveTo(cx, cy - rGMax);
  ctx.lineTo(cx, cy + rGMax);
  ctx.stroke();

  // Horizontal axis
  ctx.beginPath();
  ctx.moveTo(cx - rGMax, cy);
  ctx.lineTo(cx + rGMax, cy);
  ctx.stroke();
  ctx.setLineDash([]);

  // Smoothed G-Force Bubble & Trail
  const clampedLat = Math.max(-1.5, Math.min(1.5, gLat));
  const clampedLong = Math.max(-1.5, Math.min(1.5, gLong));

  const bx = cx + (clampedLat / 1.5) * rGMax;
  const by = cy - (clampedLong / 1.5) * rGMax;

  // Vector Stem Line from center
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(bx, by);
  ctx.lineWidth = 1.8 * s;
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.50)';
  ctx.stroke();

  // Fading comet trail if available
  if (g.trail && g.trail.length > 1) {
    ctx.save();
    for (let i = 0; i < g.trail.length - 1; i++) {
      const pt = g.trail[i];
      const px = cx + (Math.max(-1.5, Math.min(1.5, pt.glat)) / 1.5) * rGMax;
      const py = cy - (Math.max(-1.5, Math.min(1.5, pt.glong)) / 1.5) * rGMax;
      const alpha = ((i + 1) / g.trail.length) * 0.35;
      ctx.fillStyle = `rgba(0, 229, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, 2.5 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Glowing Vector Bubble
  const bubbleGrad = ctx.createRadialGradient(bx, by, 1 * s, bx, by, 7.5 * s);
  bubbleGrad.addColorStop(0, '#00e5ff');
  bubbleGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.7)');
  bubbleGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
  ctx.fillStyle = bubbleGrad;
  ctx.beginPath();
  ctx.arc(bx, by, 7.5 * s, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#00e5ff';
  ctx.beginPath();
  ctx.arc(bx, by, 3.8 * s, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(bx, by, 1.4 * s, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // ---------------------------------------------------------------------------
  // 3. INSTANTANEOUS G-FORCE READOUT (Replaces Peak G values)
  // ---------------------------------------------------------------------------
  const totalG = Math.hypot(clampedLat, clampedLong);
  const statsY = cy + rGMax + 14 * s;

  ctx.font = `900 ${14 * s}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${totalG.toFixed(2)} G`, cx, statsY);

  ctx.restore(); // end circular iris clip

  // Neon scanner pulse ring along the circular wipe wavefront
  if (isIntro && circleWipe < 1.0 && circleWipe > 0.02) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * circleWipe, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
    ctx.lineWidth = 2 * s;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 8 * s;
    ctx.stroke();
    ctx.restore();
  }
}

// =============================================================================
// WIDGET 5: PRECISION THROTTLE & BRAKE TELEMETRY STRIPS
// =============================================================================
function drawThrottleBrakeCard(ctx, x, y, w, h, data, s, glassAlpha, animTime = 2.5) {
  const isIntro = animTime < 2.5;

  // Intro choreography: Fade & slide in from the left (1.85s -> 2.30s)
  let pedalAnim = 1.0;
  if (isIntro) {
    if (animTime < 1.85) pedalAnim = 0.0;
    else if (animTime < 2.30) {
      const u = (animTime - 1.85) / 0.45;
      pedalAnim = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    } else {
      pedalAnim = 1.0;
    }
  }

  if (pedalAnim <= 0) return;

  const d = data || {};
  const tps = d.tps !== undefined ? Math.max(0, Math.min(100, d.tps)) : 82;
  const brakePct = d.brakePct !== undefined ? Math.max(0, Math.min(100, d.brakePct)) : 45;

  ctx.save();

  if (isIntro && pedalAnim < 1.0) {
    const offsetX = (pedalAnim - 1) * 28 * s;
    ctx.translate(offsetX, 0);
    ctx.globalAlpha = pedalAnim;
  }

  // Dynamic bar filling during intro
  const liveTps = tps * pedalAnim;
  const liveBrake = brakePct * pedalAnim;

  const rightPad = Math.round(12 * s);
  const labelW = Math.round(24 * s);
  const valW = Math.round(26 * s);
  const barX = x + labelW + Math.round(4 * s);
  const barW = w - labelW - valW - rightPad - Math.round(4 * s);
  const barH = Math.round(6.5 * s);

  // 1. Throttle Row (Green bar, White labels & numbers)
  const tpsY = y + Math.round(6 * s);
  ctx.font = `800 ${9 * s}px "Outfit", sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('TPS', x, tpsY + barH / 2);

  // Throttle Background Track & Green Fill Bar
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(barX, tpsY, barW, barH);
  ctx.fillStyle = '#00e676';
  ctx.shadowColor = 'rgba(0, 230, 118, 0.4)';
  ctx.shadowBlur = 4 * s;
  ctx.fillRect(barX, tpsY, barW * (liveTps / 100), barH);
  ctx.shadowBlur = 0;

  // Digital TPS % in White (moved inward away from background edge)
  ctx.font = `800 ${9 * s}px "JetBrains Mono", monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(liveTps)}%`, x + w - rightPad, tpsY + barH / 2);

  // 2. Brake Row (Red bar, White labels & numbers)
  const brkY = y + Math.round(24 * s);
  ctx.font = `800 ${9 * s}px "Outfit", sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText('BRK', x, brkY + barH / 2);

  // Brake Background Track & Red Fill Bar
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(barX, brkY, barW, barH);
  ctx.fillStyle = '#ff1744';
  ctx.shadowColor = 'rgba(255, 23, 68, 0.4)';
  ctx.shadowBlur = 4 * s;
  ctx.fillRect(barX, brkY, barW * (liveBrake / 100), barH);
  ctx.shadowBlur = 0;

  // Digital Brake % in White (moved inward away from background edge)
  ctx.font = `800 ${9 * s}px "JetBrains Mono", monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(liveBrake)}%`, x + w - rightPad, brkY + barH / 2);

  ctx.restore();
}
