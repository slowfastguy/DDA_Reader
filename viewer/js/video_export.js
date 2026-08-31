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

function generateAlphaMatteFromCanvas(srcCanvas, destCanvas) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const srcCtx = srcCanvas.getContext('2d');
  const destCtx = destCanvas.getContext('2d');

  const srcImgData = srcCtx.getImageData(0, 0, w, h);
  const srcData = srcImgData.data;
  const destImgData = destCtx.createImageData(w, h);
  const destData = destImgData.data;

  for (let i = 0; i < srcData.length; i += 4) {
    const a = srcData[i + 3];
    destData[i] = a;       // R (0 to 255 grayscale)
    destData[i + 1] = a;   // G
    destData[i + 2] = a;   // B
    destData[i + 3] = 255; // Fully opaque mask
  }

  destCtx.putImageData(destImgData, 0, 0);
}

function downloadVideoBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2500);
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
  const r1 = ref.s1;
  const r2 = ref.s2;
  const r3 = ref.s3;
  const refTotal = ref.total;

  const totalLapDuration = lapObj.duration_s;
  const isFastestLap = lapObj.is_best || (totalLapDuration <= refTotal);

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
        const colorMuxer = new WebMMuxer.Muxer({
          target: new WebMMuxer.ArrayBufferTarget(),
          video: { codec: 'V_VP9', width: cardW, height: cardH, frameRate: fps }
        });
        const alphaMuxer = new WebMMuxer.Muxer({
          target: new WebMMuxer.ArrayBufferTarget(),
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
        await alphaEncoder.configure({ codec: 'vp09.00.10.08', width: cardW, height: cardH, bitrate: 10_000_000, framerate: fps });

        for (let f = 0; f <= totalFrames; f++) {
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

          if (f % 25 === 0 || f === totalFrames) {
            const pct = Math.round((f / totalFrames) * 100);
            dom.renderProgressFill.style.width = `${pct}%`;
            dom.renderProgressText.textContent = `Encoding Dual Channel (Color + Alpha Matte)... ${pct}%`;
            await new Promise(r => setTimeout(r, 0));
          }
        }

        await Promise.all([colorEncoder.flush(), alphaEncoder.flush()]);
        colorMuxer.finalize();
        alphaMuxer.finalize();

        const colorBlob = new Blob([colorMuxer.target.buffer], { type: 'video/webm' });
        const alphaBlob = new Blob([alphaMuxer.target.buffer], { type: 'video/webm' });

        downloadVideoBlob(colorBlob, `${baseFileName}_Color.webm`);
        setTimeout(() => downloadVideoBlob(alphaBlob, `${baseFileName}_AlphaMatte.webm`), 500);

        dom.renderProgressBarWrap.style.display = 'none';
        dom.btnRenderVideo.disabled = false;
        return;
      }

      if (bgMode === 'side_by_side') {
        // Single Video containing Color on Left and Alpha Matte on Right
        const muxer = new WebMMuxer.Muxer({
          target: new WebMMuxer.ArrayBufferTarget(),
          video: { codec: 'V_VP9', width: cardW * 2, height: cardH, frameRate: fps }
        });
        const encoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e) => console.error('VideoEncoder error:', e)
        });
        await encoder.configure({ codec: 'vp09.00.10.08', width: cardW * 2, height: cardH, bitrate: 18_000_000, framerate: fps });

        for (let f = 0; f <= totalFrames; f++) {
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

          if (f % 25 === 0 || f === totalFrames) {
            const pct = Math.round((f / totalFrames) * 100);
            dom.renderProgressFill.style.width = `${pct}%`;
            dom.renderProgressText.textContent = `Encoding Side-by-Side Video... ${pct}%`;
            await new Promise(r => setTimeout(r, 0));
          }
        }

        await encoder.flush();
        muxer.finalize();
        const blob = new Blob([muxer.target.buffer], { type: 'video/webm' });
        downloadVideoBlob(blob, `${baseFileName}_SideBySide.webm`);
        dom.renderProgressBarWrap.style.display = 'none';
        dom.btnRenderVideo.disabled = false;
        return;
      }

      // Single Video Output (Transparent, Alpha Only, Green, Blue, Dark)
      const isTrans = (bgMode === 'transparent');
      const isAlphaOnly = (bgMode === 'alpha_only');
      const targetCanvas = isAlphaOnly ? alphaCanvas : (isTrans ? transCanvas : colorCanvas);

      const muxer = new WebMMuxer.Muxer({
        target: new WebMMuxer.ArrayBufferTarget(),
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

        if (f % 25 === 0 || f === totalFrames) {
          const pct = Math.round((f / totalFrames) * 100);
          dom.renderProgressFill.style.width = `${pct}%`;
          dom.renderProgressText.textContent = `Encoding ${fps} FPS Video... ${pct}%`;
          await new Promise(r => setTimeout(r, 0));
        }
      }

      await encoder.flush();
      muxer.finalize();
      const blob = new Blob([muxer.target.buffer], { type: 'video/webm' });
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

  recorder.start();

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
  let deltaStr = '+0.000';
  let deltaColor = '#8e94a5';
  let timeColor = '#ff8c00';
  let gatePopFactor = 0.0;
  let timeStr = '0:00.000';
  let ticFrac = 0;
  let finishState = null;

  const transDuration = 0.25; // 250ms smooth cubic ease matching CSS transition

  if (tRelLap < 0) {
    timeStr = formatMotoGPTimer(0);
    deltaStr = '+0.000';
    deltaColor = '#8e94a5';
    timeColor = '#ff8c00';
    ticFrac = 0;
    gatePopFactor = 0.0;
  } else if (tRelLap < tSplit1) {
    timeStr = formatMotoGPTimer(tRelLap);
    deltaStr = '+0.000';
    deltaColor = '#8e94a5';
    timeColor = '#ff8c00';
    ticFrac = (tRelLap / tSplit1) * (1 / 3);
    gatePopFactor = 0.0;
  } else if (tRelLap < tSplit2) {
    const d1 = s1Dur - r1;
    sectors[0].color = d1 < 0 ? '#ff1744' : (d1 <= 0.5 ? '#ff8c00' : '#8e94a5');
    deltaStr = `${d1 < 0 ? '' : '+'}${d1.toFixed(3)}`;
    deltaColor = d1 < 0 ? '#ff1744' : (d1 <= 0.5 ? '#ff8c00' : '#8e94a5');
    timeColor = deltaColor;
    ticFrac = (1 / 3) + ((tRelLap - tSplit1) / s2Dur) * (1 / 3);

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
      timeStr = formatMotoGPTimer(tSplit1);
    } else {
      gatePopFactor = 0.0;
      timeStr = formatMotoGPTimer(tRelLap);
    }
  } else if (tRelLap < totalLapDuration) {
    const d1 = s1Dur - r1;
    const d2 = (s1Dur + s2Dur) - (r1 + r2);
    sectors[0].color = d1 < 0 ? '#ff1744' : (d1 <= 0.5 ? '#ff8c00' : '#8e94a5');
    sectors[1].color = d2 < 0 ? '#ff1744' : (d2 <= 0.5 ? '#ff8c00' : '#8e94a5');
    deltaStr = `${d2 < 0 ? '' : '+'}${d2.toFixed(3)}`;
    deltaColor = d2 < 0 ? '#ff1744' : (d2 <= 0.5 ? '#ff8c00' : '#8e94a5');
    timeColor = deltaColor;
    ticFrac = (2 / 3) + (Math.min(1.0, (tRelLap - tSplit2) / s3Dur)) * (1 / 3);

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
      timeStr = formatMotoGPTimer(tSplit2);
    } else {
      gatePopFactor = 0.0;
      timeStr = formatMotoGPTimer(tRelLap);
    }
  } else {
    const d1 = s1Dur - r1;
    const d2 = (s1Dur + s2Dur) - (r1 + r2);
    const d3 = totalLapDuration - refTotal;
    sectors[0].color = d1 < 0 ? '#ff1744' : (d1 <= 0.5 ? '#ff8c00' : '#8e94a5');
    sectors[1].color = d2 < 0 ? '#ff1744' : (d2 <= 0.5 ? '#ff8c00' : '#8e94a5');
    sectors[2].color = d3 < 0 ? '#ff1744' : (d3 <= 0.5 ? '#ff8c00' : '#8e94a5');
    deltaStr = `${d3 < 0 ? '' : '+'}${d3.toFixed(3)}`;
    deltaColor = d3 < 0 ? '#ff1744' : (d3 <= 0.5 ? '#ff8c00' : '#8e94a5');
    timeColor = deltaColor;

    gatePopFactor = 1.0;
    timeStr = formatMotoGPTimer(totalLapDuration);
    ticFrac = 1.0;

    finishState = {
      isFinished: true,
      isFastest: isFastestLap,
      finishElapsed: tRelLap - totalLapDuration,
      lapTimeStr: formatMotoGPTimer(totalLapDuration),
      deltaStr: deltaStr,
      deltaColor: deltaColor
    };
  }

  return { timeStr, deltaStr, deltaColor, timeColor, sectors, ticFrac, isGateHighlight: gatePopFactor, finishState };
}
