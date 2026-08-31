/**
 * coaching.js - Rider Coaching Intelligence, Automated Turn-by-Turn Scorecards,
 * and Theoretical Optimal Lap Synthesizer
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
 * Analyzes turn-by-turn cornering dynamics, roll time, apex speeds,
 * and coaching feedback cues.
 */
function analyzeCornerPerformance(targetLapNum = -1) {
  let targetRecords = state.records || [];
  let isFullSession = targetLapNum === -1;

  if (!isFullSession) {
    const lapObj = state.laps.find(l => l.lap_number === targetLapNum);
    if (lapObj) {
      targetRecords = state.records.slice(lapObj.start_index, lapObj.end_index + 1);
    }
  }

  if (!targetRecords || targetRecords.length < 20) return [];

  // Corner Apex Detection: Find local speed minima with lean > 18° separated by > 70m
  const turns = [];
  const minLeanThreshold = 18.0;
  const minTurnSeparationM = 75.0;

  let lastApexDist = -999;
  for (let i = 5; i < targetRecords.length - 5; i++) {
    const r = targetRecords[i];
    const spd = r.speed_kmh || 0;
    const lean = Math.abs(r.lean_angle_deg || 0);
    const dist = r.distance_m || (i * 2.0);

    if (lean >= minLeanThreshold && dist - lastApexDist >= minTurnSeparationM) {
      // Check if local minimum speed in a window of +- 4 frames (0.8s)
      let isLocalMin = true;
      for (let k = i - 4; k <= i + 4; k++) {
        if (k !== i && targetRecords[k] && (targetRecords[k].speed_kmh || 0) < spd) {
          isLocalMin = false;
          break;
        }
      }

      if (isLocalMin) {
        lastApexDist = dist;
        const turnIndex = turns.length + 1;
        const apexRec = r;
        const apexIdx = i;

        // Find Braking Onset (scan backwards from apex until decel ends or TPS starts)
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

        // Find Throttle Pickup (scan forwards from apex until TPS >= 18%)
        let pickupRec = apexRec;
        let pickupDistM = 0;
        for (let p = apexIdx; p <= Math.min(targetRecords.length - 1, apexIdx + 35); p++) {
          const recP = targetRecords[p];
          if ((recP.tps_pct || 0) >= 18) {
            pickupRec = recP;
            break;
          }
        }
        pickupDistM = Math.max(0, (pickupRec.distance_m || 0) - (apexRec.distance_m || 0));

        // Find Corner Exit (scan forwards until lean <= 12°)
        let exitRec = targetRecords[Math.min(targetRecords.length - 1, apexIdx + 15)];
        for (let e = apexIdx; e <= Math.min(targetRecords.length - 1, apexIdx + 50); e++) {
          const recE = targetRecords[e];
          if (Math.abs(recE.lean_angle_deg || 0) <= 12) {
            exitRec = recE;
            break;
          }
        }

        // Calculate Coasting / Dead Roll Time within corner entry and apex zone
        let coastFrames = 0;
        const entryIdx = Math.max(0, apexIdx - 20);
        const postApexIdx = Math.min(targetRecords.length - 1, apexIdx + 15);
        for (let c = entryIdx; c <= postApexIdx; c++) {
          const recC = targetRecords[c];
          if ((recC.tps_pct || 0) < 5 && (recC.accel_long_g || 0) >= -0.35) {
            coastFrames++;
          }
        }
        const coastTimeSec = coastFrames * 0.1;

        // Turn Type: Left or Right
        const isLeft = (apexRec.lean_angle_deg || 0) < 0;
        const turnType = isLeft ? 'Left ↰' : 'Right ↱';

        // Coaching Evaluation Cues
        let cueText = 'Normal Progression';
        let cueClass = 'cue-good';

        if (coastTimeSec > 1.3) {
          cueText = `⚠️ Long roll time (${coastTimeSec.toFixed(1)}s) - trail brake deeper or roll on gas earlier`;
          cueClass = 'cue-warning';
        } else if (lean >= 48 && (apexRec.speed_kmh || 0) > 85) {
          cueText = `🏆 High commitment! Peak lean ${lean.toFixed(1)}° with strong carry speed`;
          cueClass = 'cue-good';
        } else if (pickupDistM <= 12 && (exitRec.speed_kmh || 0) > (apexRec.speed_kmh || 0) + 20) {
          cueText = `🟢 Excellent drive off apex (+${((exitRec.speed_kmh - apexRec.speed_kmh) * (state.unitMph ? 0.621371 : 1)).toFixed(0)} ${state.unitMph ? 'mph' : 'km/h'})`;
          cueClass = 'cue-good';
        } else if (brakeDistM > 95 && (apexRec.speed_kmh || 0) < 55) {
          cueText = `⚡ Overslowing on entry - release brake earlier to carry momentum`;
          cueClass = 'cue-warning';
        } else {
          cueText = `✅ Clean apex transition`;
          cueClass = 'cue-good';
        }

        turns.push({
          turnNumber: turnIndex,
          name: `Turn ${turnIndex}`,
          type: turnType,
          apexSpeedKmh: apexRec.speed_kmh || 0,
          maxLeanDeg: lean,
          brakingDistM: brakeDistM,
          throttlePickupDistM: pickupDistM,
          exitSpeedKmh: exitRec.speed_kmh || 0,
          coastTimeSec: coastTimeSec,
          cueText: cueText,
          cueClass: cueClass,
          apexDistanceM: apexRec.distance_m || 0
        });
      }
    }
  }

  return turns;
}

/**
 * Renders the Turn-by-Turn Scorecard table and KPI badges in the modal.
 */
function renderScorecardTable(targetLapNum = -1) {
  if (!dom.scorecardTableBody) return;

  const turns = analyzeCornerPerformance(targetLapNum);
  if (!turns || turns.length === 0) {
    dom.scorecardTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:#888;">No turns detected in target lap.</td></tr>';
    return;
  }

  const spdUnit = state.unitMph ? 'mph' : 'km/h';
  const spdFactor = state.unitMph ? 0.621371 : 1.0;

  let totalApexSpd = 0;
  let totalCoast = 0;

  const rowsHtml = turns.map(t => {
    totalApexSpd += t.apexSpeedKmh * spdFactor;
    totalCoast += t.coastTimeSec;

    const apexSpdStr = (t.apexSpeedKmh * spdFactor).toFixed(1);
    const exitSpdStr = (t.exitSpeedKmh * spdFactor).toFixed(1);

    return `
      <tr>
        <td><span class="turn-badge">${t.name}</span></td>
        <td><strong style="color:${t.type.includes('Left') ? '#00e5ff' : '#ffd600'};">${t.type}</strong></td>
        <td><span class="text-red">-${t.brakingDistM.toFixed(0)}m</span></td>
        <td><strong class="text-green">${apexSpdStr} ${spdUnit}</strong></td>
        <td><strong class="text-cyan">${t.maxLeanDeg.toFixed(1)}°</strong></td>
        <td><span class="text-yellow">+${t.throttlePickupDistM.toFixed(0)}m</span></td>
        <td><strong style="color:#a5b4fc;">${exitSpdStr} ${spdUnit}</strong></td>
        <td><strong style="color:${t.coastTimeSec > 1.2 ? '#ff9100' : '#00e676'};">${t.coastTimeSec.toFixed(1)}s</strong></td>
        <td><span class="cue-badge ${t.cueClass}">${t.cueText}</span></td>
      </tr>
    `;
  }).join('');

  dom.scorecardTableBody.innerHTML = rowsHtml;

  // Update Scorecard KPIs
  if (dom.kpiScorecardTurns) dom.kpiScorecardTurns.textContent = turns.length.toString();
  if (dom.kpiScorecardApexSpd) dom.kpiScorecardApexSpd.textContent = `${(totalApexSpd / turns.length).toFixed(1)} ${spdUnit}`;
  if (dom.kpiScorecardCoast) dom.kpiScorecardCoast.textContent = `${totalCoast.toFixed(1)}s`;
}
