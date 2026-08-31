/**
 * coaching.js - Rider Coaching Intelligence, Track-Defined Turn Scorecards,
 * Spatial Apex Matching, and Theoretical Optimal Lap Synthesizer
 * Ducati DDA Telemetry & GPS Visualizer
 */

/**
 * Automatically synthesizes a Virtual Theoretical Optimal Lap by extracting
 * and stitching together the fastest Sector 1, Sector 2, and Sector 3 records.
 */
function generateTheoreticalOptimalLap() {
  if (!state.laps || state.laps.length === 0 || !state.records || state.records.length === 0) return null;

  // Filter valid timed laps with defined sector splits
  const validLaps = state.laps.filter(l => 
    l.duration_s > 25 && 
    l.sectors && 
    l.sectors.length >= 3 && 
    typeof l.sectors[0] === 'number' && 
    typeof l.sectors[1] === 'number' && 
    typeof l.sectors[2] === 'number' &&
    l.sectors[0] > 1.0 && 
    l.sectors[1] > 1.0 && 
    l.sectors[2] > 1.0
  );
  if (validLaps.length === 0) return null;

  // Find best laps for S1, S2, S3
  let bestS1Lap = validLaps[0];
  let bestS2Lap = validLaps[0];
  let bestS3Lap = validLaps[0];

  let minS1 = bestS1Lap.sectors[0];
  let minS2 = bestS1Lap.sectors[1];
  let minS3 = bestS1Lap.sectors[2];

  for (const l of validLaps) {
    if (l.sectors[0] < minS1) { minS1 = l.sectors[0]; bestS1Lap = l; }
    if (l.sectors[1] < minS2) { minS2 = l.sectors[1]; bestS2Lap = l; }
    if (l.sectors[2] < minS3) { minS3 = l.sectors[2]; bestS3Lap = l; }
  }

  // Extract slices
  const recsS1 = getSectorRecords(bestS1Lap, 0);
  const recsS2 = getSectorRecords(bestS2Lap, 1);
  const recsS3 = getSectorRecords(bestS3Lap, 2);

  if (recsS1.length === 0 || recsS2.length === 0 || recsS3.length === 0) return null;

  // Synthesize unified records with continuous time & distance
  const optimalRecords = [];
  let curTime = 0.0;
  let curDist = 0.0;

  function appendSectorRecords(srcRecs) {
    if (srcRecs.length === 0) return;
    const tBase = srcRecs[0].time_s || 0;
    const dBase = srcRecs[0].distance_m || 0;
    const startT = curTime;
    const startD = curDist;

    for (let i = 0; i < srcRecs.length; i++) {
      const orig = srcRecs[i];
      const rCopy = Object.assign({}, orig);
      rCopy.time_s = startT + ((orig.time_s || 0) - tBase);
      rCopy.distance_m = startD + ((orig.distance_m || 0) - dBase);
      rCopy.local_index = optimalRecords.length;
      optimalRecords.push(rCopy);
    }
    curTime = optimalRecords[optimalRecords.length - 1].time_s + 0.1;
    curDist = optimalRecords[optimalRecords.length - 1].distance_m;
  }

  appendSectorRecords(recsS1);
  appendSectorRecords(recsS2);
  appendSectorRecords(recsS3);

  const totalOptimalDur = minS1 + minS2 + minS3;
  const maxSpd = Math.max(...optimalRecords.map(r => r.speed_kmh || 0));

  const optimalLap = {
    lap_number: 999,
    name: "⚡ Optimal Lap (Virtual)",
    duration_s: totalOptimalDur,
    start_index: 0,
    end_index: optimalRecords.length - 1,
    start_time_s: 0,
    end_time_s: totalOptimalDur,
    distance_m: curDist,
    max_speed_kmh: maxSpd,
    is_best: false,
    is_optimal: true,
    sectors: [minS1, minS2, minS3],
    optimal_records: optimalRecords
  };

  state.optimalLap = optimalLap;
  return optimalLap;
}

function getSectorRecords(lapObj, secIndex) {
  const fullLapRecs = state.records.slice(lapObj.start_index, lapObj.end_index + 1);
  if (fullLapRecs.length < 5) return fullLapRecs;

  const s1Dur = lapObj.sectors[0];
  const s2Dur = lapObj.sectors[1];
  const t0 = lapObj.start_time_s;

  let tStart = t0;
  let tEnd = t0 + s1Dur;

  if (secIndex === 1) {
    tStart = t0 + s1Dur;
    tEnd = t0 + s1Dur + s2Dur;
  } else if (secIndex === 2) {
    tStart = t0 + s1Dur + s2Dur;
    tEnd = lapObj.end_time_s;
  }

  return fullLapRecs.filter(r => (r.time_s || 0) >= tStart && (r.time_s || 0) <= tEnd);
}

/**
 * Returns the active track profile matching current session or gates.
 */
function getActiveTrackProfile() {
  if (!state.tracks) return null;
  const trackIds = Object.keys(state.tracks);
  if (trackIds.length === 0) return null;

  // 1. Check if Start/Finish gate matches a known track
  if (state.gates && state.gates.length > 0) {
    const sf = state.gates.find(g => g.type === 'sf') || state.gates[0];
    for (const id in state.tracks) {
      const trk = state.tracks[id];
      if (trk.center_lat && trk.center_lon) {
        const d = haversineDistanceM(trk.center_lat, trk.center_lon, sf.lat, sf.lon);
        if (d <= (trk.radius_m || 3500)) return trk;
      }
    }
  }

  // 2. Check track title text
  const currentTitle = dom.metaTrackName ? dom.metaTrackName.textContent.trim().toLowerCase() : '';
  for (const id in state.tracks) {
    const trk = state.tracks[id];
    if (trk.name && currentTitle && (trk.name.toLowerCase().includes(currentTitle) || currentTitle.includes(trk.name.toLowerCase()))) {
      return trk;
    }
  }

  // 3. Fallback to first track with turns
  for (const id in state.tracks) {
    if (state.tracks[id].turns && state.tracks[id].turns.length > 0) {
      return state.tracks[id];
    }
  }

  return state.tracks[trackIds[0]] || null;
}

/**
 * Returns the defined turn apex list for the active track.
 */
function getActiveTrackTurns() {
  const trk = getActiveTrackProfile();
  return (trk && Array.isArray(trk.turns) && trk.turns.length > 0) ? trk.turns : null;
}

/**
 * Evaluates corner performance for a single lap or record series.
 * If definedTurns are provided, uses track-defined apex positions.
 * Otherwise, falls back to dynamic local extrema detection.
 */
function analyzeLapCorners(targetRecords, definedTurns = null, lapNumber = 1) {
  if (!targetRecords || targetRecords.length < 20) return [];

  const turns = [];

  if (definedTurns && definedTurns.length > 0) {
    // === Track-Defined Apex Evaluation ===
    definedTurns.forEach((tDef, tIdx) => {
      const radius = tDef.radius_m || 45.0;
      let bestRec = null;
      let bestIdx = -1;
      let minSpdInZone = Infinity;
      let maxLeanInZone = 0;
      let closestDist = Infinity;
      let closestIdx = -1;

      // Find records within capture radius
      for (let i = 0; i < targetRecords.length; i++) {
        const r = targetRecords[i];
        if (r.gps_lat === null || r.gps_lon === null) continue;
        const d = haversineDistanceM(tDef.lat, tDef.lon, r.gps_lat, r.gps_lon);
        if (d < closestDist) {
          closestDist = d;
          closestIdx = i;
        }

        if (d <= radius) {
          const spd = r.speed_kmh || 0;
          const lean = Math.abs(r.lean_angle_deg || 0);
          if (spd < minSpdInZone) {
            minSpdInZone = spd;
            bestRec = r;
            bestIdx = i;
          }
          if (lean > maxLeanInZone) {
            maxLeanInZone = lean;
          }
        }
      }

      // If no point strictly inside radius, use closest point if within 1.6x radius
      if (!bestRec && closestIdx !== -1 && closestDist <= radius * 1.6) {
        bestRec = targetRecords[closestIdx];
        bestIdx = closestIdx;
        minSpdInZone = bestRec.speed_kmh || 0;
        maxLeanInZone = Math.abs(bestRec.lean_angle_deg || 0);
      }

      if (!bestRec || bestIdx === -1) return;

      const apexIdx = bestIdx;
      const apexRec = bestRec;
      const apexLean = apexRec.lean_angle_deg || 0;
      const apexSpd = apexRec.speed_kmh || 0;

      // Find Peak Lean in the apex vicinity (window +- 12 frames)
      let peakLeanDeg = Math.abs(apexLean);
      let peakLeanSign = apexLean < 0 ? -1 : 1;
      const winStart = Math.max(0, apexIdx - 12);
      const winEnd = Math.min(targetRecords.length - 1, apexIdx + 12);
      for (let k = winStart; k <= winEnd; k++) {
        const lVal = targetRecords[k].lean_angle_deg || 0;
        if (Math.abs(lVal) > peakLeanDeg) {
          peakLeanDeg = Math.abs(lVal);
          peakLeanSign = lVal < 0 ? -1 : 1;
        }
      }

      // Direction: use defined direction or detected peak lean sign
      const dirStr = tDef.direction ? tDef.direction.toLowerCase() : (peakLeanSign < 0 ? 'left' : 'right');
      const isLeft = dirStr.includes('left') || peakLeanSign < 0;
      const typeLabel = isLeft ? 'Left ↰' : 'Right ↱';

      // 1. Braking Onset (scan backwards from apex up to 45 frames / ~150m)
      let brakeRec = targetRecords[Math.max(0, apexIdx - 1)];
      let brakeIdx = apexIdx;
      let brakeDistM = 0;
      let brakeEntrySpd = apexSpd;
      for (let b = apexIdx; b >= Math.max(0, apexIdx - 45); b--) {
        const recB = targetRecords[b];
        const gLong = recB.accel_long_g !== undefined ? recB.accel_long_g : 0;
        const tps = recB.tps_pct || 0;

        if (gLong < -0.28 || (tps < 5 && b > 0 && (targetRecords[b-1].tps_pct || 0) >= 5)) {
          brakeRec = recB;
          brakeIdx = b;
          brakeEntrySpd = Math.max(brakeEntrySpd, recB.speed_kmh || 0);
        } else if (tps > 15 && b < apexIdx - 3) {
          break;
        }
      }
      brakeDistM = Math.max(0, (apexRec.distance_m || 0) - (brakeRec.distance_m || 0));

      // 2. Throttle Pickup (scan forwards from apex until TPS >= 15%)
      let pickupRec = apexRec;
      let pickupIdx = apexIdx;
      let pickupDistM = 0;
      for (let p = apexIdx; p <= Math.min(targetRecords.length - 1, apexIdx + 45); p++) {
        const recP = targetRecords[p];
        if ((recP.tps_pct || 0) >= 15) {
          pickupRec = recP;
          pickupIdx = p;
          break;
        }
      }
      pickupDistM = Math.max(0, (pickupRec.distance_m || 0) - (apexRec.distance_m || 0));

      // 3. Corner Exit (scan forwards until lean <= 12° or full power)
      let exitRec = targetRecords[Math.min(targetRecords.length - 1, apexIdx + 15)];
      for (let e = apexIdx; e <= Math.min(targetRecords.length - 1, apexIdx + 55); e++) {
        const recE = targetRecords[e];
        if (Math.abs(recE.lean_angle_deg || 0) <= 12 || (recE.tps_pct || 0) >= 80) {
          exitRec = recE;
          break;
        }
      }
      const exitSpd = exitRec.speed_kmh || apexSpd;
      const driveGainKmh = Math.max(0, exitSpd - apexSpd);

      // 4. Coasting / Dead Roll Time within braking-to-throttle zone
      let coastFrames = 0;
      const cStart = Math.max(0, brakeIdx);
      const cEnd = Math.min(targetRecords.length - 1, pickupIdx);
      for (let c = cStart; c <= cEnd; c++) {
        const recC = targetRecords[c];
        const tps = recC.tps_pct || 0;
        const gLong = recC.accel_long_g !== undefined ? recC.accel_long_g : 0;
        if (tps < 5 && gLong >= -0.32) {
          coastFrames++;
        }
      }
      const coastTimeSec = coastFrames * 0.1;

      // 5. Rider Coaching Evaluation Cue
      let cueText = 'Clean apex execution';
      let cueClass = 'cue-good';

      if (coastTimeSec > 1.3) {
        cueText = `⚠️ Long roll time (${coastTimeSec.toFixed(1)}s) — trail brake deeper or roll on throttle earlier`;
        cueClass = 'cue-warning';
      } else if (peakLeanDeg >= 48 && apexSpd > 80) {
        cueText = `🏆 High commitment! Peak lean ${peakLeanDeg.toFixed(1)}° with great carry speed`;
        cueClass = 'cue-good';
      } else if (pickupDistM <= 12 && driveGainKmh > 20) {
        const gainUnitStr = state.unitMph ? `${(driveGainKmh * 0.621371).toFixed(0)} mph` : `${driveGainKmh.toFixed(0)} km/h`;
        cueText = `🟢 Excellent drive off apex (+${gainUnitStr} exit drive)`;
        cueClass = 'cue-good';
      } else if (brakeDistM > 100 && apexSpd < 50) {
        cueText = `⚡ Overslowing on entry (-${brakeDistM.toFixed(0)}m) — release brake earlier to carry momentum`;
        cueClass = 'cue-warning';
      } else if (pickupDistM > 35) {
        cueText = `⏱️ Delayed throttle pickup (+${pickupDistM.toFixed(0)}m) — look ahead and commit to gas earlier`;
        cueClass = 'cue-warning';
      } else {
        cueText = `✅ Consistent line and smooth throttle transition`;
        cueClass = 'cue-good';
      }

      turns.push({
        id: tDef.id || `t${tIdx + 1}`,
        turnNumber: tDef.number || (tIdx + 1),
        name: tDef.name || `Turn ${tIdx + 1}`,
        type: typeLabel,
        isLeft: isLeft,
        lat: tDef.lat,
        lon: tDef.lon,
        description: tDef.description || '',
        apexSpeedKmh: apexSpd,
        apexEntrySpeedKmh: brakeEntrySpd,
        maxLeanDeg: peakLeanDeg,
        brakingDistM: brakeDistM,
        throttlePickupDistM: pickupDistM,
        exitSpeedKmh: exitSpd,
        driveGainKmh: driveGainKmh,
        coastTimeSec: coastTimeSec,
        cueText: cueText,
        cueClass: cueClass,
        apexIndex: apexIdx,
        apexDistanceM: apexRec.distance_m || 0,
        lapNumber: lapNumber
      });
    });

  } else {
    // === Dynamic Local Extrema Fallback ===
    const minLeanThreshold = 16.0;
    const minTurnSeparationM = 65.0;
    let lastApexDist = -999;

    for (let i = 5; i < targetRecords.length - 5; i++) {
      const r = targetRecords[i];
      const spd = r.speed_kmh || 0;
      const lean = Math.abs(r.lean_angle_deg || 0);
      const dist = r.distance_m || (i * 2.0);

      if (lean >= minLeanThreshold && dist - lastApexDist >= minTurnSeparationM) {
        let isLocalMin = true;
        for (let k = i - 4; k <= i + 4; k++) {
          if (k !== i && targetRecords[k] && (targetRecords[k].speed_kmh || 0) < spd) {
            isLocalMin = false;
            break;
          }
        }

        if (isLocalMin) {
          lastApexDist = dist;
          const turnIdx = turns.length + 1;
          const apexRec = r;
          const apexIdx = i;

          let brakeRec = targetRecords[Math.max(0, apexIdx - 1)];
          let brakeDistM = 0;
          for (let b = apexIdx; b >= Math.max(0, apexIdx - 35); b--) {
            const recB = targetRecords[b];
            if ((recB.accel_long_g || 0) < -0.30) {
              brakeRec = recB;
            } else if ((recB.tps_pct || 0) > 10 && b < apexIdx - 2) {
              break;
            }
          }
          brakeDistM = Math.max(0, (apexRec.distance_m || 0) - (brakeRec.distance_m || 0));

          let pickupRec = apexRec;
          let pickupDistM = 0;
          for (let p = apexIdx; p <= Math.min(targetRecords.length - 1, apexIdx + 35); p++) {
            const recP = targetRecords[p];
            if ((recP.tps_pct || 0) >= 15) {
              pickupRec = recP;
              break;
            }
          }
          pickupDistM = Math.max(0, (pickupRec.distance_m || 0) - (apexRec.distance_m || 0));

          let exitRec = targetRecords[Math.min(targetRecords.length - 1, apexIdx + 15)];
          for (let e = apexIdx; e <= Math.min(targetRecords.length - 1, apexIdx + 50); e++) {
            const recE = targetRecords[e];
            if (Math.abs(recE.lean_angle_deg || 0) <= 12) {
              exitRec = recE;
              break;
            }
          }

          let coastFrames = 0;
          const c0 = Math.max(0, apexIdx - 20);
          const c1 = Math.min(targetRecords.length - 1, apexIdx + 15);
          for (let c = c0; c <= c1; c++) {
            const recC = targetRecords[c];
            if ((recC.tps_pct || 0) < 5 && (recC.accel_long_g || 0) >= -0.35) {
              coastFrames++;
            }
          }
          const coastTimeSec = coastFrames * 0.1;
          const isLeft = (apexRec.lean_angle_deg || 0) < 0;

          turns.push({
            id: `dyn_t${turnIdx}`,
            turnNumber: turnIdx,
            name: `Turn ${turnIdx}`,
            type: isLeft ? 'Left ↰' : 'Right ↱',
            isLeft: isLeft,
            lat: apexRec.gps_lat,
            lon: apexRec.gps_lon,
            description: 'Auto-detected corner',
            apexSpeedKmh: spd,
            apexEntrySpeedKmh: brakeRec.speed_kmh || spd,
            maxLeanDeg: lean,
            brakingDistM: brakeDistM,
            throttlePickupDistM: pickupDistM,
            exitSpeedKmh: exitRec.speed_kmh || spd,
            driveGainKmh: Math.max(0, (exitRec.speed_kmh || spd) - spd),
            coastTimeSec: coastTimeSec,
            cueText: coastTimeSec > 1.3 ? `⚠️ Long roll time (${coastTimeSec.toFixed(1)}s)` : `✅ Clean apex transition`,
            cueClass: coastTimeSec > 1.3 ? 'cue-warning' : 'cue-good',
            apexIndex: apexIdx,
            apexDistanceM: apexRec.distance_m || 0,
            lapNumber: lapNumber
          });
        }
      }
    }
  }

  return turns;
}

/**
 * High-level orchestrator: Evaluates corner performance for target lap or entire session.
 * Calculates consistency ratings, standard deviations, and session bests.
 */
function analyzeCornerPerformance(targetLapNum = -1) {
  const definedTurns = getActiveTrackTurns();
  const validTimedLaps = (state.laps || []).filter(l => l.lap_number > 0 && l.duration_s > 20);

  if (targetLapNum === -1 && validTimedLaps.length > 1) {
    // === Session Aggregation & Consistency Mode (All Laps) ===
    const lapTurnEvals = validTimedLaps.map(lap => {
      const recs = state.records.slice(lap.start_index, lap.end_index + 1);
      return analyzeLapCorners(recs, definedTurns, lap.lap_number);
    });

    if (lapTurnEvals.length === 0 || lapTurnEvals[0].length === 0) {
      return analyzeLapCorners(state.records, definedTurns, -1);
    }

    const numTurns = lapTurnEvals[0].length;
    const aggregatedTurns = [];

    for (let t = 0; t < numTurns; t++) {
      const baseTurn = lapTurnEvals[0][t];
      const samples = [];

      for (let l = 0; l < lapTurnEvals.length; l++) {
        if (lapTurnEvals[l][t]) samples.push(lapTurnEvals[l][t]);
      }

      if (samples.length === 0) continue;

      const apexSpeeds = samples.map(s => s.apexSpeedKmh);
      const brakeDists = samples.map(s => s.brakingDistM);
      const pickupDists = samples.map(s => s.throttlePickupDistM);
      const exitSpeeds = samples.map(s => s.exitSpeedKmh);
      const coastTimes = samples.map(s => s.coastTimeSec);
      const maxLeans = samples.map(s => s.maxLeanDeg);

      const meanApexSpd = apexSpeeds.reduce((a, b) => a + b, 0) / samples.length;
      const bestApexSpd = Math.max(...apexSpeeds);
      const meanBrakeDist = brakeDists.reduce((a, b) => a + b, 0) / samples.length;
      const meanPickupDist = pickupDists.reduce((a, b) => a + b, 0) / samples.length;
      const meanExitSpd = exitSpeeds.reduce((a, b) => a + b, 0) / samples.length;
      const meanCoast = coastTimes.reduce((a, b) => a + b, 0) / samples.length;
      const meanMaxLean = maxLeans.reduce((a, b) => a + b, 0) / samples.length;

      // Standard Deviation (sigma) for Consistency
      const variance = apexSpeeds.reduce((acc, val) => acc + Math.pow(val - meanApexSpd, 2), 0) / samples.length;
      const stdDevKmh = Math.sqrt(variance);
      const stdDevMph = stdDevKmh * 0.621371;

      // Consistency rating 0-100%
      const consistencyPct = Math.max(70, Math.min(100, 100 - (stdDevKmh * 2.5)));
      let consistencyBadge = '⭐ Excellent';
      let consistencyClass = 'consistency-high';
      if (stdDevKmh > 5.0) {
        consistencyBadge = '⚠️ Variable Line';
        consistencyClass = 'consistency-low';
      } else if (stdDevKmh > 2.5) {
        consistencyBadge = '🔹 Moderate';
        consistencyClass = 'consistency-med';
      }

      let coachingCue = `🎯 Session Avg: ${(meanApexSpd * (state.unitMph ? 0.621371 : 1)).toFixed(1)} ${state.unitMph ? 'mph' : 'km/h'} (Best: ${(bestApexSpd * (state.unitMph ? 0.621371 : 1)).toFixed(1)})`;
      if (stdDevKmh <= 1.5) {
        coachingCue = `🎯 High consistency (±${(stdDevKmh * (state.unitMph ? 0.621371 : 1)).toFixed(1)} ${state.unitMph ? 'mph' : 'km/h'}) across ${samples.length} laps`;
      } else if (meanCoast > 1.2) {
        coachingCue = `⚠️ High roll time avg (${meanCoast.toFixed(1)}s) — potential +0.3s gain per lap`;
      }

      aggregatedTurns.push({
        id: baseTurn.id,
        turnNumber: baseTurn.turnNumber,
        name: baseTurn.name,
        type: baseTurn.type,
        isLeft: baseTurn.isLeft,
        lat: baseTurn.lat,
        lon: baseTurn.lon,
        description: baseTurn.description,
        apexSpeedKmh: meanApexSpd,
        bestApexSpeedKmh: bestApexSpd,
        stdDevKmh: stdDevKmh,
        stdDevMph: stdDevMph,
        consistencyPct: consistencyPct,
        consistencyBadge: consistencyBadge,
        consistencyClass: consistencyClass,
        maxLeanDeg: meanMaxLean,
        brakingDistM: meanBrakeDist,
        throttlePickupDistM: meanPickupDist,
        exitSpeedKmh: meanExitSpd,
        coastTimeSec: meanCoast,
        cueText: coachingCue,
        cueClass: stdDevKmh <= 2.5 ? 'cue-good' : 'cue-warning',
        apexIndex: baseTurn.apexIndex,
        apexDistanceM: baseTurn.apexDistanceM,
        isSessionAvg: true,
        sampleCount: samples.length
      });
    }

    return aggregatedTurns;
  }

  // === Single Lap Mode ===
  let targetRecords = state.records || [];
  if (targetLapNum === 999 && state.optimalLap && state.optimalLap.optimal_records) {
    targetRecords = state.optimalLap.optimal_records;
  } else if (targetLapNum > 0) {
    const lapObj = state.laps.find(l => l.lap_number === targetLapNum);
    if (lapObj) {
      targetRecords = state.records.slice(lapObj.start_index, lapObj.end_index + 1);
    }
  }

  return analyzeLapCorners(targetRecords, definedTurns, targetLapNum);
}

/**
 * Renders the Turn-by-Turn Scorecard table and summary KPIs in the modal.
 */
function renderScorecardTable(targetLapNum = -1) {
  if (!dom.scorecardTableBody) return;

  const turns = analyzeCornerPerformance(targetLapNum);
  if (!turns || turns.length === 0) {
    dom.scorecardTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:24px; color:#888;">No turns detected in target session or lap.</td></tr>';
    return;
  }

  const spdUnit = state.unitMph ? 'mph' : 'km/h';
  const spdFactor = state.unitMph ? 0.621371 : 1.0;
  const isSessionAvg = targetLapNum === -1;

  let totalApexSpd = 0;
  let totalCoast = 0;
  let maxLeanGlobal = 0;
  let bestTurn = turns[0];

  const rowsHtml = turns.map((t, idx) => {
    const spdVal = t.apexSpeedKmh * spdFactor;
    totalApexSpd += spdVal;
    totalCoast += t.coastTimeSec;
    if (t.maxLeanDeg > maxLeanGlobal) maxLeanGlobal = t.maxLeanDeg;
    if (spdVal > (bestTurn.apexSpeedKmh * spdFactor)) bestTurn = t;

    const apexSpdStr = spdVal.toFixed(1);
    const exitSpdStr = (t.exitSpeedKmh * spdFactor).toFixed(1);
    const bestSpdStr = t.bestApexSpeedKmh ? (t.bestApexSpeedKmh * spdFactor).toFixed(1) : null;

    const coastBadgeClass = t.coastTimeSec <= 0.8 ? 'text-green' : (t.coastTimeSec <= 1.3 ? 'text-warning' : 'text-red');
    const turnBadgeClass = t.isLeft ? 'turn-badge-left' : 'turn-badge-right';

    let apexColHtml = `<strong class="text-green">${apexSpdStr} <small>${spdUnit}</small></strong>`;
    if (isSessionAvg && bestSpdStr) {
      apexColHtml += `<div class="sub-metric text-muted">Best: ${bestSpdStr}</div>`;
    }

    let consistencyColHtml = '';
    if (isSessionAvg && t.consistencyBadge) {
      consistencyColHtml = `<span class="consistency-pill ${t.consistencyClass}">${t.consistencyBadge} <small>(±${(state.unitMph ? t.stdDevMph : t.stdDevKmh).toFixed(1)})</small></span>`;
    }

    const cleanTurnNum = (t.turnNumber !== undefined ? t.turnNumber : (idx + 1)).toString().replace(/^T/i, '');

    return `
      <tr class="scorecard-row" data-turn-id="${t.id}" data-turn-index="${idx}" data-lat="${t.lat || ''}" data-lon="${t.lon || ''}" data-apex-index="${t.apexIndex}" title="Click to view Turn ${cleanTurnNum} on Map | Double-click or click badge to Compare Turn across all laps">
        <td>
          <div class="turn-cell-wrap">
            <span class="turn-badge ${turnBadgeClass}" title="Click to Stack & Compare Turn ${cleanTurnNum} across all laps">T${cleanTurnNum}</span>
            <span class="turn-cell-name">${escapeHTML(t.name)}</span>
          </div>
        </td>
        <td><strong style="color:${t.isLeft ? '#00e5ff' : '#ffd600'};">${t.type}</strong></td>
        <td>
          <span class="text-red">-${t.brakingDistM.toFixed(0)}m</span>
          ${t.apexEntrySpeedKmh ? `<div class="sub-metric text-muted">${(t.apexEntrySpeedKmh * spdFactor).toFixed(0)} ${spdUnit}</div>` : ''}
        </td>
        <td>${apexColHtml}</td>
        <td><strong class="text-cyan">${t.maxLeanDeg.toFixed(1)}°</strong></td>
        <td><span class="text-yellow">+${t.throttlePickupDistM.toFixed(0)}m</span></td>
        <td>
          <strong style="color:#a5b4fc;">${exitSpdStr} <small>${spdUnit}</small></strong>
          ${t.driveGainKmh > 0 ? `<div class="sub-metric text-green">+${(t.driveGainKmh * spdFactor).toFixed(0)} gain</div>` : ''}
        </td>
        <td><strong class="${coastBadgeClass}">${t.coastTimeSec.toFixed(1)}s</strong></td>
        ${isSessionAvg ? `<td>${consistencyColHtml}</td>` : ''}
        <td><span class="cue-badge ${t.cueClass}">${escapeHTML(t.cueText)}</span></td>
      </tr>
    `;
  }).join('');

  dom.scorecardTableBody.innerHTML = rowsHtml;

  // Update Scorecard KPIs
  const avgApexSpd = (totalApexSpd / turns.length).toFixed(1);
  if (dom.kpiScorecardTurns) dom.kpiScorecardTurns.textContent = turns.length.toString();
  if (dom.kpiScorecardApexSpd) dom.kpiScorecardApexSpd.textContent = `${avgApexSpd} ${spdUnit}`;
  if (dom.kpiScorecardCoast) dom.kpiScorecardCoast.textContent = `${totalCoast.toFixed(1)}s`;
  if (dom.kpiScorecardBestApex) dom.kpiScorecardBestApex.textContent = `T${bestTurn.turnNumber} (${(bestTurn.apexSpeedKmh * spdFactor).toFixed(1)} ${spdUnit})`;
  if (dom.kpiScorecardConsistency) {
    if (isSessionAvg) {
      const avgConsistency = (turns.reduce((acc, t) => acc + (t.consistencyPct || 90), 0) / turns.length).toFixed(0);
      dom.kpiScorecardConsistency.textContent = `${avgConsistency}%`;
    } else {
      dom.kpiScorecardConsistency.textContent = `Peak ${maxLeanGlobal.toFixed(1)}°`;
    }
  }

  // Bind interactive click events on table rows
  document.querySelectorAll('.scorecard-row').forEach(row => {
    row.addEventListener('click', () => {
      const lat = parseFloat(row.dataset.lat);
      const lon = parseFloat(row.dataset.lon);
      const idx = parseInt(row.dataset.apexIndex, 10);
      const turnId = row.dataset.turnId;

      state.highlightedTurnId = turnId;

      if (!isNaN(lat) && !isNaN(lon) && state.map) {
        state.map.flyTo([lat, lon], 17, { animate: true, duration: 0.8 });
      }

      if (!isNaN(idx) && typeof seekToIndex === 'function') {
        seekToIndex(idx);
      }

      document.querySelectorAll('.scorecard-row').forEach(r => r.classList.remove('selected-row'));
      row.classList.add('selected-row');
    });

    row.addEventListener('dblclick', () => {
      const tIdx = parseInt(row.dataset.turnIndex, 10);
      if (!isNaN(tIdx) && typeof selectCornerSection === 'function') {
        if (dom.modalScorecard) dom.modalScorecard.style.display = 'none';
        selectCornerSection(tIdx);
      }
    });

    const badge = row.querySelector('.turn-badge');
    if (badge) {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const tIdx = parseInt(row.dataset.turnIndex, 10);
        if (!isNaN(tIdx) && typeof selectCornerSection === 'function') {
          if (dom.modalScorecard) dom.modalScorecard.style.display = 'none';
          selectCornerSection(tIdx);
        }
      });
    }
  });
}

/**
 * Generates exportable CSV content of the corner performance scorecard.
 */
function generateScorecardCsv(targetLapNum = -1) {
  const turns = analyzeCornerPerformance(targetLapNum);
  if (!turns || turns.length === 0) return '';

  const spdUnit = state.unitMph ? 'mph' : 'km/h';
  const spdFactor = state.unitMph ? 0.621371 : 1.0;
  const isSessionAvg = targetLapNum === -1;

  const headers = [
    'Turn Number',
    'Turn Name',
    'Direction',
    'Braking Distance (m)',
    `Apex Speed (${spdUnit})`,
    ...(isSessionAvg ? [`Best Apex Speed (${spdUnit})`, `Std Dev (${spdUnit})`, 'Consistency (%)'] : []),
    'Peak Lean (deg)',
    'Throttle Pickup Distance (m)',
    `Exit Speed (${spdUnit})`,
    'Coast Time (s)',
    'Coaching Cue'
  ];

  const rows = turns.map(t => [
    t.turnNumber,
    `"${(t.name || '').replace(/"/g, '""')}"`,
    t.type,
    t.brakingDistM.toFixed(1),
    (t.apexSpeedKmh * spdFactor).toFixed(1),
    ...(isSessionAvg ? [
      ((t.bestApexSpeedKmh || t.apexSpeedKmh) * spdFactor).toFixed(1),
      ((state.unitMph ? t.stdDevMph : t.stdDevKmh) || 0).toFixed(1),
      (t.consistencyPct || 100).toFixed(0)
    ] : []),
    t.maxLeanDeg.toFixed(1),
    t.throttlePickupDistM.toFixed(1),
    (t.exitSpeedKmh * spdFactor).toFixed(1),
    t.coastTimeSec.toFixed(2),
    `"${(t.cueText || '').replace(/"/g, '""')}"`
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Generates formatted text/markdown summary of the coaching scorecard for easy clipboard copying.
 */
function generateScorecardSummaryText(targetLapNum = -1) {
  const turns = analyzeCornerPerformance(targetLapNum);
  if (!turns || turns.length === 0) return 'No corner performance data available.';

  const spdUnit = state.unitMph ? 'mph' : 'km/h';
  const spdFactor = state.unitMph ? 0.621371 : 1.0;
  const trackName = dom.metaTrackName ? dom.metaTrackName.textContent.trim() : 'Track';
  const lapLabel = targetLapNum === -1 ? 'All Laps (Session Averages)' : (targetLapNum === 999 ? 'Theoretical Optimal Lap' : `Lap ${targetLapNum}`);

  let lines = [
    `🏁 Ducati DDA Telemetry - Corner Performance Scorecard`,
    `Track: ${trackName} | Session Target: ${lapLabel}`,
    `Generated: ${new Date().toLocaleString()}`,
    `------------------------------------------------------------`,
    `Turn | Type | Braking | Apex Speed | Max Lean | Pickup | Exit Spd | Coast | Coaching Cue`,
    `------------------------------------------------------------`
  ];

  turns.forEach(t => {
    const spd = (t.apexSpeedKmh * spdFactor).toFixed(1);
    const exitSpd = (t.exitSpeedKmh * spdFactor).toFixed(1);
    lines.push(
      `T${t.turnNumber.toString().padEnd(3)} | ${t.type.padEnd(7)} | -${t.brakingDistM.toFixed(0).padStart(3)}m | ${spd.padStart(5)} ${spdUnit} | ${t.maxLeanDeg.toFixed(1).padStart(4)}° | +${t.throttlePickupDistM.toFixed(0).padStart(2)}m | ${exitSpd.padStart(5)} ${spdUnit} | ${t.coastTimeSec.toFixed(1)}s | ${t.cueText}`
    );
  });

  lines.push(`------------------------------------------------------------`);
  return lines.join('\n');
}
