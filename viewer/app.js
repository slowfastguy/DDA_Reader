/**
 * app.js - Main Application Coordinator & UI Event Wireup
 * Ducati DDA Telemetry & GPS Visualizer Pro Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initMap();
  initCanvas();
  initDropdownMenus();
  initSplitterEngine();
  initDataCardsEngine();
  bindEvents();
  initMotoGPOverlay();
  checkEmbeddedOrSampleData();
});

function initDataCardsEngine() {
  loadCardsConfig();

  const container = dom.dataBodyScroll || document.getElementById('data-body-scroll');
  if (!container) return;

  // 1. Drag & Drop Reordering
  let draggedCard = null;
  let placeholder = null;

  function createPlaceholder() {
    const el = document.createElement('div');
    el.className = 'card-drop-placeholder';
    return el;
  }

  const cards = container.querySelectorAll('.data-card');
  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      state.isDraggingCard = true;
      draggedCard = card;
      card.classList.add('card-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.cardId || '');
      placeholder = createPlaceholder();
    });

    card.addEventListener('dragend', () => {
      state.isDraggingCard = false;
      if (draggedCard) draggedCard.classList.remove('card-dragging');
      if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
      draggedCard = null;
      placeholder = null;
      updateCardsOrderFromDOM();
    });
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedCard || !placeholder) return;

    const targetCard = e.target.closest('.data-card');
    if (!targetCard || targetCard === draggedCard) return;

    const rect = targetCard.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    if (e.clientY < midY) {
      container.insertBefore(placeholder, targetCard);
    } else {
      container.insertBefore(placeholder, targetCard.nextSibling);
    }
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    if (draggedCard && placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(draggedCard, placeholder);
      placeholder.parentNode.removeChild(placeholder);
      updateCardsOrderFromDOM();
    }
  });

  // 2. Accordion Card Collapse / Expand
  container.addEventListener('click', (e) => {
    const headerBar = e.target.closest('.card-header-bar');
    if (!headerBar) return;

    // Don't toggle collapse if dragging handle was clicked
    if (e.target.closest('.card-drag-handle')) return;

    const card = headerBar.closest('.data-card');
    if (!card) return;

    const cardId = card.dataset.cardId;
    const isCollapsed = card.classList.toggle('collapsed');
    state.cardsConfig.collapsed[cardId] = isCollapsed;
    saveCardsConfig();
  });

  // 3. Card Customizer Dropdown Handlers
  const chks = document.querySelectorAll('#menu-customize-cards input[type="checkbox"]');
  chks.forEach(chk => {
    chk.addEventListener('change', (e) => {
      const cardId = e.target.dataset.card;
      const targetCard = document.getElementById(`card-${cardId}`) || container.querySelector(`[data-card-id="${cardId}"]`);
      if (targetCard) {
        targetCard.style.display = e.target.checked ? '' : 'none';
        state.cardsConfig.hidden[cardId] = !e.target.checked;
        saveCardsConfig();
      }
    });
  });

  if (dom.btnToggleDensity) {
    dom.btnToggleDensity.addEventListener('click', () => {
      state.cardsConfig.compactDensity = !state.cardsConfig.compactDensity;
      if (dom.mainWorkspace) dom.mainWorkspace.classList.toggle('data-sidebar-compact', state.cardsConfig.compactDensity);
      if (dom.lblDensityMode) dom.lblDensityMode.textContent = state.cardsConfig.compactDensity ? 'Compact Density: ON' : 'Compact Density: OFF';
      saveCardsConfig();
    });
  }

  if (dom.btnCollapseAllCards) {
    dom.btnCollapseAllCards.addEventListener('click', () => {
      container.querySelectorAll('.data-card').forEach(c => {
        c.classList.add('collapsed');
        if (c.dataset.cardId) state.cardsConfig.collapsed[c.dataset.cardId] = true;
      });
      saveCardsConfig();
    });
  }

  if (dom.btnExpandAllCards) {
    dom.btnExpandAllCards.addEventListener('click', () => {
      container.querySelectorAll('.data-card').forEach(c => {
        c.classList.remove('collapsed');
        if (c.dataset.cardId) state.cardsConfig.collapsed[c.dataset.cardId] = false;
      });
      saveCardsConfig();
    });
  }

  if (dom.btnResetCardsOrder) {
    dom.btnResetCardsOrder.addEventListener('click', () => {
      state.cardsConfig = {
        order: ['laptimes', 'timing', 'cluster', 'lean', 'gg', 'phases'],
        collapsed: {},
        hidden: {},
        compactDensity: false
      };
      applyCardsConfigToUI();
      saveCardsConfig();
    });
  }
}

function updateCardsOrderFromDOM() {
  const container = dom.dataBodyScroll || document.getElementById('data-body-scroll');
  if (!container) return;
  const cards = container.querySelectorAll('.data-card');
  const newOrder = [];
  cards.forEach(c => {
    if (c.dataset.cardId) newOrder.push(c.dataset.cardId);
  });
  state.cardsConfig.order = newOrder;
  saveCardsConfig();
}

function applyCardsConfigToUI() {
  const container = dom.dataBodyScroll || document.getElementById('data-body-scroll');
  if (!container) return;

  // Reorder elements according to state.cardsConfig.order
  if (Array.isArray(state.cardsConfig.order)) {
    state.cardsConfig.order.forEach(cardId => {
      const cardEl = document.getElementById(`card-${cardId}`) || container.querySelector(`[data-card-id="${cardId}"]`);
      if (cardEl) {
        container.appendChild(cardEl);
      }
    });
  }

  // Apply Collapsed states
  if (state.cardsConfig.collapsed) {
    Object.keys(state.cardsConfig.collapsed).forEach(cardId => {
      const cardEl = document.getElementById(`card-${cardId}`) || container.querySelector(`[data-card-id="${cardId}"]`);
      if (cardEl) {
        cardEl.classList.toggle('collapsed', !!state.cardsConfig.collapsed[cardId]);
      }
    });
  }

  // Apply Hidden states & Sync Checkboxes
  if (state.cardsConfig.hidden) {
    Object.keys(state.cardsConfig.hidden).forEach(cardId => {
      const cardEl = document.getElementById(`card-${cardId}`) || container.querySelector(`[data-card-id="${cardId}"]`);
      const isHidden = !!state.cardsConfig.hidden[cardId];
      if (cardEl) {
        cardEl.style.display = isHidden ? 'none' : '';
      }
      const chk = document.getElementById(`chk-card-${cardId}`) || document.querySelector(`input[data-card="${cardId}"]`);
      if (chk) {
        chk.checked = !isHidden;
      }
    });
  }

  // Apply Density Mode
  if (dom.mainWorkspace) {
    dom.mainWorkspace.classList.toggle('data-sidebar-compact', !!state.cardsConfig.compactDensity);
  }
  if (dom.lblDensityMode) {
    dom.lblDensityMode.textContent = state.cardsConfig.compactDensity ? 'Compact Density: ON' : 'Compact Density: OFF';
  }
}

function saveCardsConfig() {
  try {
    localStorage.setItem('dda_cards_config', JSON.stringify(state.cardsConfig));
  } catch (err) {
    console.warn('Could not save cards config to localStorage:', err);
  }
}

function loadCardsConfig() {
  try {
    const raw = localStorage.getItem('dda_cards_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.order && Array.isArray(parsed.order)) state.cardsConfig.order = parsed.order;
      if (parsed.collapsed) state.cardsConfig.collapsed = parsed.collapsed;
      if (parsed.hidden) state.cardsConfig.hidden = parsed.hidden;
      if (parsed.compactDensity !== undefined) state.cardsConfig.compactDensity = parsed.compactDensity;
    }
  } catch (err) {
    console.warn('Could not load cards config from localStorage:', err);
  }
  applyCardsConfigToUI();
}

function initDropdownMenus() {
  const wrappers = document.querySelectorAll('.dropdown-wrapper');
  
  wrappers.forEach(wrap => {
    const trigger = wrap.querySelector('.btn-dropdown, .btn-icon');
    if (!trigger) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = wrap.classList.contains('open');
      wrappers.forEach(w => w.classList.remove('open'));
      if (!wasOpen) {
        wrap.classList.add('open');
      }
    });

    // Close menu when standard action items are clicked
    wrap.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.id === 'btn-toggle-density') return;
        wrap.classList.remove('open');
      });
    });
  });

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-wrapper')) {
      wrappers.forEach(w => w.classList.remove('open'));
    }
  });
}

function initSplitterEngine() {
  loadLayoutState();

  // Vertical Resizer (DATA Sidebar)
  if (dom.resizerSidebar) {
    let isDraggingV = false;
    let startX = 0;
    let startWidth = 420;

    dom.resizerSidebar.addEventListener('pointerdown', (e) => {
      isDraggingV = true;
      startX = e.clientX;
      startWidth = state.layout.sidebarWidth || 420;
      dom.resizerSidebar.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      dom.resizerSidebar.setPointerCapture(e.pointerId);
    });

    dom.resizerSidebar.addEventListener('pointermove', (e) => {
      if (!isDraggingV) return;
      const deltaX = startX - e.clientX;
      let newWidth = startWidth + deltaX;
      const maxAllowed = Math.max(320, window.innerWidth - 360);
      newWidth = Math.max(300, Math.min(650, Math.min(maxAllowed, newWidth)));
      state.layout.sidebarWidth = Math.round(newWidth);
      document.documentElement.style.setProperty('--sidebar-width', `${state.layout.sidebarWidth}px`);
      triggerLayoutResize();
    });

    const stopDragV = (e) => {
      if (!isDraggingV) return;
      isDraggingV = false;
      dom.resizerSidebar.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { dom.resizerSidebar.releasePointerCapture(e.pointerId); } catch (_) {}
      saveLayoutState();
      triggerLayoutResize();
    };

    dom.resizerSidebar.addEventListener('pointerup', stopDragV);
    dom.resizerSidebar.addEventListener('pointercancel', stopDragV);

    dom.resizerSidebar.addEventListener('dblclick', () => {
      state.layout.sidebarWidth = 420;
      document.documentElement.style.setProperty('--sidebar-width', '420px');
      saveLayoutState();
      triggerLayoutResize();
    });
  }

  // Horizontal Resizer (Charts Panel)
  if (dom.resizerCharts) {
    let isDraggingH = false;
    let startY = 0;
    let startHeight = 280;

    dom.resizerCharts.addEventListener('pointerdown', (e) => {
      isDraggingH = true;
      startY = e.clientY;
      startHeight = state.layout.chartsHeight || 280;
      dom.resizerCharts.classList.add('resizing');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      dom.resizerCharts.setPointerCapture(e.pointerId);
    });

    dom.resizerCharts.addEventListener('pointermove', (e) => {
      if (!isDraggingH) return;
      const deltaY = startY - e.clientY;
      let newHeight = startHeight + deltaY;
      const maxAllowed = Math.max(160, window.innerHeight - 220);
      newHeight = Math.max(130, Math.min(Math.round(window.innerHeight * 0.75), Math.min(maxAllowed, newHeight)));
      state.layout.chartsHeight = Math.round(newHeight);
      document.documentElement.style.setProperty('--charts-height', `${state.layout.chartsHeight}px`);
      triggerLayoutResize();
    });

    const stopDragH = (e) => {
      if (!isDraggingH) return;
      isDraggingH = false;
      dom.resizerCharts.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { dom.resizerCharts.releasePointerCapture(e.pointerId); } catch (_) {}
      saveLayoutState();
      triggerLayoutResize();
    };

    dom.resizerCharts.addEventListener('pointerup', stopDragH);
    dom.resizerCharts.addEventListener('pointercancel', stopDragH);

    dom.resizerCharts.addEventListener('dblclick', () => {
      state.layout.chartsHeight = 280;
      document.documentElement.style.setProperty('--charts-height', '280px');
      saveLayoutState();
      triggerLayoutResize();
    });
  }

  // Top Split Resizer (Map vs Video)
  if (dom.resizerTopSplit) {
    let isDraggingSplit = false;
    let startX = 0;

    dom.resizerTopSplit.addEventListener('pointerdown', (e) => {
      isDraggingSplit = true;
      startX = e.clientX;
      dom.resizerTopSplit.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      dom.resizerTopSplit.setPointerCapture(e.pointerId);
    });

    dom.resizerTopSplit.addEventListener('pointermove', (e) => {
      if (!isDraggingSplit) return;
      const topRow = dom.workspaceTopRow || dom.workspaceLeft;
      if (!topRow) return;
      const rect = topRow.getBoundingClientRect();
      let pct = ((e.clientX - rect.left) / rect.width) * 100;
      pct = Math.max(20, Math.min(80, Math.round(pct)));
      state.layout.topSplitPct = pct;
      document.documentElement.style.setProperty('--top-split-pct', `${pct}%`);
      triggerLayoutResize();
    });

    const stopDragSplit = (e) => {
      if (!isDraggingSplit) return;
      isDraggingSplit = false;
      dom.resizerTopSplit.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { dom.resizerTopSplit.releasePointerCapture(e.pointerId); } catch (_) {}
      saveLayoutState();
      triggerLayoutResize();
    };

    dom.resizerTopSplit.addEventListener('pointerup', stopDragSplit);
    dom.resizerTopSplit.addEventListener('pointercancel', stopDragSplit);

    dom.resizerTopSplit.addEventListener('dblclick', () => {
      state.layout.topSplitPct = 50;
      document.documentElement.style.setProperty('--top-split-pct', '50%');
      saveLayoutState();
      triggerLayoutResize();
    });
  }

  // Window Resize Observer
  window.addEventListener('resize', () => {
    triggerLayoutResize();
  });
}

function triggerLayoutResize() {
  if (state.map && typeof state.map.invalidateSize === 'function') {
    state.map.invalidateSize();
  }
  if (typeof resizeCanvas === 'function') {
    resizeCanvas();
  }
  if (typeof renderCharts === 'function') {
    renderCharts();
  }
  if (typeof renderGGDiagram === 'function') {
    renderGGDiagram();
  }
}

function toggleSidebarCollapse(force) {
  state.layout.sidebarCollapsed = (force !== undefined) ? force : !state.layout.sidebarCollapsed;
  if (dom.mainWorkspace) dom.mainWorkspace.classList.toggle('sidebar-collapsed', state.layout.sidebarCollapsed);
  if (dom.btnFloatingSidebarExpand) dom.btnFloatingSidebarExpand.style.display = state.layout.sidebarCollapsed ? 'flex' : 'none';
  saveLayoutState();
  triggerLayoutResize();
}

function toggleChartsCollapse(force) {
  state.layout.chartsCollapsed = (force !== undefined) ? force : !state.layout.chartsCollapsed;
  if (dom.mainWorkspace) dom.mainWorkspace.classList.toggle('charts-collapsed', state.layout.chartsCollapsed);
  saveLayoutState();
  triggerLayoutResize();
}

function maximizePanel(panelId) {
  if (state.layout.maximizedPanel === panelId) {
    state.layout.maximizedPanel = null;
  } else {
    state.layout.maximizedPanel = panelId;
  }

  if (dom.mainWorkspace) {
    dom.mainWorkspace.classList.toggle('panel-maximized-map', state.layout.maximizedPanel === 'map');
    dom.mainWorkspace.classList.toggle('panel-maximized-charts', state.layout.maximizedPanel === 'charts');
  }
  if (dom.btnMaximizeMap) dom.btnMaximizeMap.classList.toggle('active', state.layout.maximizedPanel === 'map');
  if (dom.btnMaximizeCharts) dom.btnMaximizeCharts.classList.toggle('active', state.layout.maximizedPanel === 'charts');

  saveLayoutState();
  triggerLayoutResize();
}

function applyLayoutPreset(presetName) {
  if (presetName === 'default') {
    state.layout.sidebarWidth = 420;
    state.layout.chartsHeight = 280;
    state.layout.topSplitPct = 50;
    state.layout.sidebarCollapsed = false;
    state.layout.chartsCollapsed = false;
    state.layout.maximizedPanel = null;
    state.cardsConfig.compactDensity = false;
  } else if (presetName === 'track_focus') {
    state.layout.sidebarCollapsed = true;
    state.layout.chartsCollapsed = true;
    state.layout.maximizedPanel = null;
  } else if (presetName === 'telemetry_focus') {
    state.layout.sidebarCollapsed = false;
    state.layout.chartsCollapsed = false;
    state.layout.chartsHeight = Math.min(480, Math.round(window.innerHeight * 0.48));
    state.layout.sidebarWidth = 360;
    state.cardsConfig.compactDensity = true;
    state.cardsConfig.order = ['cluster', 'timing', 'laptimes', 'lean', 'gg', 'phases'];
    state.layout.maximizedPanel = null;
  } else if (presetName === 'laptop') {
    state.layout.sidebarCollapsed = false;
    state.layout.chartsCollapsed = false;
    state.layout.sidebarWidth = 340;
    state.layout.chartsHeight = 220;
    state.cardsConfig.compactDensity = true;
    state.layout.maximizedPanel = null;
  }

  // Apply CSS Variables
  document.documentElement.style.setProperty('--sidebar-width', `${state.layout.sidebarWidth}px`);
  document.documentElement.style.setProperty('--charts-height', `${state.layout.chartsHeight}px`);
  document.documentElement.style.setProperty('--top-split-pct', `${state.layout.topSplitPct}%`);

  // Apply Workspace Layout Classes
  if (dom.mainWorkspace) {
    dom.mainWorkspace.classList.toggle('sidebar-collapsed', state.layout.sidebarCollapsed);
    dom.mainWorkspace.classList.toggle('charts-collapsed', state.layout.chartsCollapsed);
    dom.mainWorkspace.classList.toggle('panel-maximized-map', false);
    dom.mainWorkspace.classList.toggle('panel-maximized-charts', false);
  }
  if (dom.btnFloatingSidebarExpand) {
    dom.btnFloatingSidebarExpand.style.display = state.layout.sidebarCollapsed ? 'flex' : 'none';
  }
  if (dom.btnMaximizeMap) dom.btnMaximizeMap.classList.remove('active');
  if (dom.btnMaximizeCharts) dom.btnMaximizeCharts.classList.remove('active');

  applyCardsConfigToUI();
  saveLayoutState();
  saveCardsConfig();
  triggerLayoutResize();
}

function resetEntireLayout() {
  localStorage.removeItem('dda_layout_state');
  localStorage.removeItem('dda_cards_config');
  state.cardsConfig = {
    order: ['laptimes', 'timing', 'cluster', 'lean', 'gg', 'phases'],
    collapsed: {},
    hidden: {},
    compactDensity: false
  };
  applyLayoutPreset('default');
}

function saveLayoutState() {
  try {
    localStorage.setItem('dda_layout_state', JSON.stringify({
      sidebarWidth: state.layout.sidebarWidth,
      chartsHeight: state.layout.chartsHeight,
      topSplitPct: state.layout.topSplitPct,
      sidebarCollapsed: state.layout.sidebarCollapsed,
      chartsCollapsed: state.layout.chartsCollapsed
    }));
  } catch (err) {
    console.warn('Could not save layout state to localStorage:', err);
  }
}

function loadLayoutState() {
  try {
    const raw = localStorage.getItem('dda_layout_state');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.sidebarWidth) {
        const maxW = Math.max(300, window.innerWidth - 350);
        state.layout.sidebarWidth = Math.max(300, Math.min(650, Math.min(parsed.sidebarWidth, maxW)));
        document.documentElement.style.setProperty('--sidebar-width', `${state.layout.sidebarWidth}px`);
      }
      if (parsed.chartsHeight) {
        const maxH = Math.max(160, Math.round(window.innerHeight * 0.75));
        state.layout.chartsHeight = Math.max(130, Math.min(maxH, parsed.chartsHeight));
        document.documentElement.style.setProperty('--charts-height', `${state.layout.chartsHeight}px`);
      }
      if (parsed.topSplitPct) {
        state.layout.topSplitPct = Math.max(20, Math.min(80, parsed.topSplitPct));
        document.documentElement.style.setProperty('--top-split-pct', `${state.layout.topSplitPct}%`);
      }
      if (parsed.sidebarCollapsed !== undefined) {
        state.layout.sidebarCollapsed = !!parsed.sidebarCollapsed;
        if (dom.mainWorkspace) dom.mainWorkspace.classList.toggle('sidebar-collapsed', state.layout.sidebarCollapsed);
        if (dom.btnFloatingSidebarExpand) dom.btnFloatingSidebarExpand.style.display = state.layout.sidebarCollapsed ? 'flex' : 'none';
      }
      if (parsed.chartsCollapsed !== undefined) {
        state.layout.chartsCollapsed = !!parsed.chartsCollapsed;
        if (dom.mainWorkspace) dom.mainWorkspace.classList.toggle('charts-collapsed', state.layout.chartsCollapsed);
      }
    }
  } catch (err) {
    console.warn('Could not load layout state from localStorage:', err);
  }
}

function renderLapListTable() {
  if (!dom.lapTableBody) return;
  dom.lapTableBody.innerHTML = '';
  if (dom.selectLapJump) dom.selectLapJump.innerHTML = '<option value="-1">All Laps (Full Session)</option>';
  if (dom.selectLapA) dom.selectLapA.innerHTML = '';
  if (dom.selectLapB) dom.selectLapB.innerHTML = '';
  if (dom.selectExportLap) dom.selectExportLap.innerHTML = '';
  if (dom.selectMatrixLap) dom.selectMatrixLap.innerHTML = '<option value="-1">All Laps (Full Session)</option>';
  if (dom.selectScorecardLap) dom.selectScorecardLap.innerHTML = '<option value="-1">All Laps (Session Averages & Consistency)</option>';

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
    if (dom.selectScorecardLap) dom.selectScorecardLap.appendChild(opt.cloneNode(true));
  });

  // Optimal Lap Virtual Entry
  if (state.optimalLap) {
    const optVirtual = document.createElement('option');
    optVirtual.value = 999;
    optVirtual.textContent = `⚡ Optimal Lap (${formatTime(state.optimalLap.duration_s)}) [VIRTUAL]`;
    if (dom.selectLapJump) dom.selectLapJump.appendChild(optVirtual.cloneNode(true));
    if (dom.selectLapB) dom.selectLapB.appendChild(optVirtual.cloneNode(true));
    if (dom.selectScorecardLap) dom.selectScorecardLap.appendChild(optVirtual.cloneNode(true));
  }

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

  if (typeof generateTheoreticalOptimalLap === 'function') {
    generateTheoreticalOptimalLap();
  }

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

  // Only attempt fallback fetch if served over HTTP/HTTPS, never on file:// origin
  if (window.location && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
    fetch('Run045-192535-00.14.json')
      .then(r => r.json())
      .then(data => loadSessionData(data))
      .catch(() => console.log('Awaiting file upload or drag-and-drop.'));
  }
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
  if (typeof initVideoPlayer === 'function') initVideoPlayer();
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
      if (dom.lblMenuExtrema) dom.lblMenuExtrema.textContent = state.showSpeedExtrema ? 'Apex/Top Speeds: ON' : 'Apex/Top Speeds: OFF';
      if (dom.prefShowExtrema) dom.prefShowExtrema.checked = state.showSpeedExtrema;
      saveSettingsToStorage();
      renderSpeedExtremaMarkers();
    });
  }

  if (dom.btnPresetDefault) dom.btnPresetDefault.addEventListener('click', () => applyLayoutPreset('default'));
  if (dom.btnPresetTrackFocus) dom.btnPresetTrackFocus.addEventListener('click', () => applyLayoutPreset('track_focus'));
  if (dom.btnPresetTelemetryFocus) dom.btnPresetTelemetryFocus.addEventListener('click', () => applyLayoutPreset('telemetry_focus'));
  if (dom.btnPresetLaptop) dom.btnPresetLaptop.addEventListener('click', () => applyLayoutPreset('laptop'));
  if (dom.btnResetEntireLayout) dom.btnResetEntireLayout.addEventListener('click', resetEntireLayout);

  if (dom.btnMenuExtrema) {
    dom.btnMenuExtrema.addEventListener('click', () => {
      if (dom.btnToggleExtrema) dom.btnToggleExtrema.click();
    });
  }

  if (dom.btnMenuSelectSection) {
    dom.btnMenuSelectSection.addEventListener('click', () => {
      if (typeof toggleSectionSelectMode === 'function') toggleSectionSelectMode();
    });
  }

  if (dom.btnMenuOptimalLap) {
    dom.btnMenuOptimalLap.addEventListener('click', () => {
      if (state.optimalLap) {
        selectLap(999, false);
      } else {
        alert('Theoretical optimal lap requires valid timed laps with defined sector splits.');
      }
    });
  }

  if (dom.btnMenuFitBounds) {
    dom.btnMenuFitBounds.addEventListener('click', () => {
      if (dom.btnFitBounds) dom.btnFitBounds.click();
    });
  }

  if (dom.btnMenuOpenSync) {
    dom.btnMenuOpenSync.addEventListener('click', () => {
      const btnSync = document.getElementById('btn-open-video-sync');
      if (btnSync) btnSync.click();
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

  // Turn-by-Turn Scorecard Modal
  if (dom.btnOpenScorecard) {
    dom.btnOpenScorecard.addEventListener('click', () => {
      const lapNum = dom.selectScorecardLap ? parseInt(dom.selectScorecardLap.value, 10) : -1;
      if (typeof renderScorecardTable === 'function') renderScorecardTable(lapNum);
      if (dom.modalScorecard) dom.modalScorecard.style.display = 'flex';
    });
  }
  if (dom.btnCloseScorecard) {
    dom.btnCloseScorecard.addEventListener('click', () => {
      if (dom.modalScorecard) dom.modalScorecard.style.display = 'none';
    });
  }
  if (dom.selectScorecardLap) {
    dom.selectScorecardLap.addEventListener('change', (e) => {
      const lapNum = parseInt(e.target.value, 10);
      if (typeof renderScorecardTable === 'function') renderScorecardTable(lapNum);
    });
  }

  // MotoGP Buttons & Video Export
  if (dom.btnToggleMotoGP) {
    dom.btnToggleMotoGP.addEventListener('click', () => {
      state.motogp.showCard = !state.motogp.showCard;
      dom.btnToggleMotoGP.classList.toggle('active', state.motogp.showCard);
      if (dom.lblMotogpStatus) dom.lblMotogpStatus.textContent = state.motogp.showCard ? 'MotoGP Live Card: ON' : 'MotoGP Live Card: OFF';
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
    const hasFiles = e.dataTransfer && e.dataTransfer.types && (
      Array.from(e.dataTransfer.types).includes('Files') ||
      e.dataTransfer.types.includes('application/x-moz-file')
    );
    if (!state.isDraggingCard && hasFiles) {
      e.preventDefault();
      if (dom.dropOverlay) dom.dropOverlay.style.display = 'flex';
    }
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

  // Layout Toggle & Panel Collapse / Maximize Controls
  if (dom.btnToggleLayout) {
    dom.btnToggleLayout.addEventListener('click', () => {
      if (typeof toggleWorkspaceLayout === 'function') toggleWorkspaceLayout();
    });
  }

  if (dom.btnCollapseSidebar) {
    dom.btnCollapseSidebar.addEventListener('click', () => toggleSidebarCollapse());
  }

  if (dom.btnFloatingSidebarExpand) {
    dom.btnFloatingSidebarExpand.addEventListener('click', () => toggleSidebarCollapse(false));
  }

  if (dom.btnCollapseCharts) {
    dom.btnCollapseCharts.addEventListener('click', () => toggleChartsCollapse());
  }

  if (dom.btnMaximizeMap) {
    dom.btnMaximizeMap.addEventListener('click', () => maximizePanel('map'));
  }

  if (dom.btnMaximizeCharts) {
    dom.btnMaximizeCharts.addEventListener('click', () => maximizePanel('charts'));
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
    } else if (e.code === 'KeyT') {
      if (dom.modalScorecard) {
        const isVis = dom.modalScorecard.style.display === 'flex';
        dom.modalScorecard.style.display = isVis ? 'none' : 'flex';
        if (!isVis) {
          const lapNum = dom.selectScorecardLap ? parseInt(dom.selectScorecardLap.value, 10) : -1;
          if (typeof renderScorecardTable === 'function') renderScorecardTable(lapNum);
        }
      }
    } else if (e.code === 'KeyL') {
      if (typeof toggleWorkspaceLayout === 'function') toggleWorkspaceLayout();
    } else if (e.code === 'KeyV') {
      const modes = ['split', 'video-only', 'pip', 'map-only'];
      const nextIdx = (modes.indexOf(state.video.viewMode) + 1) % modes.length;
      if (typeof setVideoViewMode === 'function') setVideoViewMode(modes[nextIdx]);
    } else if (e.code === 'BracketLeft') {
      if (state.video && state.video.loaded && typeof nudgeVideoOffset === 'function') {
        nudgeVideoOffset(-0.0333);
      } else {
        toggleChartsCollapse();
      }
    } else if (e.code === 'BracketRight') {
      if (state.video && state.video.loaded && typeof nudgeVideoOffset === 'function') {
        nudgeVideoOffset(0.0333);
      } else {
        toggleSidebarCollapse();
      }
    } else if (e.code === 'KeyS') {
      if (state.sectionSelection.active) {
        setSyncMode(state.sectionSelection.syncMode === 'time' ? 'dist' : 'time');
      }
    } else if (e.code === 'KeyU') {
      if (dom.btnToggleUnit) dom.btnToggleUnit.click();
    } else if (e.code === 'KeyF') {
      if (dom.btnFitBounds) dom.btnFitBounds.click();
    } else if (e.code === 'Escape') {
      if (dom.modalScorecard) dom.modalScorecard.style.display = 'none';
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
