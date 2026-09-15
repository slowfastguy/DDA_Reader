/**
 * video_export.js - MotoGP Video Overlay Engine & Alpha Matte Generator
 * Ducati DDA Telemetry & GPS Visualizer
 */

function drawMotoGPOverlayCanvas(ctx, cardWidth, cardHeight, riderName, bikeName, riderNum, tyreFront, tyreRear, badgeColor, timeStr, deltaStr, deltaColorHex, timeColorHex, sectors, sectorProgressFrac, isGateHighlight, bgMode, scale = 1.0, animTime = 1.0, finishState = null) {
  ctx.clearRect(0, 0, cardWidth, cardHeight);

  if (bgMode === 'greenscreen') {
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(0, 0, cardWidth, cardHeight);
  } else if (bgMode === 'bluescreen') {
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(0, 0, cardWidth, cardHeight);
  } else if (bgMode === 'dark') {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, cardWidth, cardHeight);
  }

  // If animTime <= 0, nothing is visible yet
  if (animTime <= 0) return;

  const s = scale;
  const x = 0;
  const y = 0;
  const w = cardWidth;
  const h = cardHeight;
  const chamfer = 14 * s;
  const hdrH = 26 * s;

  ctx.save();

  // =========================================================
  // POST-LAP FINISH STATE (Image 1, Image 2, and Image 3)
  // =========================================================
  if (finishState && finishState.isFinished) {
    // 1. Draw Solid Black Header Background (#000000)
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, w, hdrH);

    // Number Badge (Left rounded, right square edge flush with right border)
    const numBadgeW = Math.max(30 * s, (riderNum.length * 13 + 10) * s);
    const numBadgeH = 24 * s;
    const numBadgeX = x + w - numBadgeW;
    const numBadgeY = y + (hdrH - numBadgeH) / 2;
    const rBadge = 4 * s;

    ctx.beginPath();
    ctx.moveTo(numBadgeX + rBadge, numBadgeY);
    ctx.lineTo(numBadgeX + numBadgeW, numBadgeY);
    ctx.lineTo(numBadgeX + numBadgeW, numBadgeY + numBadgeH);
    ctx.lineTo(numBadgeX + rBadge, numBadgeY + numBadgeH);
    ctx.arcTo(numBadgeX, numBadgeY + numBadgeH, numBadgeX, numBadgeY, rBadge);
    ctx.arcTo(numBadgeX, numBadgeY, numBadgeX + numBadgeW, numBadgeY, rBadge);
    ctx.closePath();
    ctx.fillStyle = badgeColor || '#6f2dbd';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${19 * s}px "Outfit", "Inter", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(riderNum, numBadgeX + numBadgeW / 2, numBadgeY + numBadgeH / 2 + 0.5 * s);

    // Header Row: Rider Name + Bike Model
    ctx.font = `900 ${13 * s}px "Outfit", "Inter", sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const nameX = x + 10 * s;
    const headerCenterY = y + hdrH / 2;
    ctx.fillText(riderName.toUpperCase(), nameX, headerCenterY);
    const nameWidth = ctx.measureText(riderName.toUpperCase()).width;

    if (bikeName && bikeName.trim()) {
      ctx.font = `400 ${10 * s}px "Inter", sans-serif`;
      ctx.fillStyle = '#c0c6d8';
      let bStr = bikeName.trim();
      const maxBikeW = Math.max(20 * s, (numBadgeX - 8 * s) - (nameX + nameWidth + 7 * s));
      if (ctx.measureText(bStr).width > maxBikeW) {
        while (bStr.length > 2 && ctx.measureText(bStr + '…').width > maxBikeW) {
          bStr = bStr.slice(0, -1);
        }
        bStr += '…';
      }
      ctx.fillText(bStr, nameX + nameWidth + 7 * s, headerCenterY);
    }

    // Header Separator Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(x, y + hdrH);
    ctx.lineTo(x + w, y + hdrH);
    ctx.stroke();

    // 2. Base Image 3 Layer (Rendered underneath the wipe animation)
    // A. Lower Data Area (80% Opaque Black Background)
    ctx.beginPath();
    ctx.moveTo(x, y + hdrH);
    ctx.lineTo(x + w, y + hdrH);
    ctx.lineTo(x + w, h - chamfer);
    ctx.lineTo(x + w - chamfer, h);
    ctx.lineTo(x, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.80)';
    ctx.fill();

    // B. Middle Row: Big Bold Centered Lap Time (Image 3)
    ctx.font = `900 ${30 * s}px "Outfit", "JetBrains Mono", monospace`;
    ctx.fillStyle = finishState.isFastest ? '#ff1744' : (finishState.deltaColor || '#ff8c00');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(finishState.lapTimeStr || timeStr, x + w / 2, y + 49 * s);

    // C. Footer Strip:
    // Tyres on Left
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${8 * s}px "Inter", sans-serif`;

    const tf = (tyreFront || 'M').toUpperCase();
    const tr = (tyreRear || 'S').toUpperCase();
    const pillH = 15 * s;
    const pillY = y + 76 * s - (pillH / 2);

    const pill1W = (tf.length <= 1 ? 16 : (tf.length === 2 ? 22 : 27)) * s;
    const pill1X = x + 10 * s;
    ctx.fillStyle = '#1e222d';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(pill1X, pillY, pill1W, pillH, 7.5 * s);
    else ctx.rect(pill1X, pillY, pill1W, pillH);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tf, pill1X + pill1W / 2, pillY + pillH / 2 + 0.5 * s);

    const pill2W = (tr.length <= 1 ? 16 : (tr.length === 2 ? 22 : 27)) * s;
    const pill2X = pill1X + pill1W + 3 * s;
    ctx.fillStyle = '#1e222d';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(pill2X, pillY, pill2W, pillH, 7.5 * s);
    else ctx.rect(pill2X, pillY, pill2W, pillH);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tr, pill2X + pill2W / 2, pillY + pillH / 2 + 0.5 * s);

    // Centered Delta in Footer (Image 3)
    ctx.font = `900 ${13 * s}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(finishState.deltaStr || deltaStr, x + w / 2, y + 76 * s);

    // 3. FASTEST LAP 2-SECOND CELEBRATION (Wipe In -> 0.5s Static -> Pan to LAP -> 0.5s Static -> Wipe Away)
    const tFin = finishState.finishElapsed || 0;
    if (finishState.isFastest && tFin < 2.00) {
      const bH = h - hdrH;
      const cY = y + hdrH + bH / 2;

      if (tFin < 0.35) {
        // Stage 1: Wipe in FASTEST from right (0.0s to 0.35s)
        const wipeK = tFin / 0.35;
        const wipeW = w * wipeK;
        const wipeX = x + w - wipeW;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(wipeX, y + hdrH);
        ctx.lineTo(x + w, y + hdrH);
        ctx.lineTo(x + w, h - chamfer);
        ctx.lineTo(x + w - chamfer, h);
        ctx.lineTo(wipeX, h);
        ctx.closePath();
        ctx.clip();

        ctx.fillStyle = '#e10600';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${32 * s}px "Outfit", "Inter", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FASTEST', x + w / 2, cY);
        ctx.restore();
      } else if (tFin < 0.85) {
        // Stage 2: Remain static on FASTEST for 0.5s (0.35s to 0.85s)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, y + hdrH);
        ctx.lineTo(x + w, y + hdrH);
        ctx.lineTo(x + w, h - chamfer);
        ctx.lineTo(x + w - chamfer, h);
        ctx.lineTo(x, h);
        ctx.closePath();
        ctx.clip();

        ctx.fillStyle = '#e10600';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${32 * s}px "Outfit", "Inter", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FASTEST', x + w / 2, cY);
        ctx.restore();
      } else if (tFin < 1.15) {
        // Stage 3: Smooth pan from FASTEST to LAP (0.85s to 1.15s)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, y + hdrH);
        ctx.lineTo(x + w, y + hdrH);
        ctx.lineTo(x + w, h - chamfer);
        ctx.lineTo(x + w - chamfer, h);
        ctx.lineTo(x, h);
        ctx.closePath();
        ctx.clip();

        ctx.fillStyle = '#e10600';
        ctx.fill();

        const panK = (tFin - 0.85) / 0.30;
        const ease = panK * panK * (3 - 2 * panK);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // FASTEST translates downwards out of view
        ctx.font = `900 ${32 * s}px "Outfit", "Inter", sans-serif`;
        const fastestY = cY + (bH * 0.95) * ease;
        ctx.fillText('FASTEST', x + w / 2, fastestY);

        // LAP translates into center from top
        ctx.font = `900 ${36 * s}px "Outfit", "Inter", sans-serif`;
        const lapY = cY - (bH * 0.95) * (1 - ease);
        ctx.fillText('LAP', x + w / 2, lapY);

        ctx.restore();
      } else if (tFin < 1.65) {
        // Stage 4: Remain static on LAP for 0.5s (1.15s to 1.65s)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, y + hdrH);
        ctx.lineTo(x + w, y + hdrH);
        ctx.lineTo(x + w, h - chamfer);
        ctx.lineTo(x + w - chamfer, h);
        ctx.lineTo(x, h);
        ctx.closePath();
        ctx.clip();

        ctx.fillStyle = '#e10600';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${36 * s}px "Outfit", "Inter", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LAP', x + w / 2, cY);
        ctx.restore();
      } else {
        // Stage 5: Wipe away to reveal lap time (1.65s to 2.00s)
        const wipeAwayK = (tFin - 1.65) / 0.35;
        const remX = x + w * wipeAwayK;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(remX, y + hdrH);
        ctx.lineTo(x + w, y + hdrH);
        ctx.lineTo(x + w, h - chamfer);
        ctx.lineTo(x + w - chamfer, h);
        ctx.lineTo(remX, h);
        ctx.closePath();
        ctx.clip();

        ctx.fillStyle = '#e10600';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${36 * s}px "Outfit", "Inter", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LAP', x + w / 2, cY);
        ctx.restore();
      }
    }

    ctx.restore();
    return;
  }

  // =========================================================
  // NORMAL RUNNING LAP / INTRO ANIMATION RENDERING
  // =========================================================
  // PHASE 1: Header Stripe Sweep & Name Reveal (0.0s to 0.67s)
  if (animTime < 0.67) {
    const p1 = animTime / 0.67; // 0.0 -> 1.0

    if (p1 < 0.45) {
      // Sub-phase 1a (0.0s to ~0.30s): Colored bar sweeps across the header from left to right
      const sweepK = Math.sin((p1 / 0.45) * (Math.PI / 2));
      const stripeW = Math.max(8 * s, w * sweepK);

      ctx.beginPath();
      ctx.rect(x, y, stripeW, hdrH);
      ctx.fillStyle = badgeColor || '#6f2dbd';
      ctx.shadowColor = badgeColor || '#6f2dbd';
      ctx.shadowBlur = 10 * s;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      // Sub-phase 1b (0.30s to 0.67s): Solid black header reveals rider name, colored stripe shrinks to number badge flush on right
      const u = (p1 - 0.45) / 0.55; // 0.0 -> 1.0
      const uEase = u * u * (3 - 2 * u); // Smooth hermite curve

      // Header completely solid black (#000000)
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, w, hdrH);

      // Number Badge geometry (Left rounded, right square edge flush with right border)
      const targetBadgeW = Math.max(30 * s, (riderNum.length * 13 + 10) * s);
      const targetBadgeH = 24 * s;
      const targetBadgeX = x + w - targetBadgeW;
      const targetBadgeY = y + (hdrH - targetBadgeH) / 2;

      // Colored stripe contracts from full-width to target badge position
      const curBadgeX = (1 - uEase) * x + uEase * targetBadgeX;
      const curBadgeW = (1 - uEase) * w + uEase * targetBadgeW;
      const rBadge = 4 * s;

      ctx.beginPath();
      ctx.moveTo(curBadgeX + rBadge, targetBadgeY);
      ctx.lineTo(curBadgeX + curBadgeW, targetBadgeY);
      ctx.lineTo(curBadgeX + curBadgeW, targetBadgeY + targetBadgeH);
      ctx.lineTo(curBadgeX + rBadge, targetBadgeY + targetBadgeH);
      ctx.arcTo(curBadgeX, targetBadgeY + targetBadgeH, curBadgeX, targetBadgeY, rBadge);
      ctx.arcTo(curBadgeX, targetBadgeY, curBadgeX + curBadgeW, targetBadgeY, rBadge);
      ctx.closePath();
      ctx.fillStyle = badgeColor || '#6f2dbd';
      ctx.fill();

      // Fade in rider number (centered vertically, fills colored badge)
      if (uEase > 0.25) {
        const textAlpha = Math.min(1.0, (uEase - 0.25) / 0.75);
        ctx.fillStyle = `rgba(255, 255, 255, ${textAlpha})`;
        ctx.font = `900 ${19 * s}px "Outfit", "Inter", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(riderNum, targetBadgeX + targetBadgeW / 2, targetBadgeY + targetBadgeH / 2 + 0.5 * s);
      }

      // Fade in Rider Name & Bike Model (centered vertically in header)
      const nameAlpha = Math.min(1.0, uEase * 1.3);
      ctx.fillStyle = `rgba(255, 255, 255, ${nameAlpha})`;
      ctx.font = `900 ${13 * s}px "Outfit", "Inter", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const nameX = x + 10 * s;
      const headerCenterY = y + hdrH / 2;
      ctx.fillText(riderName.toUpperCase(), nameX, headerCenterY);
      const nameWidth = ctx.measureText(riderName.toUpperCase()).width;

      if (bikeName && bikeName.trim()) {
        ctx.font = `400 ${10 * s}px "Inter", sans-serif`;
        ctx.fillStyle = `rgba(192, 198, 216, ${nameAlpha * 0.85})`;
        let bStr = bikeName.trim();
        const maxBikeW = Math.max(20 * s, (targetBadgeX - 8 * s) - (nameX + nameWidth + 7 * s));
        if (ctx.measureText(bStr).width > maxBikeW) {
          while (bStr.length > 2 && ctx.measureText(bStr + '…').width > maxBikeW) {
            bStr = bStr.slice(0, -1);
          }
          bStr += '…';
        }
        ctx.fillText(bStr, nameX + nameWidth + 7 * s, headerCenterY);
      }
    }

    ctx.restore();
    return;
  }

  // =========================================================
  // PHASE 2: Lower Body Wipe Down (0.67s to 1.00s) & PHASE 3: Full Card (>= 1.0s)
  // =========================================================
  let curH = h;
  let bodyAlpha = 1.0;

  if (animTime < 1.0) {
    const p2 = (animTime - 0.67) / 0.33; // 0.0 -> 1.0
    const vEase = 1 - Math.cos(p2 * (Math.PI / 2)); // Smooth sine ease-out
    curH = hdrH + vEase * (h - hdrH);
    bodyAlpha = Math.min(1.0, p2 * 1.2);
  }

  // 1. Draw Lower Data Area (80% Opaque Black Background rgba(0,0,0,0.80) with Chamfer)
  if (curH > hdrH) {
    const currentChamfer = (curH > h - chamfer) ? (curH - (h - chamfer)) : 0;
    ctx.beginPath();
    ctx.moveTo(x, y + hdrH);
    ctx.lineTo(x + w, y + hdrH);
    ctx.lineTo(x + w, curH - currentChamfer);
    if (currentChamfer > 0) {
      ctx.lineTo(x + w - currentChamfer, curH);
    }
    ctx.lineTo(x, curH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.80)';
    ctx.fill();
  }

  // 2. Draw Solid Black Header Background (#000000)
  ctx.fillStyle = '#000000';
  ctx.fillRect(x, y, w, hdrH);

  // Header Separator Line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  ctx.moveTo(x, y + hdrH);
  ctx.lineTo(x + w, y + hdrH);
  ctx.stroke();

  // Number Badge: Left rounded, right square edge flush with right border (fills badge height)
  const numBadgeW = Math.max(30 * s, (riderNum.length * 13 + 10) * s);
  const numBadgeH = 24 * s;
  const numBadgeX = x + w - numBadgeW;
  const numBadgeY = y + (hdrH - numBadgeH) / 2;
  const rBadge = 4 * s;

  ctx.beginPath();
  ctx.moveTo(numBadgeX + rBadge, numBadgeY);
  ctx.lineTo(numBadgeX + numBadgeW, numBadgeY);
  ctx.lineTo(numBadgeX + numBadgeW, numBadgeY + numBadgeH);
  ctx.lineTo(numBadgeX + rBadge, numBadgeY + numBadgeH);
  ctx.arcTo(numBadgeX, numBadgeY + numBadgeH, numBadgeX, numBadgeY, rBadge);
  ctx.arcTo(numBadgeX, numBadgeY, numBadgeX + numBadgeW, numBadgeY, rBadge);
  ctx.closePath();
  ctx.fillStyle = badgeColor || '#6f2dbd';
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${19 * s}px "Outfit", "Inter", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(riderNum, numBadgeX + numBadgeW / 2, numBadgeY + numBadgeH / 2 + 0.5 * s);

  // Header Row: Rider Name (Bold) + Bike Model (Non-bold) - Centered Vertically
  ctx.font = `900 ${13 * s}px "Outfit", "Inter", sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const nameX = x + 10 * s;
  const headerCenterY = y + hdrH / 2;
  ctx.fillText(riderName.toUpperCase(), nameX, headerCenterY);
  const nameWidth = ctx.measureText(riderName.toUpperCase()).width;

  if (bikeName && bikeName.trim()) {
    ctx.font = `400 ${10 * s}px "Inter", sans-serif`;
    ctx.fillStyle = '#c0c6d8';
    let bStr = bikeName.trim();
    const maxBikeW = Math.max(20 * s, (numBadgeX - 8 * s) - (nameX + nameWidth + 7 * s));
    if (ctx.measureText(bStr).width > maxBikeW) {
      while (bStr.length > 2 && (ctx.measureText(bStr + '…').width > maxBikeW)) {
        bStr = bStr.slice(0, -1);
      }
      bStr += '…';
    }
    ctx.fillText(bStr, nameX + nameWidth + 7 * s, headerCenterY);
  }

  // If lower body has begun unfolding, draw the data contents clipped inside [x, hdrH, w, curH - hdrH]
  if (curH > hdrH + 4 * s) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y + hdrH, w, curH - (y + hdrH));
    ctx.clip();
    ctx.globalAlpha = bodyAlpha;

    // Middle Row: Time & Delta Displays (Smooth Size & Glow Transition)
    const gatePop = typeof isGateHighlight === 'number'
      ? Math.max(0, Math.min(1, isGateHighlight))
      : (isGateHighlight ? 1.0 : 0.0);

    // Smooth Timer Size (Left): 24px (normal) -> 14px (shrunk)
    const timerFontSize = Math.round((24 - 10 * gatePop) * s);
    const timerWeight = gatePop > 0.6 ? 800 : 900;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `${timerWeight} ${timerFontSize}px "JetBrains Mono", "Outfit", monospace`;

    if (gatePop > 0.01) {
      // Smooth color transition towards dimmed white rgba(255, 255, 255, 0.70)
      ctx.fillStyle = timeColorHex || '#ff8c00';
      ctx.globalAlpha = bodyAlpha * (1 - 0.30 * gatePop);
      ctx.fillText(timeStr, x + 10 * s, y + 53 * s);
      ctx.globalAlpha = bodyAlpha;
    } else {
      ctx.fillStyle = timeColorHex || '#ff8c00';
      ctx.fillText(timeStr, x + 10 * s, y + 53 * s);
    }

    // Smooth Delta Size (Right): 14px (normal) -> 24px (enlarged)
    const deltaFontSize = Math.round((14 + 10 * gatePop) * s);
    const deltaWeight = gatePop > 0.4 ? 900 : 800;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `${deltaWeight} ${deltaFontSize}px "JetBrains Mono", "Outfit", monospace`;
    ctx.fillStyle = deltaColorHex || '#8e94a5';

    if (gatePop > 0.05) {
      ctx.shadowColor = deltaColorHex || '#8e94a5';
      ctx.shadowBlur = 8 * gatePop * s;
      ctx.fillText(deltaStr, x + w - 10 * s, y + 53 * s);
      ctx.shadowBlur = 0;
    } else {
      ctx.shadowBlur = 0;
      ctx.fillText(deltaStr, x + w - 10 * s, y + 53 * s);
    }

    // Footer: Flexible Tyre Pills (Up to 3 characters each)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${8 * s}px "Inter", sans-serif`;

    const tf = (tyreFront || 'M').toUpperCase();
    const tr = (tyreRear || 'S').toUpperCase();

    const pillH = 15 * s;
    const pillY = y + 76 * s - (pillH / 2);

    // Front Tyre Pill
    const pill1W = (tf.length <= 1 ? 16 : (tf.length === 2 ? 22 : 27)) * s;
    const pill1X = x + 10 * s;
    ctx.fillStyle = '#1e222d';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(pill1X, pillY, pill1W, pillH, 7.5 * s);
    else ctx.rect(pill1X, pillY, pill1W, pillH);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tf, pill1X + pill1W / 2, pillY + pillH / 2 + 0.5 * s);

    // Rear Tyre Pill
    const pill2W = (tr.length <= 1 ? 16 : (tr.length === 2 ? 22 : 27)) * s;
    const pill2X = pill1X + pill1W + 3 * s;
    ctx.fillStyle = '#1e222d';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(pill2X, pillY, pill2W, pillH, 7.5 * s);
    else ctx.rect(pill2X, pillY, pill2W, pillH);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tr, pill2X + pill2W / 2, pillY + pillH / 2 + 0.5 * s);

    // Sector Bars
    const secTrackX = pill2X + pill2W + 6 * s;
    const secTrackY = y + 76 * s - (2.25 * s);
    const secTrackW = (x + w - 10 * s) - secTrackX;
    const secGap = 4 * s;
    const numSectors = sectors.length;
    const segW = (secTrackW - (numSectors - 1) * secGap) / numSectors;

    sectors.forEach((sec, sIdx) => {
      const segX = secTrackX + sIdx * (segW + secGap);
      ctx.fillStyle = sec.color;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(segX, secTrackY, segW, 4.5 * s, 2 * s);
      else ctx.rect(segX, secTrackY, segW, 4.5 * s);
      ctx.fill();
    });

    // Tic Indicator
    const ticX = secTrackX + sectorProgressFrac * secTrackW;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 6 * s;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(ticX - 1.5 * s, secTrackY - 2.5 * s, 3.5 * s, 9.5 * s, 1.5 * s);
    else ctx.rect(ticX - 1.5 * s, secTrackY - 2.5 * s, 3.5 * s, 9.5 * s);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  ctx.restore();
}

function playIntroPreviewAnimation() {
  const previewBox = document.getElementById('video-preview-box');
  if (!previewBox) return;

  let animCanvas = document.getElementById('preview-anim-canvas');
  if (!animCanvas) {
    animCanvas = document.createElement('canvas');
    animCanvas.id = 'preview-anim-canvas';
    animCanvas.style.position = 'absolute';
    animCanvas.style.top = '0';
    animCanvas.style.left = '0';
    animCanvas.style.width = '100%';
    animCanvas.style.height = '100%';
    animCanvas.style.pointerEvents = 'none';
    animCanvas.style.zIndex = '10';
    previewBox.style.position = 'relative';
    previewBox.appendChild(animCanvas);
  }

  const w = 280;
  const h = 92;
  animCanvas.width = w;
  animCanvas.height = h;
  animCanvas.style.display = 'block';

  const modalPreview = document.getElementById('motogp-modal-preview');
  if (modalPreview) modalPreview.style.visibility = 'hidden';

  const ctx = animCanvas.getContext('2d');
  const riderName = dom.inputRiderName.value || state.motogp.riderName;
  const bikeName = dom.inputBikeName.value || state.motogp.bikeName;
  const riderNum = dom.inputRiderNum.value || state.motogp.riderNum;
  const tyreFront = dom.inputTyreFront.value || state.motogp.tyreFront;
  const tyreRear = dom.inputTyreRear.value || state.motogp.tyreRear;
  const badgeColor = dom.inputNumberColor.value || state.motogp.badgeColor;

  const sectors = [{ color: '#ff1744' }, { color: '#ff8c00' }, { color: '#2a2e3c' }];
  const startT = performance.now();

  function animLoop(now) {
    const elapsed = (now - startT) / 1000.0;
    const animTime = Math.min(1.0, elapsed);

    drawMotoGPOverlayCanvas(ctx, w, h, riderName, bikeName, riderNum, tyreFront, tyreRear, badgeColor, '1:21.147', '+0.658', '#8e94a5', '#ff8c00', sectors, 0.72, false, 'transparent', 1.0, animTime);

    if (elapsed < 1.1) {
      requestAnimationFrame(animLoop);
    } else {
      setTimeout(() => {
        animCanvas.style.display = 'none';
        if (modalPreview) modalPreview.style.visibility = 'visible';
      }, 300);
    }
  }

  requestAnimationFrame(animLoop);
}

function playFastestLapPreviewAnimation() {
  const previewBox = document.getElementById('video-preview-box');
  if (!previewBox) return;

  let animCanvas = document.getElementById('preview-anim-canvas');
  if (!animCanvas) {
    animCanvas = document.createElement('canvas');
    animCanvas.id = 'preview-anim-canvas';
    animCanvas.style.position = 'absolute';
    animCanvas.style.top = '0';
    animCanvas.style.left = '0';
    animCanvas.style.width = '100%';
    animCanvas.style.height = '100%';
    animCanvas.style.pointerEvents = 'none';
    animCanvas.style.zIndex = '10';
    previewBox.style.position = 'relative';
    previewBox.appendChild(animCanvas);
  }

  const w = 280;
  const h = 92;
  animCanvas.width = w;
  animCanvas.height = h;
  animCanvas.style.display = 'block';

  const modalPreview = document.getElementById('motogp-modal-preview');
  if (modalPreview) modalPreview.style.visibility = 'hidden';

  const ctx = animCanvas.getContext('2d');
  const riderName = dom.inputRiderName.value || state.motogp.riderName;
  const bikeName = dom.inputBikeName.value || state.motogp.bikeName;
  const riderNum = dom.inputRiderNum.value || state.motogp.riderNum;
  const tyreFront = dom.inputTyreFront.value || state.motogp.tyreFront;
  const tyreRear = dom.inputTyreRear.value || state.motogp.tyreRear;
  const badgeColor = dom.inputNumberColor.value || state.motogp.badgeColor;

  const sectors = [{ color: '#ff1744' }, { color: '#ff1744' }, { color: '#ff1744' }];
  const startT = performance.now();

  function animLoop(now) {
    const elapsed = (now - startT) / 1000.0;

    const finishState = {
      isFinished: true,
      isFastest: true,
      finishElapsed: elapsed,
      lapTimeStr: '1:56.456',
      deltaStr: '-0.071',
      deltaColor: '#ff1744'
    };

    drawMotoGPOverlayCanvas(ctx, w, h, riderName, bikeName, riderNum, tyreFront, tyreRear, badgeColor, '1:56.456', '-0.071', '#ff1744', '#ff1744', sectors, 1.0, true, 'transparent', 1.0, 1.0, finishState);

    if (elapsed < 6.0) {
      requestAnimationFrame(animLoop);
    } else {
      setTimeout(() => {
        animCanvas.style.display = 'none';
        if (modalPreview) modalPreview.style.visibility = 'visible';
      }, 300);
    }
  }

  requestAnimationFrame(animLoop);
}

/**
 * Non-contiguous 16MB Chunked Memory Target for WebMMuxer.
 * Prevents browser memory exhaustion and V8 RangeError by avoiding
 * monolithic ArrayBuffer doubling (which requires 2x-3x contiguous RAM).
 */
class ChunkedMemoryTarget {
  constructor(chunkSize = 16 * 1024 * 1024) {
    this.chunkSize = chunkSize;
    this.chunks = [];
    this.totalLength = 0;
  }

  write(data, position) {
    let offset = 0;
    while (offset < data.length) {
      const pos = position + offset;
      const chunkIdx = Math.floor(pos / this.chunkSize);
      const chunkOffset = pos % this.chunkSize;

      while (this.chunks.length <= chunkIdx) {
        this.chunks.push(new Uint8Array(this.chunkSize));
      }

      const toWrite = Math.min(data.length - offset, this.chunkSize - chunkOffset);
      this.chunks[chunkIdx].set(data.subarray(offset, offset + toWrite), chunkOffset);

      offset += toWrite;
      if (pos + toWrite > this.totalLength) {
        this.totalLength = pos + toWrite;
      }
    }
  }

  getBlob(mimeType = 'video/webm') {
    const slices = [];
    let remaining = this.totalLength;
    for (let i = 0; i < this.chunks.length && remaining > 0; i++) {
      const len = Math.min(remaining, this.chunkSize);
      slices.push(this.chunks[i].subarray(0, len));
      remaining -= len;
    }
    return new Blob(slices, { type: mimeType });
  }
}

/**
 * Creates a StreamTarget backed by ChunkedMemoryTarget for WebMMuxer.
 */
function createChunkedMuxerTarget(chunkSize = 16 * 1024 * 1024) {
  const memTarget = new ChunkedMemoryTarget(chunkSize);
  const streamTarget = new WebMMuxer.StreamTarget({
    chunked: true,
    chunkSize: chunkSize,
    onData: (data, position) => {
      memTarget.write(data, position);
    }
  });
  return { streamTarget, memTarget };
}

/**
 * Enforces WebCodecs encoder backpressure.
 * Prevents uncompressed VideoFrames from accumulating unbounded in VRAM/RAM.
 */
async function waitForEncoderBackpressure(encoder, maxQueue = 5) {
  if (encoder.encodeQueueSize <= maxQueue) return;
  await new Promise(resolve => {
    let done = false;
    const onDequeue = () => {
      if (!done && encoder.encodeQueueSize <= maxQueue) {
        done = true;
        encoder.removeEventListener('dequeue', onDequeue);
        resolve();
      }
    };
    encoder.addEventListener('dequeue', onDequeue);
    const timer = setInterval(() => {
      if (encoder.encodeQueueSize <= maxQueue) {
        clearInterval(timer);
        onDequeue();
      }
    }, 10);
  });
}

/**
 * Enforces backpressure across two concurrent encoders (Dual Matte mode).
 */
async function waitForDualEncoderBackpressure(encoder1, encoder2, maxQueue = 5) {
  if (encoder1.encodeQueueSize <= maxQueue && encoder2.encodeQueueSize <= maxQueue) return;
  await new Promise(resolve => {
    let done = false;
    const onDequeue = () => {
      if (!done && encoder1.encodeQueueSize <= maxQueue && encoder2.encodeQueueSize <= maxQueue) {
        done = true;
        encoder1.removeEventListener('dequeue', onDequeue);
        encoder2.removeEventListener('dequeue', onDequeue);
        resolve();
      }
    };
    encoder1.addEventListener('dequeue', onDequeue);
    encoder2.addEventListener('dequeue', onDequeue);
    const timer = setInterval(() => {
      if (encoder1.encodeQueueSize <= maxQueue && encoder2.encodeQueueSize <= maxQueue) {
        clearInterval(timer);
        onDequeue();
      }
    }, 10);
  });
}

/**
 * Optimized 32-bit in-place alpha matte generation.
 * Avoids multi-megabyte heap allocation per frame and runs 4x faster.
 */
function generateAlphaMatteFromCanvas(srcCanvas, destCanvas) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const srcCtx = srcCanvas.getContext('2d');
  const destCtx = destCanvas.getContext('2d');

  const imgData = srcCtx.getImageData(0, 0, w, h);
  const data32 = new Uint32Array(imgData.data.buffer);
  const len = data32.length;

  for (let i = 0; i < len; i++) {
    // Little-endian RGBA: alpha is bits 24..31
    const a = (data32[i] >>> 24);
    // Write grayscale R=a, G=a, B=a with full opacity A=255
    data32[i] = 0xFF000000 | (a << 16) | (a << 8) | a;
  }

  destCtx.putImageData(imgData, 0, 0);
}

function downloadVideoBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

async function exportOverlayVideo() {
  const lapNum = parseInt(dom.selectExportLap.value, 10);
  const lapObj = state.laps.find(l => l.lap_number === lapNum) || state.laps.find(l => l.is_best) || state.laps[0];
  if (!lapObj) {
    alert('No lap selected for video export.');
    return;
  }

  const fps = parseInt(dom.selectVideoFps.value, 10) || 60;
  const scale = parseFloat(dom.selectVideoScale.value) || 1.5;
  const bgMode = dom.selectVideoBg.value || 'dual_matte';
  const useIntro = dom.selectVideoIntro ? dom.selectVideoIntro.value === 'wipe' : true;
  const leadInOutSec = dom.inputVideoLeadInOut ? (parseFloat(dom.inputVideoLeadInOut.value) || 0) : 3.0;

  const cardW = Math.round(280 * scale);
  const cardH = Math.round(92 * scale);

  dom.renderProgressBarWrap.style.display = 'flex';
  dom.btnRenderVideo.disabled = true;

  const s1Dur = (lapObj.sectors && lapObj.sectors[0]) || (lapObj.duration_s * 0.28);
  const s2Dur = (lapObj.sectors && lapObj.sectors[1]) || (lapObj.duration_s * 0.38);
  const s3Dur = (lapObj.sectors && lapObj.sectors[2]) || (lapObj.duration_s * 0.34);

  const tSplit1 = s1Dur;
  const tSplit2 = s1Dur + s2Dur;
  const tSplit3 = lapObj.duration_s;

  const ref = getBenchmarkReference(lapObj);
  const r1 = ref ? ref.s1 : null;
  const r2 = ref ? ref.s2 : null;
  const r3 = ref ? ref.s3 : null;
  const refTotal = ref ? ref.total : null;

  const totalLapDuration = lapObj.duration_s;
  const isFastestLap = lapObj.is_best || (refTotal !== null && totalLapDuration <= refTotal) || (refTotal === null);

  const leadInDuration = leadInOutSec;
  const baseFinishHold = isFastestLap ? 7.0 : 5.0;
  const leadOutDuration = Math.max(baseFinishHold, leadInOutSec);

  const totalVideoDuration = leadInDuration + totalLapDuration + leadOutDuration;
  const totalFrames = Math.max(1, Math.round(totalVideoDuration * fps));
  const dt = totalVideoDuration / totalFrames;

  const riderName = dom.inputRiderName.value || state.motogp.riderName;
  const bikeName = dom.inputBikeName.value || state.motogp.bikeName;
  const riderNum = dom.inputRiderNum.value || state.motogp.riderNum;
  const tyreFront = dom.inputTyreFront.value || state.motogp.tyreFront;
  const tyreRear = dom.inputTyreRear.value || state.motogp.tyreRear;
  const badgeColor = dom.inputNumberColor.value || state.motogp.badgeColor;

  const baseFileName = `motogp_overlay_lap${lapObj.lap_number}_${lapObj.name.replace(/[^a-z0-9]/gi, '_')}`;

  // Canvases
  const transCanvas = document.createElement('canvas');
  transCanvas.width = cardW;
  transCanvas.height = cardH;
  const transCtx = transCanvas.getContext('2d', { alpha: true });

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = cardW;
  colorCanvas.height = cardH;
  const colorCtx = colorCanvas.getContext('2d');

  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = cardW;
  alphaCanvas.height = cardH;
  const alphaCtx = alphaCanvas.getContext('2d');

  const sbsCanvas = document.createElement('canvas');
  sbsCanvas.width = cardW * 2;
  sbsCanvas.height = cardH;
  const sbsCtx = sbsCanvas.getContext('2d');

  // Check WebCodecs availability
  const hasWebCodecs = typeof VideoEncoder !== 'undefined' && typeof WebMMuxer !== 'undefined';

  if (hasWebCodecs) {
    try {
      if (bgMode === 'dual_matte') {
        // Dual Channel Export: 1 Color Video + 1 Matching Alpha Matte Video
        const { streamTarget: colorStreamTarget, memTarget: colorMemTarget } = createChunkedMuxerTarget();
        const { streamTarget: alphaStreamTarget, memTarget: alphaMemTarget } = createChunkedMuxerTarget();

        const colorMuxer = new WebMMuxer.Muxer({
          target: colorStreamTarget,
          video: { codec: 'V_VP9', width: cardW, height: cardH, frameRate: fps }
        });
        const alphaMuxer = new WebMMuxer.Muxer({
          target: alphaStreamTarget,
          video: { codec: 'V_VP9', width: cardW, height: cardH, frameRate: fps }
        });

        const colorEncoder = new VideoEncoder({
          output: (chunk, meta) => colorMuxer.addVideoChunk(chunk, meta),
          error: (e) => console.error('Color VideoEncoder error:', e)
        });
        const alphaEncoder = new VideoEncoder({
          output: (chunk, meta) => alphaMuxer.addVideoChunk(chunk, meta),
          error: (e) => console.error('Alpha VideoEncoder error:', e)
        });

        await colorEncoder.configure({ codec: 'vp09.00.10.08', width: cardW, height: cardH, bitrate: 14_000_000, framerate: fps });
        await alphaEncoder.configure({ codec: 'vp09.00.10.08', width: cardW, height: cardH, bitrate: 5_000_000, framerate: fps });

        for (let f = 0; f <= totalFrames; f++) {
          await waitForDualEncoderBackpressure(colorEncoder, alphaEncoder, 5);

          const tVideo = f * dt;
          const tRelLap = tVideo - leadInDuration;

          const { timeStr, deltaStr, deltaColor, timeColor, sectors, ticFrac, isGateHighlight, finishState } = calculateOverlayFrameState(tRelLap, tSplit1, tSplit2, s1Dur, s2Dur, s3Dur, r1, r2, totalLapDuration, refTotal, isFastestLap);
          const animTime = useIntro ? Math.min(1.0, tVideo) : 1.0;

          // 1. Render Transparent Base
          drawMotoGPOverlayCanvas(transCtx, cardW, cardH, riderName, bikeName, riderNum, tyreFront, tyreRear, badgeColor, timeStr, deltaStr, deltaColor, timeColor, sectors, ticFrac, isGateHighlight, 'transparent', scale, animTime, finishState);

          // 2. Render Color Video (Over clean solid black #000000)
          colorCtx.fillStyle = '#000000';
          colorCtx.fillRect(0, 0, cardW, cardH);
          colorCtx.drawImage(transCanvas, 0, 0);

          // 3. Generate Exact Alpha Matte Frame
          generateAlphaMatteFromCanvas(transCanvas, alphaCanvas);

          const ts = Math.round(tVideo * 1_000_000);
          const colorFrame = new VideoFrame(colorCanvas, { timestamp: ts });
          const alphaFrame = new VideoFrame(alphaCanvas, { timestamp: ts });

          colorEncoder.encode(colorFrame, { keyFrame: f % (fps * 2) === 0 });
          alphaEncoder.encode(alphaFrame, { keyFrame: f % (fps * 2) === 0 });
          colorFrame.close();
          alphaFrame.close();

          if (f % 20 === 0 || f === totalFrames) {
            const pct = Math.round((f / totalFrames) * 100);
            dom.renderProgressFill.style.width = `${pct}%`;
            dom.renderProgressText.textContent = `Encoding Dual Channel (Color + Alpha Matte)... ${pct}%`;
            await new Promise(r => setTimeout(r, 0));
          }
        }

        await Promise.all([colorEncoder.flush(), alphaEncoder.flush()]);
        colorMuxer.finalize();
        alphaMuxer.finalize();

        const colorBlob = colorMemTarget.getBlob('video/webm');
        const alphaBlob = alphaMemTarget.getBlob('video/webm');

        downloadVideoBlob(colorBlob, `${baseFileName}_Color.webm`);
        setTimeout(() => downloadVideoBlob(alphaBlob, `${baseFileName}_AlphaMatte.webm`), 500);

        dom.renderProgressBarWrap.style.display = 'none';
        dom.btnRenderVideo.disabled = false;
        return;
      }

      if (bgMode === 'side_by_side') {
        // Single Video containing Color on Left and Alpha Matte on Right
        const { streamTarget, memTarget } = createChunkedMuxerTarget();
        const muxer = new WebMMuxer.Muxer({
          target: streamTarget,
          video: { codec: 'V_VP9', width: cardW * 2, height: cardH, frameRate: fps }
        });
        const encoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e) => console.error('VideoEncoder error:', e)
        });
        await encoder.configure({ codec: 'vp09.00.10.08', width: cardW * 2, height: cardH, bitrate: 18_000_000, framerate: fps });

        for (let f = 0; f <= totalFrames; f++) {
          await waitForEncoderBackpressure(encoder, 5);

          const tVideo = f * dt;
          const tRelLap = tVideo - leadInDuration;
          const { timeStr, deltaStr, deltaColor, timeColor, sectors, ticFrac, isGateHighlight, finishState } = calculateOverlayFrameState(tRelLap, tSplit1, tSplit2, s1Dur, s2Dur, s3Dur, r1, r2, totalLapDuration, refTotal, isFastestLap);
          const animTime = useIntro ? Math.min(1.0, tVideo) : 1.0;

          drawMotoGPOverlayCanvas(transCtx, cardW, cardH, riderName, bikeName, riderNum, tyreFront, tyreRear, badgeColor, timeStr, deltaStr, deltaColor, timeColor, sectors, ticFrac, isGateHighlight, 'transparent', scale, animTime, finishState);
          generateAlphaMatteFromCanvas(transCanvas, alphaCanvas);

          sbsCtx.fillStyle = '#000000';
          sbsCtx.fillRect(0, 0, cardW * 2, cardH);
          sbsCtx.drawImage(transCanvas, 0, 0);
          sbsCtx.drawImage(alphaCanvas, cardW, 0);

          const ts = Math.round(tVideo * 1_000_000);
          const frame = new VideoFrame(sbsCanvas, { timestamp: ts });
          encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
          frame.close();

          if (f % 20 === 0 || f === totalFrames) {
            const pct = Math.round((f / totalFrames) * 100);
            dom.renderProgressFill.style.width = `${pct}%`;
            dom.renderProgressText.textContent = `Encoding Side-by-Side Video... ${pct}%`;
            await new Promise(r => setTimeout(r, 0));
          }
        }

        await encoder.flush();
        muxer.finalize();
        const blob = memTarget.getBlob('video/webm');
        downloadVideoBlob(blob, `${baseFileName}_SideBySide.webm`);
        dom.renderProgressBarWrap.style.display = 'none';
        dom.btnRenderVideo.disabled = false;
        return;
      }

      // Single Video Output (Transparent, Alpha Only, Green, Blue, Dark)
      const isTrans = (bgMode === 'transparent');
      const isAlphaOnly = (bgMode === 'alpha_only');
      const targetCanvas = isAlphaOnly ? alphaCanvas : (isTrans ? transCanvas : colorCanvas);
      const { streamTarget, memTarget } = createChunkedMuxerTarget();

      const muxer = new WebMMuxer.Muxer({
        target: streamTarget,
        video: {
          codec: 'V_VP9',
          width: cardW,
          height: cardH,
          alpha: isTrans,
          frameRate: fps
        }
      });

      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error('VideoEncoder error:', e)
      });

      await encoder.configure({
        codec: 'vp09.00.10.08',
        width: cardW,
        height: cardH,
        bitrate: 14_000_000,
        framerate: fps,
        alpha: isTrans ? 'keep' : 'discard'
      });

      for (let f = 0; f <= totalFrames; f++) {
        await waitForEncoderBackpressure(encoder, 5);

        const tVideo = f * dt;
        const tRelLap = tVideo - leadInDuration;
        const { timeStr, deltaStr, deltaColor, timeColor, sectors, ticFrac, isGateHighlight, finishState } = calculateOverlayFrameState(tRelLap, tSplit1, tSplit2, s1Dur, s2Dur, s3Dur, r1, r2, totalLapDuration, refTotal, isFastestLap);
        const animTime = useIntro ? Math.min(1.0, tVideo) : 1.0;

        if (isAlphaOnly) {
          drawMotoGPOverlayCanvas(transCtx, cardW, cardH, riderName, bikeName, riderNum, tyreFront, tyreRear, badgeColor, timeStr, deltaStr, deltaColor, timeColor, sectors, ticFrac, isGateHighlight, 'transparent', scale, animTime, finishState);
          generateAlphaMatteFromCanvas(transCanvas, alphaCanvas);
        } else {
          drawMotoGPOverlayCanvas(targetCanvas.getContext('2d', { alpha: isTrans }), cardW, cardH, riderName, bikeName, riderNum, tyreFront, tyreRear, badgeColor, timeStr, deltaStr, deltaColor, timeColor, sectors, ticFrac, isGateHighlight, bgMode, scale, animTime, finishState);
        }

        const ts = Math.round(tVideo * 1_000_000);
        const frame = new VideoFrame(targetCanvas, { timestamp: ts });
        encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
        frame.close();

        if (f % 20 === 0 || f === totalFrames) {
          const pct = Math.round((f / totalFrames) * 100);
          dom.renderProgressFill.style.width = `${pct}%`;
          dom.renderProgressText.textContent = `Encoding ${fps} FPS Video... ${pct}%`;
          await new Promise(r => setTimeout(r, 0));
        }
      }

      await encoder.flush();
      muxer.finalize();
      const blob = memTarget.getBlob('video/webm');
      const suffix = isAlphaOnly ? 'AlphaMatte' : (isTrans ? 'Transparent' : bgMode);
      downloadVideoBlob(blob, `${baseFileName}_${suffix}.webm`);

      dom.renderProgressBarWrap.style.display = 'none';
      dom.btnRenderVideo.disabled = false;
      return;
    } catch (err) {
      console.warn('WebCodecs VideoEncoder exception, falling back to MediaRecorder:', err);
    }
  }

  // Fallback MediaRecorder with Paced Capture
  const mimeType = (bgMode === 'transparent' && typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9'))
    ? 'video/webm;codecs=vp9'
    : ((typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm')) ? 'video/webm' : 'video/mp4');

  const fallbackCanvas = (bgMode === 'side_by_side') ? sbsCanvas : colorCanvas;
  const stream = fallbackCanvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12000000 });
  const chunks = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType });
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    downloadVideoBlob(blob, `${baseFileName}_${bgMode}.${ext}`);
    dom.renderProgressBarWrap.style.display = 'none';
    dom.btnRenderVideo.disabled = false;
  };

  recorder.start(1000);

  const frameIntervalMs = 1000 / fps;
  for (let f = 0; f <= totalFrames; f++) {
    const tVideo = f * dt;
    const tRelLap = tVideo - leadInDuration;
    const { timeStr, deltaStr, deltaColor, timeColor, sectors, ticFrac, isGateHighlight, finishState } = calculateOverlayFrameState(tRelLap, tSplit1, tSplit2, s1Dur, s2Dur, s3Dur, r1, r2, totalLapDuration, refTotal, isFastestLap);
    const animTime = useIntro ? Math.min(1.0, tVideo) : 1.0;

    if (bgMode === 'side_by_side') {
      drawMotoGPOverlayCanvas(transCtx, cardW, cardH, riderName, bikeName, riderNum, tyreFront, tyreRear, badgeColor, timeStr, deltaStr, deltaColor, timeColor, sectors, ticFrac, isGateHighlight, 'transparent', scale, animTime, finishState);
      generateAlphaMatteFromCanvas(transCanvas, alphaCanvas);
      sbsCtx.fillStyle = '#000000';
      sbsCtx.fillRect(0, 0, cardW * 2, cardH);
      sbsCtx.drawImage(transCanvas, 0, 0);
      sbsCtx.drawImage(alphaCanvas, cardW, 0);
    } else {
      drawMotoGPOverlayCanvas(colorCtx, cardW, cardH, riderName, bikeName, riderNum, tyreFront, tyreRear, badgeColor, timeStr, deltaStr, deltaColor, timeColor, sectors, ticFrac, isGateHighlight, bgMode === 'dual_matte' ? 'dark' : bgMode, scale, animTime, finishState);
    }

    const pct = Math.round((f / totalFrames) * 100);
    dom.renderProgressFill.style.width = `${pct}%`;
    dom.renderProgressText.textContent = `Paced Recording ${fps} FPS... ${pct}%`;

    await new Promise(r => setTimeout(r, frameIntervalMs));
  }

  recorder.stop();
}

function calculateOverlayFrameState(tRelLap, tSplit1, tSplit2, s1Dur, s2Dur, s3Dur, r1, r2, totalLapDuration, refTotal, isFastestLap) {
  const sectors = [
    { color: '#2a2e3c' },
    { color: '#2a2e3c' },
    { color: '#2a2e3c' }
  ];
  let deltaStr = null;
  let deltaColor = '#8e94a5';
  let timeColor = '#ff8c00';
  let gatePopFactor = 0.0;
  let timeStr = '0:00.000';
  let ticFrac = 0;
  let finishState = null;

  const transDuration = 0.25; // 250ms smooth cubic ease matching CSS transition
  const hasRef = r1 !== null && r1 !== undefined && refTotal !== null && refTotal !== undefined;

  if (tRelLap < 0) {
    timeStr = formatMotoGPTimer(0);
    deltaStr = null;
    deltaColor = '#8e94a5';
    timeColor = '#ff8c00';
    ticFrac = 0;
    gatePopFactor = 0.0;
  } else if (tRelLap < tSplit1) {
    timeStr = formatMotoGPTimer(tRelLap);
    deltaStr = null;
    deltaColor = '#8e94a5';
    timeColor = '#ff8c00';
    ticFrac = (tRelLap / tSplit1) * (1 / 3);
    gatePopFactor = 0.0;
  } else if (tRelLap < tSplit2) {
    ticFrac = (1 / 3) + ((tRelLap - tSplit1) / s2Dur) * (1 / 3);

    if (hasRef) {
      const d1 = s1Dur - r1;
      sectors[0].color = d1 < 0 ? '#ff1744' : (d1 <= 0.5 ? '#ff8c00' : '#8e94a5');
      const dtGate = tRelLap - tSplit1;
      if (dtGate < 5.0) {
        if (dtGate < transDuration) {
          const u = dtGate / transDuration;
          gatePopFactor = u * u * (3 - 2 * u);
        } else if (dtGate < 5.0 - transDuration) {
          gatePopFactor = 1.0;
        } else {
          const v = (5.0 - dtGate) / transDuration;
          gatePopFactor = v * v * (3 - 2 * v);
        }
        timeStr = formatMotoGPTimer(tSplit1); // Freeze on Gate 1 split time
        deltaStr = `${d1 < 0 ? '' : '+'}${d1.toFixed(3)}`;
        deltaColor = d1 < 0 ? '#ff1744' : (d1 <= 0.5 ? '#ff8c00' : '#8e94a5');
        timeColor = deltaColor;
      } else {
        gatePopFactor = 0.0;
        deltaStr = null;
        timeStr = formatMotoGPTimer(tRelLap);
      }
    } else {
      sectors[0].color = '#ffffff';
      gatePopFactor = 0.0;
      deltaStr = null;
      timeStr = formatMotoGPTimer(tRelLap);
    }
  } else if (tRelLap < totalLapDuration) {
    ticFrac = (2 / 3) + (Math.min(1.0, (tRelLap - tSplit2) / s3Dur)) * (1 / 3);

    if (hasRef) {
      const d1 = s1Dur - r1;
      const d2 = (s1Dur + s2Dur) - (r1 + r2);
      sectors[0].color = d1 < 0 ? '#ff1744' : (d1 <= 0.5 ? '#ff8c00' : '#8e94a5');
      sectors[1].color = d2 < 0 ? '#ff1744' : (d2 <= 0.5 ? '#ff8c00' : '#8e94a5');

      const dtGate = tRelLap - tSplit2;
      if (dtGate < 5.0) {
        if (dtGate < transDuration) {
          const u = dtGate / transDuration;
          gatePopFactor = u * u * (3 - 2 * u);
        } else if (dtGate < 5.0 - transDuration) {
          gatePopFactor = 1.0;
        } else {
          const v = (5.0 - dtGate) / transDuration;
          gatePopFactor = v * v * (3 - 2 * v);
        }
        timeStr = formatMotoGPTimer(tSplit2); // Freeze on Gate 2 split time
        deltaStr = `${d2 < 0 ? '' : '+'}${d2.toFixed(3)}`;
        deltaColor = d2 < 0 ? '#ff1744' : (d2 <= 0.5 ? '#ff8c00' : '#8e94a5');
        timeColor = deltaColor;
      } else {
        gatePopFactor = 0.0;
        deltaStr = null;
        timeStr = formatMotoGPTimer(tRelLap);
      }
    } else {
      sectors[0].color = '#ffffff';
      sectors[1].color = '#ffffff';
      gatePopFactor = 0.0;
      deltaStr = null;
      timeStr = formatMotoGPTimer(tRelLap);
    }
  } else {
    ticFrac = 1.0;
    gatePopFactor = 1.0;
    timeStr = formatMotoGPTimer(totalLapDuration);

    if (hasRef) {
      const d1 = s1Dur - r1;
      const d2 = (s1Dur + s2Dur) - (r1 + r2);
      const d3 = totalLapDuration - refTotal;
      sectors[0].color = d1 < 0 ? '#ff1744' : (d1 <= 0.5 ? '#ff8c00' : '#8e94a5');
      sectors[1].color = d2 < 0 ? '#ff1744' : (d2 <= 0.5 ? '#ff8c00' : '#8e94a5');
      sectors[2].color = d3 < 0 ? '#ff1744' : (d3 <= 0.5 ? '#ff8c00' : '#8e94a5');
      deltaStr = `${d3 < 0 ? '' : '+'}${d3.toFixed(3)}`;
      deltaColor = d3 < 0 ? '#ff1744' : (d3 <= 0.5 ? '#ff8c00' : '#8e94a5');
      timeColor = deltaColor;

      finishState = {
        isFinished: true,
        isFastest: isFastestLap,
        finishElapsed: tRelLap - totalLapDuration,
        lapTimeStr: formatMotoGPTimer(totalLapDuration),
        deltaStr: deltaStr,
        deltaColor: deltaColor
      };
    } else {
      sectors[0].color = '#ffffff';
      sectors[1].color = '#ffffff';
      sectors[2].color = '#ffffff';
      deltaStr = '★ PB';
      deltaColor = '#6f2dbd';
      timeColor = '#ff1744';

      finishState = {
        isFinished: true,
        isFastest: true,
        finishElapsed: tRelLap - totalLapDuration,
        lapTimeStr: formatMotoGPTimer(totalLapDuration),
        deltaStr: '★ PB',
        deltaColor: '#6f2dbd'
      };
    }
  }

  return { timeStr, deltaStr, deltaColor, timeColor, sectors, ticFrac, isGateHighlight: gatePopFactor, finishState };
}

// =============================================================================
// VERTICAL SEAM DATA BAR: PREVIEW & VIDEO EXPORT ENGINE
// =============================================================================

let seamBarAnimFrameId = null;

/**
 * Renders a crisp static preview of the Seam Bar in the export modal canvas
 */
function renderSeamBarStaticPreview() {
  const canvas = dom.seamBarPreviewCanvas || document.getElementById('seam-bar-preview-canvas');
  if (!canvas) return;

  const barW = (dom.inputSeamWidth ? parseInt(dom.inputSeamWidth.value, 10) : state.seamBar.width) || 190;
  const barH = 760;

  if (canvas.width !== barW || canvas.height !== barH) {
    canvas.width = barW;
    canvas.height = barH;
  }

  const ctx = canvas.getContext('2d');
  const opacity = (dom.inputSeamOpacity ? parseInt(dom.inputSeamOpacity.value, 10) / 100 : state.seamBar.glassOpacity) || 0.68;
  const dotColor = (dom.inputDotColor ? dom.inputDotColor.value : (state.seamBar.dotColor || '#e10600'));

  const config = {
    glassOpacity: opacity,
    dotColor: dotColor,
    order: state.seamBar.order,
    enabled: {
      motogp: dom.chkModTiming ? dom.chkModTiming.checked : true,
      timing: dom.chkModTiming ? dom.chkModTiming.checked : true,
      map: dom.chkModMap ? dom.chkModMap.checked : true,
      turn: dom.chkModTurn ? dom.chkModTurn.checked : true,
      gmeter: dom.chkModGmeter ? dom.chkModGmeter.checked : true,
      pedals: dom.chkModPedals ? dom.chkModPedals.checked : true
    }
  };

  const sampleFrame = getSeamBarSampleData();
  drawSeamBarCanvas(ctx, barW, barH, sampleFrame, config, 2.5);
}

/**
 * Returns complete mock / live frame data for previewing the vertical seam bar
 */
function getSeamBarSampleData(simT = 0) {
  const activeTrack = typeof getActiveTrackProfile === 'function' ? getActiveTrackProfile() : null;
  const trackName = activeTrack ? activeTrack.name : 'Thunderhill Raceway';
  const turns = typeof getActiveTrackTurns === 'function' ? getActiveTrackTurns() : null;

  // Track map path points (from best flying lap if available)
  let mapPoints = [];
  let bikePos = { x: 0.68, y: 0.35 };
  let sfPos = { x: 0.15, y: 0.85 };

  if (state.records && state.records.length > 20) {
    const flyingLaps = (state.laps && state.laps.length > 0)
      ? state.laps.filter(l => l.duration_s > 30 && (!l.is_out_lap && !l.is_in_lap))
      : [];
    const bestLap = (flyingLaps.length > 0)
      ? flyingLaps.reduce((min, l) => (l.duration_s < min.duration_s ? l : min), flyingLaps[0])
      : (state.laps && state.laps[0]);

    let trackRecs = [];
    if (bestLap) {
      trackRecs = state.records.filter(r => r.time_s >= bestLap.start_time_s && r.time_s <= bestLap.end_time_s && r.gps_lat !== null && r.gps_lon !== null);
    }
    if (trackRecs.length < 20) {
      trackRecs = state.records.filter(r => r.gps_lat !== null && r.gps_lon !== null && (r.speed_kmh || 0) > 20);
    }
    if (trackRecs.length > 20) {
      let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
      trackRecs.forEach(r => {
        if (r.gps_lat < minLat) minLat = r.gps_lat;
        if (r.gps_lat > maxLat) maxLat = r.gps_lat;
        if (r.gps_lon < minLon) minLon = r.gps_lon;
        if (r.gps_lon > maxLon) maxLon = r.gps_lon;
      });
      const padLat = (maxLat - minLat) * 0.04 || 0.0001;
      const padLon = (maxLon - minLon) * 0.04 || 0.0001;
      minLat -= padLat; maxLat += padLat;
      minLon -= padLon; maxLon += padLon;

      const midLat = (minLat + maxLat) / 2;
      const cosLat = Math.cos(midLat * Math.PI / 180.0);
      const spanLon = (maxLon - minLon) * cosLat || 0.0001;
      const spanLat = (maxLat - minLat) || 0.0001;
      const maxSpan = Math.max(spanLon, spanLat);

      const offX = (1.0 - (spanLon / maxSpan)) / 2;
      const offY = (1.0 - (spanLat / maxSpan)) / 2;

      const nRecs = trackRecs.length;
      const step = Math.max(1, Math.floor(nRecs / 160));
      for (let i = 0; i < nRecs; i += step) {
        let latSum = 0, lonSum = 0, wSum = 0;
        for (let w = -2; w <= 2; w++) {
          const k = Math.max(0, Math.min(nRecs - 1, i + w));
          latSum += trackRecs[k].gps_lat;
          lonSum += trackRecs[k].gps_lon;
          wSum++;
        }
        const curLat = latSum / wSum;
        const curLon = lonSum / wSum;
        const nx = offX + ((curLon - minLon) * cosLat) / maxSpan;
        const ny = offY + (1 - (curLat - minLat) / maxSpan);
        mapPoints.push([nx, ny]);
      }

      if (trackRecs[0]) {
        sfPos = {
          x: offX + ((trackRecs[0].gps_lon - minLon) * cosLat) / maxSpan,
          y: offY + (1 - (trackRecs[0].gps_lat - minLat) / maxSpan)
        };
      }

      const simIdx = Math.floor(((simT * 15) % nRecs));
      const cr = trackRecs[simIdx] || trackRecs[0];
      if (cr) {
        bikePos = {
          x: offX + ((cr.gps_lon - minLon) * cosLat) / maxSpan,
          y: offY + (1 - (cr.gps_lat - minLat) / maxSpan)
        };
      }
    }
  }

  // Fallback synthetic circuit
  if (mapPoints.length < 10) {
    mapPoints = [
      [0.25, 0.85], [0.45, 0.85], [0.65, 0.70], [0.80, 0.50],
      [0.75, 0.25], [0.55, 0.15], [0.35, 0.20], [0.20, 0.45],
      [0.15, 0.65], [0.25, 0.85]
    ];
  }

  // Turns Ribbon
  const turnsList = (turns && turns.length > 0) ? turns.map(t => ({
    num: (t.number || '').toString().replace(/^T/i, ''),
    name: t.name || ('Turn ' + t.number),
    isLeft: (t.direction || '').toLowerCase().includes('left')
  })) : [
    { num: '1', name: 'Turn 1', isLeft: true },
    { num: '2', name: 'Turn 2', isLeft: false },
    { num: '3', name: 'Turn 3', isLeft: true },
    { num: '4', name: 'Turn 4', isLeft: false },
    { num: '5', name: 'Turn 5', isLeft: false }
  ];

  const osc = Math.sin(simT * 2.5);
  const cosOsc = Math.cos(simT * 2.5);

  const turnCycle = (simT * 0.35) % turnsList.length;
  const activeIdx = Math.floor(turnCycle);
  const frac = turnCycle - activeIdx;
  let snapSlide = 0;
  let activeT = turnsList[activeIdx] || turnsList[0];
  let distM = Math.max(0, Math.round(180 * (1 - frac / 0.82)));

  if (frac > 0.82) {
    const p = (frac - 0.82) / 0.18;
    snapSlide = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    if (p < 0.5) {
      distM = 0; // APEX reached!
    } else {
      const nextIdx = (activeIdx + 1) % turnsList.length;
      activeT = turnsList[nextIdx];
      distM = Math.max(0, Math.round(170 * (1 - (p - 0.5) * 0.3)));
    }
  }
  const scrollPos = activeIdx + snapSlide;

  let sampleHasSplit = false;
  let sampleGateHighlight = 0.0;
  let sampleDeltaStr = null;
  let sampleDeltaColor = '#8e94a5';
  let sampleTimeStr = formatMotoGPTimer(32.616 + (simT % 60));

  if (simT > 0) {
    const cycle = simT % 12;
    if (cycle >= 4.0 && cycle < 9.0) {
      sampleHasSplit = true;
      const dt = cycle - 4.0;
      const u = dt < 0.3 ? (dt / 0.3) : (dt > 4.7 ? (5.0 - dt) / 0.3 : 1.0);
      sampleGateHighlight = Math.max(0, Math.min(1, u));
      sampleTimeStr = '0:28.450';
      sampleDeltaStr = '-0.412';
      sampleDeltaColor = '#ff1744';
    }
  }

  return {
    rider: {
      riderNum: (dom.inputRiderNum ? dom.inputRiderNum.value : state.motogp.riderNum) || '512',
      riderName: (dom.inputRiderName ? dom.inputRiderName.value : state.motogp.riderName) || 'SLOW FAST GUY',
      bikeName: (dom.inputBikeName ? dom.inputBikeName.value : state.motogp.bikeName) || 'SFV2',
      badgeColor: (dom.inputNumberColor ? dom.inputNumberColor.value : state.motogp.badgeColor) || '#e10600',
      tyreFront: (state.motogp && state.motogp.tyreFront) || 'M',
      tyreRear: (state.motogp && state.motogp.tyreRear) || 'S',
      trackName: trackName
    },
    timing: {
      lapNum: 3,
      totalLaps: (state.laps && state.laps.length > 0) ? state.laps.length : 6,
      timeStr: sampleTimeStr,
      deltaStr: sampleDeltaStr,
      deltaColor: sampleDeltaColor,
      hasSplit: sampleHasSplit,
      isGateHighlight: sampleGateHighlight,
      isFastest: true,
      lapProgressFrac: (0.35 + (simT * 0.05)) % 1.0,
      sectors: [
        { color: '#ff1744' }, // PB red
        { color: '#ff8c00' }, // Orange
        { color: 'rgba(255, 255, 255, 0.12)' }
      ],
      completedLaps: [
        { lapNumber: 1, lapTimeStr: '2:20.021', deltaStr: '★ PB', deltaColor: '#6f2dbd', isPb: true },
        { lapNumber: 2, lapTimeStr: '2:22.524', deltaStr: '+2.503', deltaColor: '#ff8c00', isPb: false }
      ]
    },
    map: {
      pathPoints: mapPoints,
      bikePos: bikePos,
      sfPos: sfPos,
      trackName: trackName
    },
    turn: {
      turns: turnsList,
      activeIdx: activeIdx,
      scrollPos: scrollPos,
      turnNum: activeT.num,
      turnName: activeT.name,
      isLeft: activeT.isLeft,
      distM: distM
    },
    gmeter: {
      gLong: -0.65 + osc * 0.75,
      gLat: 1.15 * cosOsc,
      peakLat: 1.10,
      peakBrake: -1.66,
      trail: [
        { glong: -0.8, glat: 0.9 * cosOsc },
        { glong: -0.9, glat: 1.0 * cosOsc },
        { glong: -0.7, glat: 1.1 * cosOsc },
        { glong: -0.65 + osc * 0.75, glat: 1.15 * cosOsc }
      ]
    },
    lean: {
      leanDeg: Math.round(activeT.isLeft ? -(42 + osc * 8) : (42 + osc * 8)),
      maxLeanL: 48,
      maxLeanR: 45
    },
    pedals: {
      tps: Math.max(0, Math.min(100, (0.5 + 0.5 * osc) * 100)),
      brakePct: Math.max(0, Math.min(100, (0.5 - 0.5 * osc) * 90))
    }
  };
}

/**
 * Plays the 1.5s cascading power-on sweep intro preview or live fluctuating preview
 */
function playSeamBarPreviewAnimation(mode = 'intro') {
  if (seamBarAnimFrameId) {
    cancelAnimationFrame(seamBarAnimFrameId);
    seamBarAnimFrameId = null;
  }

  const canvas = dom.seamBarPreviewCanvas || document.getElementById('seam-bar-preview-canvas');
  if (!canvas) return;

  const barW = (dom.inputSeamWidth ? parseInt(dom.inputSeamWidth.value, 10) : state.seamBar.width) || 190;
  const barH = 760;
  canvas.width = barW;
  canvas.height = barH;

  const ctx = canvas.getContext('2d');
  const opacity = (dom.inputSeamOpacity ? parseInt(dom.inputSeamOpacity.value, 10) / 100 : state.seamBar.glassOpacity) || 0.68;
  const dotColor = (dom.inputDotColor ? dom.inputDotColor.value : (state.seamBar.dotColor || '#e10600'));

  const config = {
    glassOpacity: opacity,
    dotColor: dotColor,
    order: state.seamBar.order,
    enabled: {
      motogp: dom.chkModTiming ? dom.chkModTiming.checked : true,
      timing: dom.chkModTiming ? dom.chkModTiming.checked : true,
      map: dom.chkModMap ? dom.chkModMap.checked : true,
      turn: dom.chkModTurn ? dom.chkModTurn.checked : true,
      gmeter: dom.chkModGmeter ? dom.chkModGmeter.checked : true,
      pedals: dom.chkModPedals ? dom.chkModPedals.checked : true
    }
  };

  const startT = performance.now();
  const maxDur = mode === 'intro' ? 2.9 : 8.0;

  function loop(now) {
    const elapsed = (now - startT) / 1000.0;
    const animTime = mode === 'intro' ? Math.min(2.5, elapsed) : 2.5;

    const frameData = getSeamBarSampleData(elapsed);
    drawSeamBarCanvas(ctx, barW, barH, frameData, config, animTime);

    if (elapsed < maxDur) {
      seamBarAnimFrameId = requestAnimationFrame(loop);
    } else {
      renderSeamBarStaticPreview();
    }
  }

  seamBarAnimFrameId = requestAnimationFrame(loop);
}

/**
 * Exports the Vertical Seam Data Bar overlay video
 */
async function exportSeamBarVideo() {
  const geom = (dom.selectSeamGeometry ? dom.selectSeamGeometry.value : state.seamBar.exportGeometry) || 'discrete';
  const tfMode = (dom.selectSeamTimeframe ? dom.selectSeamTimeframe.value : state.seamBar.timeframeMode) || 'lap';
  const barWidthUser = (dom.inputSeamWidth ? parseInt(dom.inputSeamWidth.value, 10) : state.seamBar.width) || 190;
  const glassOpacity = (dom.inputSeamOpacity ? parseInt(dom.inputSeamOpacity.value, 10) / 100 : state.seamBar.glassOpacity) || 0.68;
  const bitrate = (dom.selectSeamBitrate ? parseInt(dom.selectSeamBitrate.value, 10) : state.seamBar.bitrate) || 40000000;
  const useIntro = (dom.selectSeamIntro ? dom.selectSeamIntro.value === 'cascade' : true);
  const bgMode = (dom.selectSeamBg ? dom.selectSeamBg.value : 'dual_matte');
  const fps = (dom.selectVideoFps ? parseInt(dom.selectVideoFps.value, 10) : 60) || 60;
  const scale = (dom.selectVideoScale ? parseFloat(dom.selectVideoScale.value) : 1.5) || 1.0;

  if (!state.records || state.records.length === 0) {
    alert('Please load a telemetry session before exporting.');
    return;
  }

  // 1. Determine Start & End Timestamp Range
  let startSec = 0;
  let endSec = 60;
  let baseFileName = 'dda_seam_overlay';

  if (tfMode === 'lap') {
    const lapNum = dom.selectSeamLap ? parseInt(dom.selectSeamLap.value, 10) : state.selectedLapNum;
    const lapObj = (state.laps && state.laps.find(l => l.lap_number === lapNum)) || state.laps[1] || state.laps[0];
    if (!lapObj) {
      alert('Selected lap not found.');
      return;
    }
    const leadIn = 2.5;
    const leadOut = 4.0;
    startSec = Math.max(state.records[0].time_s, lapObj.start_time_s - leadIn);
    endSec = Math.min(state.records[state.records.length - 1].time_s, lapObj.end_time_s + leadOut);
    baseFileName = `seambar_lap${lapObj.lap_number}_${lapObj.name.replace(/[^a-z0-9]/gi, '_')}`;
  } else if (tfMode === 'session') {
    startSec = state.records[0].time_s;
    endSec = state.records[state.records.length - 1].time_s;
    baseFileName = 'seambar_full_session';
  } else if (tfMode === 'custom') {
    startSec = dom.inputSeamStart ? (parseFloat(dom.inputSeamStart.value) || 0) : 0;
    endSec = dom.inputSeamEnd ? (parseFloat(dom.inputSeamEnd.value) || 60) : 60;
    if (endSec <= startSec) endSec = startSec + 10;
    baseFileName = `seambar_range_${Math.round(startSec)}s_to_${Math.round(endSec)}s`;
  }

  const totalDuration = Math.max(1.0, endSec - startSec);
  const totalFrames = Math.max(1, Math.round(totalDuration * fps));
  const dt = totalDuration / totalFrames;

  // 2. Determine Canvas Resolutions
  let canvasW, canvasH, renderBarW, renderBarH, barOffsetX, barOffsetY;

  if (geom === 'discrete') {
    // Discrete vertical strip (default)
    renderBarW = Math.round(barWidthUser * scale);
    renderBarH = Math.round(1080 * scale);
    canvasW = renderBarW;
    canvasH = renderBarH;
    barOffsetX = 0;
    barOffsetY = 0;
  } else {
    // Full 16:9 Pre-Aligned Canvas (e.g. 1920x1080 or 3840x2160)
    canvasW = Math.round(1920 * scale);
    canvasH = Math.round(1080 * scale);
    renderBarW = Math.round(barWidthUser * scale);
    renderBarH = canvasH;
    // Seam is at 75% of width (2880 in 4K, 1440 in 1080p). Center bar on seam line:
    barOffsetX = Math.round(canvasW * 0.75 - renderBarW / 2);
    barOffsetY = 0;
  }

  // Canvases
  const transCanvas = document.createElement('canvas');
  transCanvas.width = canvasW;
  transCanvas.height = canvasH;
  const transCtx = transCanvas.getContext('2d', { alpha: true });

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = canvasW;
  colorCanvas.height = canvasH;
  const colorCtx = colorCanvas.getContext('2d');

  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = canvasW;
  alphaCanvas.height = canvasH;
  const alphaCtx = alphaCanvas.getContext('2d');

  const sbsCanvas = document.createElement('canvas');
  sbsCanvas.width = canvasW * 2;
  sbsCanvas.height = canvasH;
  const sbsCtx = sbsCanvas.getContext('2d');

  const dotColor = (dom.inputDotColor ? dom.inputDotColor.value : (state.seamBar.dotColor || '#e10600'));

  const config = {
    glassOpacity: glassOpacity,
    dotColor: dotColor,
    order: state.seamBar.order,
    enabled: {
      motogp: dom.chkModTiming ? dom.chkModTiming.checked : true,
      timing: dom.chkModTiming ? dom.chkModTiming.checked : true,
      map: dom.chkModMap ? dom.chkModMap.checked : true,
      turn: dom.chkModTurn ? dom.chkModTurn.checked : true,
      gmeter: dom.chkModGmeter ? dom.chkModGmeter.checked : true,
      pedals: dom.chkModPedals ? dom.chkModPedals.checked : true
    }
  };

  dom.renderProgressBarWrap.style.display = 'flex';
  if (dom.btnRenderSeamVideo) dom.btnRenderSeamVideo.disabled = true;

  // Pre-calculate clean track map from best flying lap
  const activeTrack = typeof getActiveTrackProfile === 'function' ? getActiveTrackProfile() : null;
  const trackName = activeTrack ? activeTrack.name : (state.sessionInfo?.track || 'Thunderhill Raceway');
  const rawTurns = typeof getActiveTrackTurns === 'function' ? getActiveTrackTurns() : null;
  // Deep-clone turns array so calculations never mutate canonical state.tracks definition
  const turns = rawTurns ? JSON.parse(JSON.stringify(rawTurns)) : null;

  let trackRecs = [];
  const flyingLaps = (state.laps && state.laps.length > 0)
    ? state.laps.filter(l => l.duration_s > 30 && (!l.is_out_lap && !l.is_in_lap && l.lap_number > 0))
    : [];
  const bestLap = (flyingLaps.length > 0)
    ? flyingLaps.reduce((min, l) => (l.duration_s < min.duration_s ? l : min), flyingLaps[0])
    : (state.laps && state.laps.find(l => l.is_best && l.lap_number > 0));

  if (bestLap) {
    trackRecs = state.records.filter(r => r.time_s >= bestLap.start_time_s && r.time_s <= bestLap.end_time_s && r.gps_lat !== null && r.gps_lon !== null);
  }
  if (trackRecs.length < 20) {
    // If no flying lap, find first S/F gate crossing so trackRecs starts at S/F line
    const sfGate = state.gates && state.gates.find(g => g.type === 'sf');
    let sfIdx = 0;
    if (sfGate) {
      let minD = Infinity;
      for (let i = 0; i < state.records.length; i++) {
        const r = state.records[i];
        if (r.gps_lat === null) continue;
        const d = (typeof haversineDistanceM === 'function')
          ? haversineDistanceM(sfGate.lat, sfGate.lon, r.gps_lat, r.gps_lon)
          : Math.hypot(sfGate.lat - r.gps_lat, sfGate.lon - r.gps_lon) * 111000;
        if (d < minD) { minD = d; sfIdx = i; }
      }
    }
    trackRecs = state.records.slice(sfIdx).filter(r => r.gps_lat !== null && r.gps_lon !== null && (r.speed_kmh || 0) > 20);
  }

  let mapPoints = [];
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  let dLat = 1, dLon = 1;
  let mapGeo = { minLat: 0, minLon: 0, cosLat: 1, maxSpan: 1, offX: 0, offY: 0 };

  if (trackRecs.length > 20) {
    trackRecs.forEach(r => {
      if (r.gps_lat < minLat) minLat = r.gps_lat;
      if (r.gps_lat > maxLat) maxLat = r.gps_lat;
      if (r.gps_lon < minLon) minLon = r.gps_lon;
      if (r.gps_lon > maxLon) maxLon = r.gps_lon;
    });
    // Add 4% margin
    const padLat = (maxLat - minLat) * 0.04 || 0.0001;
    const padLon = (maxLon - minLon) * 0.04 || 0.0001;
    minLat -= padLat; maxLat += padLat;
    minLon -= padLon; maxLon += padLon;
    dLat = maxLat - minLat || 1;
    dLon = maxLon - minLon || 1;

    const midLat = (minLat + maxLat) / 2;
    const cosLat = Math.cos(midLat * Math.PI / 180.0);
    const spanLon = (maxLon - minLon) * cosLat || 0.0001;
    const spanLat = (maxLat - minLat) || 0.0001;
    const maxSpan = Math.max(spanLon, spanLat);

    const offX = (1.0 - (spanLon / maxSpan)) / 2;
    const offY = (1.0 - (spanLat / maxSpan)) / 2;

    mapGeo = { minLat, minLon, cosLat, maxSpan, offX, offY };

    const nRecs = trackRecs.length;
    const step = Math.max(1, Math.floor(nRecs / 160));
    for (let i = 0; i < nRecs; i += step) {
      let latSum = 0, lonSum = 0, wSum = 0;
      for (let w = -2; w <= 2; w++) {
        const k = Math.max(0, Math.min(nRecs - 1, i + w));
        latSum += trackRecs[k].gps_lat;
        lonSum += trackRecs[k].gps_lon;
        wSum++;
      }
      const curLat = latSum / wSum;
      const curLon = lonSum / wSum;
      const nx = offX + ((curLon - minLon) * cosLat) / maxSpan;
      const ny = offY + (1 - (curLat - minLat) / maxSpan);
      mapPoints.push([nx, ny]);
    }
  }

  // Pre-calculate each turn's true distance along the circuit (anchored from S/F line)
  if (turns && turns.length > 0 && trackRecs.length > 20) {
    const baseDist = trackRecs[0].distance_m || 0;
    turns.forEach(t => {
      let minD = Infinity;
      let bestDist = 0;
      for (let i = 0; i < trackRecs.length; i++) {
        const tr = trackRecs[i];
        if (tr.gps_lat === null || tr.gps_lon === null) continue;
        const d = (typeof haversineDistanceM === 'function')
          ? haversineDistanceM(t.lat, t.lon, tr.gps_lat, tr.gps_lon)
          : Math.hypot(t.lat - tr.gps_lat, t.lon - tr.gps_lon) * 111000;
        if (d < minD) {
          minD = d;
          bestDist = (tr.distance_m || 0) - baseDist;
        }
      }
      t._circuitDist = bestDist;
    });
    // Only sort if turns do not already have canonical number defined
    if (turns.length > 0 && turns[0].number === undefined) {
      turns.sort((a, b) => (a._circuitDist || 0) - (b._circuitDist || 0));
    }
  }

  // Calculate actual session telemetry peaks for G-meter & lean angle
  let peakLat = 0;
  let peakBrake = 0;
  let maxLeanL = 0;
  let maxLeanR = 0;
  if (state.records && state.records.length > 0) {
    state.records.forEach(r => {
      const alat = Math.abs(r.accel_lat_g || 0);
      if (alat > peakLat) peakLat = alat;
      const along = r.accel_long_g || 0;
      if (along < peakBrake) peakBrake = along;
      const lean = r.lean_angle_deg || 0;
      if (lean < 0 && Math.abs(lean) > maxLeanL) maxLeanL = Math.abs(lean);
      if (lean > 0 && lean > maxLeanR) maxLeanR = lean;
    });
  }
  const sessionPeaks = {
    peakLat: peakLat > 0 ? parseFloat(peakLat.toFixed(2)) : 1.10,
    peakBrake: peakBrake < 0 ? parseFloat(peakBrake.toFixed(2)) : -1.66,
    maxLeanL: maxLeanL > 0 ? Math.round(maxLeanL) : 48,
    maxLeanR: maxLeanR > 0 ? Math.round(maxLeanR) : 45
  };

  // Trail buffer for G-meter
  const gTrail = [];

  // WebCodecs Check
  const hasWebCodecs = typeof VideoEncoder !== 'undefined' && typeof WebMMuxer !== 'undefined';

  if (hasWebCodecs) {
    try {
      if (bgMode === 'dual_matte') {
        const { streamTarget: colorStreamTarget, memTarget: colorMemTarget } = createChunkedMuxerTarget();
        const { streamTarget: alphaStreamTarget, memTarget: alphaMemTarget } = createChunkedMuxerTarget();

        const colorMuxer = new WebMMuxer.Muxer({
          target: colorStreamTarget,
          video: { codec: 'V_VP9', width: canvasW, height: canvasH, frameRate: fps }
        });
        const alphaMuxer = new WebMMuxer.Muxer({
          target: alphaStreamTarget,
          video: { codec: 'V_VP9', width: canvasW, height: canvasH, frameRate: fps }
        });

        const colorEncoder = new VideoEncoder({
          output: (chunk, meta) => colorMuxer.addVideoChunk(chunk, meta),
          error: (e) => console.error('Color VideoEncoder error:', e)
        });
        const alphaEncoder = new VideoEncoder({
          output: (chunk, meta) => alphaMuxer.addVideoChunk(chunk, meta),
          error: (e) => console.error('Alpha VideoEncoder error:', e)
        });

        // Alpha matte is a grayscale mask; cap bitrate to keep memory and file size lean
        const alphaBitrate = Math.min(10_000_000, Math.round(bitrate * 0.35));

        await colorEncoder.configure({ codec: 'vp09.00.10.08', width: canvasW, height: canvasH, bitrate: bitrate, framerate: fps });
        await alphaEncoder.configure({ codec: 'vp09.00.10.08', width: canvasW, height: canvasH, bitrate: alphaBitrate, framerate: fps });

        const smoothedG = { glong: 0, glat: 0 };

        for (let f = 0; f <= totalFrames; f++) {
          // Enforce WebCodecs backpressure: pause if encoder queues have > 5 unencoded frames
          await waitForDualEncoderBackpressure(colorEncoder, alphaEncoder, 5);

          const tVideo = f * dt;
          const tActual = startSec + tVideo;
          const animTime = useIntro ? Math.min(2.5, tVideo) : 2.5;

          const frameData = computeSeamBarTelemetryFrame(tActual, state.records, state.laps, turns, mapPoints, minLat, maxLat, minLon, dLon, dLat, trackName, gTrail, sessionPeaks, smoothedG, mapGeo);

          transCtx.clearRect(0, 0, canvasW, canvasH);
          transCtx.save();
          transCtx.translate(barOffsetX, barOffsetY);
          drawSeamBarCanvas(transCtx, renderBarW, renderBarH, frameData, config, animTime);
          transCtx.restore();

          // Color Canvas over pure solid black
          colorCtx.fillStyle = '#000000';
          colorCtx.fillRect(0, 0, canvasW, canvasH);
          colorCtx.drawImage(transCanvas, 0, 0);

          // Alpha Matte (fast 32-bit in-place)
          generateAlphaMatteFromCanvas(transCanvas, alphaCanvas);

          const ts = Math.round(tVideo * 1_000_000);
          const colorFrame = new VideoFrame(colorCanvas, { timestamp: ts });
          const alphaFrame = new VideoFrame(alphaCanvas, { timestamp: ts });

          const isKey = f % (fps * 2) === 0;
          colorEncoder.encode(colorFrame, { keyFrame: isKey });
          alphaEncoder.encode(alphaFrame, { keyFrame: isKey });
          colorFrame.close();
          alphaFrame.close();

          if (f % 20 === 0 || f === totalFrames) {
            const pct = Math.round((f / totalFrames) * 100);
            dom.renderProgressFill.style.width = `${pct}%`;
            dom.renderProgressText.textContent = `Encoding Dual-Matte Seam Bar (${fps} FPS)... ${pct}%`;
            await new Promise(r => setTimeout(r, 0));
          }
        }

        await Promise.all([colorEncoder.flush(), alphaEncoder.flush()]);
        colorMuxer.finalize();
        alphaMuxer.finalize();

        const colorBlob = colorMemTarget.getBlob('video/webm');
        const alphaBlob = alphaMemTarget.getBlob('video/webm');

        downloadVideoBlob(colorBlob, `${baseFileName}_Color.webm`);
        setTimeout(() => downloadVideoBlob(alphaBlob, `${baseFileName}_AlphaMatte.webm`), 500);

        dom.renderProgressBarWrap.style.display = 'none';
        if (dom.btnRenderSeamVideo) dom.btnRenderSeamVideo.disabled = false;
        return;
      }

      // Single Video Output (Transparent VP9, Side-by-Side, Dark, Green)
      const isTrans = (bgMode === 'transparent');
      const targetCanvas = (bgMode === 'side_by_side') ? sbsCanvas : (isTrans ? transCanvas : colorCanvas);
      const { streamTarget, memTarget } = createChunkedMuxerTarget();

      const muxer = new WebMMuxer.Muxer({
        target: streamTarget,
        video: {
          codec: 'V_VP9',
          width: (bgMode === 'side_by_side') ? canvasW * 2 : canvasW,
          height: canvasH,
          alpha: isTrans,
          frameRate: fps
        }
      });

      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error('VideoEncoder error:', e)
      });

      await encoder.configure({
        codec: 'vp09.00.10.08',
        width: (bgMode === 'side_by_side') ? canvasW * 2 : canvasW,
        height: canvasH,
        bitrate: bitrate,
        framerate: fps,
        alpha: isTrans ? 'keep' : 'discard'
      });

      const smoothedG = { glong: 0, glat: 0 };

      for (let f = 0; f <= totalFrames; f++) {
        // Enforce WebCodecs backpressure
        await waitForEncoderBackpressure(encoder, 5);

        const tVideo = f * dt;
        const tActual = startSec + tVideo;
        const animTime = useIntro ? Math.min(2.5, tVideo) : 2.5;

        const frameData = computeSeamBarTelemetryFrame(tActual, state.records, state.laps, turns, mapPoints, minLat, maxLat, minLon, dLon, dLat, trackName, gTrail, sessionPeaks, smoothedG, mapGeo);

        transCtx.clearRect(0, 0, canvasW, canvasH);
        transCtx.save();
        transCtx.translate(barOffsetX, barOffsetY);
        drawSeamBarCanvas(transCtx, renderBarW, renderBarH, frameData, config, animTime);
        transCtx.restore();

        if (bgMode === 'side_by_side') {
          generateAlphaMatteFromCanvas(transCanvas, alphaCanvas);
          sbsCtx.fillStyle = '#000000';
          sbsCtx.fillRect(0, 0, canvasW * 2, canvasH);
          sbsCtx.drawImage(transCanvas, 0, 0);
          sbsCtx.drawImage(alphaCanvas, canvasW, 0);
        } else if (!isTrans) {
          colorCtx.fillStyle = bgMode === 'greenscreen' ? '#00ff00' : (bgMode === 'bluescreen' ? '#0000ff' : '#0b0d12');
          colorCtx.fillRect(0, 0, canvasW, canvasH);
          colorCtx.drawImage(transCanvas, 0, 0);
        }

        const ts = Math.round(tVideo * 1_000_000);
        const frame = new VideoFrame(targetCanvas, { timestamp: ts });
        encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
        frame.close();

        if (f % 20 === 0 || f === totalFrames) {
          const pct = Math.round((f / totalFrames) * 100);
          dom.renderProgressFill.style.width = `${pct}%`;
          dom.renderProgressText.textContent = `Encoding Seam Bar (${fps} FPS)... ${pct}%`;
          await new Promise(r => setTimeout(r, 0));
        }
      }

      await encoder.flush();
      muxer.finalize();
      const blob = memTarget.getBlob('video/webm');
      downloadVideoBlob(blob, `${baseFileName}_${bgMode}.webm`);

      dom.renderProgressBarWrap.style.display = 'none';
      if (dom.btnRenderSeamVideo) dom.btnRenderSeamVideo.disabled = false;
      return;
    } catch (err) {
      console.warn('WebCodecs exception in Seam Bar, falling back to MediaRecorder:', err);
    }
  }

  // Fallback MediaRecorder
  const fallbackCanvas = (bgMode === 'side_by_side') ? sbsCanvas : colorCanvas;
  const stream = fallbackCanvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm', videoBitsPerSecond: bitrate });
  const chunks = [];

  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    downloadVideoBlob(blob, `${baseFileName}_fallback.webm`);
    dom.renderProgressBarWrap.style.display = 'none';
    if (dom.btnRenderSeamVideo) dom.btnRenderSeamVideo.disabled = false;
  };

  recorder.start(1000);
  const frameIntervalMs = 1000 / fps;
  const smoothedG = { glong: 0, glat: 0 };

  for (let f = 0; f <= totalFrames; f++) {
    const tVideo = f * dt;
    const tActual = startSec + tVideo;
    const animTime = useIntro ? Math.min(2.5, tVideo) : 2.5;

    const frameData = computeSeamBarTelemetryFrame(tActual, state.records, state.laps, turns, mapPoints, minLat, maxLat, minLon, dLon, dLat, trackName, gTrail, sessionPeaks, smoothedG, mapGeo);

    transCtx.clearRect(0, 0, canvasW, canvasH);
    transCtx.save();
    transCtx.translate(barOffsetX, barOffsetY);
    drawSeamBarCanvas(transCtx, renderBarW, renderBarH, frameData, config, animTime);
    transCtx.restore();

    colorCtx.fillStyle = bgMode === 'greenscreen' ? '#00ff00' : '#0b0d12';
    colorCtx.fillRect(0, 0, canvasW, canvasH);
    colorCtx.drawImage(transCanvas, 0, 0);

    const pct = Math.round((f / totalFrames) * 100);
    dom.renderProgressFill.style.width = `${pct}%`;
    dom.renderProgressText.textContent = `Paced Recording Seam Bar... ${pct}%`;
    await new Promise(r => setTimeout(r, frameIntervalMs));
  }

  recorder.stop();
}

/**
 * Computes exact, smoothly interpolated frame telemetry at time tSec
 */
function computeSeamBarTelemetryFrame(tSec, records, laps, turns, mapPoints, minLat, maxLat, minLon, dLon, dLat, trackName, gTrail, sessionPeaks, smoothedG, mapGeo) {
  if (!records || records.length === 0) return getSeamBarSampleData(0);

  // Binary search for surrounding records
  let low = 0, high = records.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (records[mid].time_s < tSec) low = mid + 1;
    else high = mid - 1;
  }

  const idx0 = Math.max(0, Math.min(records.length - 1, high));
  const idx1 = Math.min(records.length - 1, idx0 + 1);
  const r0 = records[idx0];
  const r1 = records[idx1];

  let u = 0;
  if (r1.time_s > r0.time_s) {
    u = Math.max(0, Math.min(1, (tSec - r0.time_s) / (r1.time_s - r0.time_s)));
  }

  // Smooth linear interpolations
  const spdKmh = (r0.speed_kmh || 0) * (1 - u) + (r1.speed_kmh || 0) * u;
  const spd = spdKmh * (state.unitMph ? 0.621371 : 1.0);
  const rawLong = (r0.accel_long_g || 0) * (1 - u) + (r1.accel_long_g || 0) * u;
  const rawLat = (r0.accel_lat_g || 0) * (1 - u) + (r1.accel_lat_g || 0) * u;

  // Apply EMA smoothing to G forces
  let gLong = rawLong;
  let gLat = rawLat;
  if (smoothedG) {
    smoothedG.glong = smoothedG.glong * 0.82 + rawLong * 0.18;
    smoothedG.glat = smoothedG.glat * 0.82 + rawLat * 0.18;
    gLong = smoothedG.glong;
    gLat = smoothedG.glat;
  }

  const lean = (r0.lean_angle_deg || 0) * (1 - u) + (r1.lean_angle_deg || 0) * u;
  const tps = (r0.tps_pct || 0) * (1 - u) + (r1.tps_pct || 0) * u;
  const lat = (r0.gps_lat !== null && r1.gps_lat !== null) ? (r0.gps_lat * (1 - u) + r1.gps_lat * u) : null;
  const lon = (r0.gps_lon !== null && r1.gps_lon !== null) ? (r0.gps_lon * (1 - u) + r1.gps_lon * u) : null;

  // G-meter trail maintenance
  gTrail.push({ glong: gLong, glat: gLat });
  if (gTrail.length > 6) gTrail.shift();

  // Active Lap & Completed Laps
  let activeLap = laps ? laps.find(l => tSec >= l.start_time_s && tSec <= l.end_time_s) : null;
  if (!activeLap && laps && laps.length > 0) {
    activeLap = laps[0];
  }

  const lapNum = activeLap ? activeLap.lap_number : 1;
  const totalLaps = laps ? laps.length : 1;
  const lapElapsed = activeLap ? Math.max(0, tSec - activeLap.start_time_s) : 0;
  let timeStr = formatMotoGPTimer(lapElapsed);

  let deltaStr = null;
  let deltaColor = '#8e94a5';
  let hasSplit = false;
  let isGateHighlight = 0.0;
  let isFastest = false;
  let finishState = null;

  const s1Dur = (activeLap && activeLap.sectors && activeLap.sectors[0]) || ((activeLap ? activeLap.duration_s : 100) * 0.28);
  const s2Dur = (activeLap && activeLap.sectors && activeLap.sectors[1]) || ((activeLap ? activeLap.duration_s : 100) * 0.38);
  const s3Dur = (activeLap && activeLap.sectors && activeLap.sectors[2]) || ((activeLap ? activeLap.duration_s : 100) * 0.34);
  const totalLapDur = (activeLap && activeLap.duration_s) || (s1Dur + s2Dur + s3Dur);
  const lapProgressFrac = Math.min(1.0, lapElapsed / Math.max(1, totalLapDur));

  const tSplit1 = s1Dur;
  const tSplit2 = s1Dur + s2Dur;
  const tSplit3 = totalLapDur;

  const ref = activeLap ? getBenchmarkReference(activeLap) : null;
  const hasBenchmark = ref !== null && ref !== undefined && typeof ref.s1 === 'number';

  // Live Sector Blocks
  const sectors = [
    { color: 'rgba(255, 255, 255, 0.12)' },
    { color: 'rgba(255, 255, 255, 0.12)' },
    { color: 'rgba(255, 255, 255, 0.12)' }
  ];

  const transDuration = 0.25;

  if (hasBenchmark) {
    const r1 = ref.s1;
    const r2 = ref.s2;
    const refTotal = ref.total;
    const d1 = s1Dur - r1;
    const d2 = (s1Dur + s2Dur) - (r1 + r2);
    const d3 = totalLapDur - refTotal;

    // Sectors track coloring
    if (lapElapsed >= tSplit1) {
      sectors[0].color = d1 < 0 ? '#ff1744' : (d1 <= 0.5 ? '#ff8c00' : '#8e94a5');
    }
    if (lapElapsed >= tSplit2) {
      sectors[1].color = d2 < 0 ? '#ff1744' : (d2 <= 0.5 ? '#ff8c00' : '#8e94a5');
    }
    if (lapElapsed >= tSplit3) {
      sectors[2].color = d3 < 0 ? '#ff1744' : (d3 <= 0.5 ? '#ff8c00' : '#8e94a5');
    }

    // Split 1 pop (5.0s window after Gate 1)
    if (lapElapsed >= tSplit1 && lapElapsed < tSplit1 + 5.0) {
      hasSplit = true;
      const dt = lapElapsed - tSplit1;
      const u = dt < transDuration ? (dt / transDuration) : (dt > 5.0 - transDuration ? (5.0 - dt) / transDuration : 1.0);
      isGateHighlight = Math.max(0, Math.min(1, u * u * (3 - 2 * u)));
      timeStr = formatMotoGPTimer(tSplit1);
      deltaStr = `${d1 < 0 ? '' : '+'}${d1.toFixed(3)}`;
      deltaColor = d1 < 0 ? '#ff1744' : (d1 <= 0.5 ? '#ff8c00' : '#8e94a5');
      isFastest = (d1 < 0);
    }
    // Split 2 pop (5.0s window after Gate 2)
    else if (lapElapsed >= tSplit2 && lapElapsed < tSplit2 + 5.0) {
      hasSplit = true;
      const dt = lapElapsed - tSplit2;
      const u = dt < transDuration ? (dt / transDuration) : (dt > 5.0 - transDuration ? (5.0 - dt) / transDuration : 1.0);
      isGateHighlight = Math.max(0, Math.min(1, u * u * (3 - 2 * u)));
      timeStr = formatMotoGPTimer(tSplit2);
      deltaStr = `${d2 < 0 ? '' : '+'}${d2.toFixed(3)}`;
      deltaColor = d2 < 0 ? '#ff1744' : (d2 <= 0.5 ? '#ff8c00' : '#8e94a5');
      isFastest = (d2 < 0);
    }
    // Finish hold
    else if (lapElapsed >= tSplit3) {
      const finishElapsed = lapElapsed - tSplit3;
      const holdDur = (d3 < 0 || activeLap.is_best) ? 7.0 : 5.0;
      if (finishElapsed < holdDur) {
        finishState = {
          isFinished: true,
          isFastest: d3 < 0 || activeLap.is_best,
          finishElapsed: finishElapsed,
          lapTimeStr: formatMotoGPTimer(totalLapDur),
          deltaStr: `${d3 < 0 ? '' : '+'}${d3.toFixed(3)}`,
          deltaColor: d3 < 0 ? '#ff1744' : (d3 <= 0.5 ? '#ff8c00' : '#8e94a5')
        };
      }
    }
  } else {
    // No benchmark lap completed prior to this in the session:
    // Zero split difference shown! Clean timer running.
    if (lapElapsed >= tSplit1) sectors[0].color = 'rgba(255, 255, 255, 0.4)';
    if (lapElapsed >= tSplit2) sectors[1].color = 'rgba(255, 255, 255, 0.4)';
    if (lapElapsed >= tSplit3) sectors[2].color = 'rgba(255, 255, 255, 0.4)';

    if (lapElapsed >= tSplit3) {
      const finishElapsed = lapElapsed - tSplit3;
      if (finishElapsed < 5.0) {
        finishState = {
          isFinished: true,
          isFastest: true,
          finishElapsed: finishElapsed,
          lapTimeStr: formatMotoGPTimer(totalLapDur),
          deltaStr: '★ PB',
          deltaColor: '#6f2dbd'
        };
      }
    }
  }

  // Completed Flying Laps strictly prior to tSec
  const completedLaps = [];
  if (laps && laps.length > 0) {
    const finishedLaps = laps.filter(l => l.end_time_s <= tSec && l.duration_s > 40 && l.lap_number >= 1 && (!l.is_out_lap && !l.is_in_lap));
    const bestLap = finishedLaps.length > 0 ? finishedLaps.reduce((min, l) => l.duration_s < min.duration_s ? l : min, finishedLaps[0]) : null;

    finishedLaps.forEach(fl => {
      const isPb = bestLap && fl.lap_number === bestLap.lap_number;
      const dPb = bestLap ? fl.duration_s - bestLap.duration_s : 0;
      completedLaps.push({
        lapNumber: fl.lap_number,
        lapTimeStr: formatMotoGPTimer(fl.duration_s),
        deltaStr: isPb ? '★ PB' : `+${dPb.toFixed(3)}`,
        deltaColor: isPb ? '#6f2dbd' : '#8e94a5',
        isPb: isPb
      });
    });
  }

  // Bike map position (Flat 2D projection with North Up)
  let bikePos = null;
  if (lat !== null && lon !== null) {
    if (mapGeo && mapGeo.maxSpan) {
      bikePos = {
        x: Math.max(0, Math.min(1, mapGeo.offX + ((lon - mapGeo.minLon) * mapGeo.cosLat) / mapGeo.maxSpan)),
        y: Math.max(0, Math.min(1, mapGeo.offY + (1 - (lat - mapGeo.minLat) / mapGeo.maxSpan)))
      };
    } else if (dLon && dLat) {
      bikePos = {
        x: Math.max(0, Math.min(1, (lon - minLon) / dLon)),
        y: Math.max(0, Math.min(1, 1 - (lat - minLat) / dLat))
      };
    }
  }

  // Turn Proximity & Track-Progression Sequential Ribbon
  const turnsList = (turns && turns.length > 0) ? turns.map((t, i) => ({
    num: (t.number !== undefined ? t.number : (i + 1)).toString().replace(/^T/i, ''),
    name: t.name || ('Turn ' + (t.number !== undefined ? t.number : (i + 1))),
    isLeft: (t.direction || '').toLowerCase().includes('left'),
    circuitDist: t._circuitDist !== undefined ? t._circuitDist : 0,
    lat: t.lat,
    lon: t.lon
  })) : [];

  let tNum = '1';
  let tName = 'Turn 1';
  let isLeft = true;
  let distM = 120;
  let activeTurnIdx = 0;
  let scrollPos = 0;

  if (turnsList.length > 0) {
    // If turns don't have circuit distances yet, calculate them once from records (anchored to S/F)
    if (turnsList.length > 1 && turnsList[1].circuitDist === 0 && records && records.length > 20) {
      const refLap = (laps && laps.find(l => l.lap_number > 0 && l.duration_s > 30)) || (activeLap && activeLap.lap_number > 0 ? activeLap : null);
      let startIdx = 0;
      let endIdx = records.length - 1;
      if (refLap) {
        startIdx = refLap.start_index || 0;
        endIdx = refLap.end_index || records.length - 1;
      } else {
        const sfGate = state.gates && state.gates.find(g => g.type === 'sf');
        if (sfGate) {
          let minD = Infinity;
          for (let i = 0; i < records.length; i++) {
            const r = records[i];
            if (!r || r.gps_lat === null) continue;
            const d = (typeof haversineDistanceM === 'function')
              ? haversineDistanceM(sfGate.lat, sfGate.lon, r.gps_lat, r.gps_lon)
              : Math.hypot(sfGate.lat - r.gps_lat, sfGate.lon - r.gps_lon) * 111000;
            if (d < minD) { minD = d; startIdx = i; }
          }
        }
      }
      const baseDist = (records[startIdx] && records[startIdx].distance_m) || 0;
      turnsList.forEach(t => {
        let minD = Infinity;
        let bestDist = 0;
        for (let i = startIdx; i <= endIdx; i++) {
          const r = records[i];
          if (!r || r.gps_lat === null || r.gps_lon === null) continue;
          const d = (typeof haversineDistanceM === 'function')
            ? haversineDistanceM(t.lat, t.lon, r.gps_lat, r.gps_lon)
            : Math.hypot(t.lat - r.gps_lat, t.lon - r.gps_lon) * 111000;
          if (d < minD) {
            minD = d;
            bestDist = (r.distance_m || 0) - baseDist;
          }
        }
        t.circuitDist = bestDist;
      });
      // Sort only if turns are not already explicitly numbered
      if (turns && turns[0] && turns[0].number === undefined) {
        turnsList.sort((a, b) => a.circuitDist - b.circuitDist);
      }
    }

    if (activeLap && records && records.length > 0) {
      const isOutLap = activeLap.lap_number === 0;
      const lapStartIdx = activeLap.start_index !== undefined ? activeLap.start_index : 0;
      const lapEndIdx = activeLap.end_index !== undefined ? activeLap.end_index : (records.length - 1);
      const lapStartDist = (records[lapStartIdx] && records[lapStartIdx].distance_m) || 0;
      const lapEndDist = (records[lapEndIdx] && records[lapEndIdx].distance_m) || (lapStartDist + 4500);
      const lapLen = Math.max(100, lapEndDist - lapStartDist);

      let curDist = 0;

      if (isOutLap && lat !== null && lon !== null && turnsList.length > 0) {
        // OUT-LAP OR DELAYED GPS SATELLITE LOCK:
        // The motorcycle entered track after Turn 1 (e.g. pit exit at T2/T3) or GPS locked down the track.
        // Identify the true upcoming turn using GPS proximity along the circuit loop:
        let minD = Infinity;
        let closestIdx = 0;
        for (let i = 0; i < turnsList.length; i++) {
          const t = turnsList[i];
          const d = (typeof haversineDistanceM === 'function')
            ? haversineDistanceM(t.lat, t.lon, lat, lon)
            : Math.hypot(t.lat - lat, t.lon - lon) * 111000;
          if (d < minD) {
            minD = d;
            closestIdx = i;
          }
        }

        const nextIdx = (closestIdx + 1) % turnsList.length;
        const nextTurn = turnsList[nextIdx];
        const dToNext = (typeof haversineDistanceM === 'function')
          ? haversineDistanceM(nextTurn.lat, nextTurn.lon, lat, lon)
          : Math.hypot(nextTurn.lat - lat, nextTurn.lon - lon) * 111000;

        // If exiting closestIdx towards nextTurn (past apex within 18m)
        if (dToNext < minD + 15 && minD < 18) {
          const p = Math.max(0, Math.min(1, minD / 18));
          const snapEase = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          scrollPos = closestIdx + snapEase;
          const showNext = p >= 0.5;
          const targetTurn = turnsList[showNext ? nextIdx : closestIdx];
          activeTurnIdx = showNext ? nextIdx : closestIdx;
          tNum = targetTurn.num;
          tName = targetTurn.name;
          isLeft = targetTurn.isLeft;
          distM = Math.max(0, Math.round(showNext ? dToNext : minD));
        } else if (dToNext < minD) {
          activeTurnIdx = nextIdx;
          scrollPos = nextIdx;
          const targetTurn = turnsList[nextIdx];
          tNum = targetTurn.num;
          tName = targetTurn.name;
          isLeft = targetTurn.isLeft;
          distM = Math.max(0, Math.round(dToNext));
        } else {
          activeTurnIdx = closestIdx;
          scrollPos = closestIdx;
          const targetTurn = turnsList[closestIdx];
          tNum = targetTurn.num;
          tName = targetTurn.name;
          isLeft = targetTurn.isLeft;
          distM = Math.max(0, Math.round(minD));
        }
      } else {
        // FLYING LAP:
        // Clean odometer progression from Start/Finish line (0m to lapLen)
        curDist = Math.max(0, (r0.distance_m || 0) - lapStartDist);

        // Sequential track progression: find the next upcoming turn along the asphalt
        let found = false;
        for (let i = 0; i < turnsList.length; i++) {
          const turn = turnsList[i];
          // Keep turn active until 18m past apex
          if (turn.circuitDist >= curDist - 18) {
            activeTurnIdx = i;
            tNum = turn.num;
            tName = turn.name;
            isLeft = turn.isLeft;
            distM = Math.max(0, Math.round(turn.circuitDist - curDist));
            found = true;
            break;
          }
        }

        if (!found) {
          // Past the final turn on front straight, approaching S/F and Turn 1 of next lap
          activeTurnIdx = 0;
          tNum = turnsList[0].num;
          tName = turnsList[0].name;
          isLeft = turnsList[0].isLeft;
          distM = Math.max(0, Math.round((lapLen - curDist) + (turnsList[0].circuitDist || 0)));
        }

        // Calculate continuous scrollPos with snappy acceleration & grow/shrink on turn exit
        scrollPos = activeTurnIdx;
        const curActiveTurn = turnsList[activeTurnIdx];
        if (curActiveTurn && curActiveTurn.circuitDist !== undefined) {
          const distToApex = curActiveTurn.circuitDist - curDist;
          if (distToApex <= 0 && distToApex >= -18) {
            const p = Math.max(0, Math.min(1, (-distToApex) / 18));
            // Snappy cubic ease-in-out curve for fast, crisp transition
            const snapEase = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
            scrollPos = activeTurnIdx + snapEase;

            // When past halfway mark of slide, switch countdown to next turn
            if (p >= 0.5) {
              const nextIdx = (activeTurnIdx + 1) % turnsList.length;
              const nextTurn = turnsList[nextIdx];
              tNum = nextTurn.num;
              tName = nextTurn.name;
              isLeft = nextTurn.isLeft;
              const nextDist = nextTurn.circuitDist !== undefined ? nextTurn.circuitDist : (lapLen + (turnsList[0].circuitDist || 0));
              distM = Math.max(0, Math.round(nextDist >= curDist ? nextDist - curDist : (lapLen - curDist + nextDist)));
            }
          }
        }
      }
    } else if (lat !== null && lon !== null) {
      // Fallback: Proximity search using valid haversineDistanceM
      let closestT = null;
      let minD = Infinity;
      let cIdx = 0;
      turnsList.forEach((t, idx) => {
        if (t.lat !== undefined && t.lon !== undefined) {
          const d = (typeof haversineDistanceM === 'function')
            ? haversineDistanceM(lat, lon, t.lat, t.lon)
            : Math.hypot(lat - t.lat, lon - t.lon) * 111000;
          if (d < minD) {
            minD = d;
            closestT = t;
            cIdx = idx;
          }
        }
      });
      if (closestT) {
        tNum = closestT.num;
        tName = closestT.name;
        isLeft = closestT.isLeft;
        distM = Math.round(minD);
        activeTurnIdx = cIdx;
        scrollPos = cIdx;
      }
    }
  }

  const finalScrollPos = scrollPos;

  return {
    rider: {
      riderNum: (dom.inputRiderNum ? dom.inputRiderNum.value : state.motogp.riderNum) || '512',
      riderName: (dom.inputRiderName ? dom.inputRiderName.value : state.motogp.riderName) || 'SLOW FAST GUY',
      bikeName: (dom.inputBikeName ? dom.inputBikeName.value : state.motogp.bikeName) || 'SFV2',
      badgeColor: (dom.inputNumberColor ? dom.inputNumberColor.value : state.motogp.badgeColor) || '#e10600',
      tyreFront: (state.motogp && state.motogp.tyreFront) || 'M',
      tyreRear: (state.motogp && state.motogp.tyreRear) || 'S',
      trackName: trackName
    },
    timing: {
      lapNum: lapNum,
      totalLaps: totalLaps,
      timeStr: timeStr,
      deltaStr: deltaStr,
      deltaColor: deltaColor,
      hasSplit: hasSplit,
      isGateHighlight: isGateHighlight,
      isFastest: isFastest,
      finishState: finishState,
      lapProgressFrac: lapProgressFrac,
      sectors: sectors,
      completedLaps: completedLaps
    },
    map: {
      pathPoints: mapPoints,
      bikePos: bikePos,
      sfPos: mapPoints[0] ? { x: mapPoints[0][0], y: mapPoints[0][1] } : null,
      trackName: trackName
    },
    turn: {
      turns: turnsList,
      activeIdx: activeTurnIdx,
      scrollPos: finalScrollPos,
      turnNum: tNum,
      turnName: tName,
      isLeft: isLeft,
      distM: distM
    },
    gmeter: {
      gLong: gLong,
      gLat: gLat,
      peakLat: sessionPeaks ? sessionPeaks.peakLat : 1.10,
      peakBrake: sessionPeaks ? sessionPeaks.peakBrake : -1.66,
      trail: gTrail
    },
    lean: {
      leanDeg: Math.round(lean),
      maxLeanL: sessionPeaks ? sessionPeaks.maxLeanL : 48,
      maxLeanR: sessionPeaks ? sessionPeaks.maxLeanR : 45
    },
    pedals: {
      tps: Math.max(0, Math.min(100, tps)),
      brakePct: gLong < -0.2 ? Math.min(100, Math.abs(gLong) / 1.5 * 100) : 0
    }
  };
}

