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

    // Don't toggle collapse if dragging handle or full-height expand button was clicked
    if (e.target.closest('.card-drag-handle') || e.target.closest('.btn-card-expand-full')) return;

    const card = headerBar.closest('.data-card');
    if (!card) return;

    const cardId = card.dataset.cardId;
    const isCollapsed = card.classList.toggle('collapsed');
    state.cardsConfig.collapsed[cardId] = isCollapsed;
    if (cardId === 'laptimes' && isCollapsed && state.cardsConfig.laptimesFullHeight) {
      state.cardsConfig.laptimesFullHeight = false;
    }
    applyCardsConfigToUI();
    saveCardsConfig();
  });

  // 2b. Full-Height Toggle & Drag-Resize for Lap Times & Session Log Card
  if (dom.btnExpandLaptimesFull) {
    dom.btnExpandLaptimesFull.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLaptimesFullHeight();
    });
  }
  if (dom.btnMenuExpandLaptimes) {
    dom.btnMenuExpandLaptimes.addEventListener('click', () => {
      toggleLaptimesFullHeight();
    });
  }
  if (dom.laptimesResizeHandle) {
    let isResizingLaps = false;
    let startY = 0;
    let startH = 180;

    dom.laptimesResizeHandle.addEventListener('pointerdown', (e) => {
      if (state.cardsConfig.laptimesFullHeight) return;
      const tblWrap = dom.lapTableContainer || document.getElementById('lap-table-container');
      if (!tblWrap) return;
      isResizingLaps = true;
      startY = e.clientY;
      startH = tblWrap.getBoundingClientRect().height;
      dom.laptimesResizeHandle.classList.add('resizing');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      dom.laptimesResizeHandle.setPointerCapture(e.pointerId);
    });

    dom.laptimesResizeHandle.addEventListener('pointermove', (e) => {
      if (!isResizingLaps) return;
      const deltaY = e.clientY - startY;
      const maxH = Math.max(200, (container ? container.clientHeight : window.innerHeight) - 90);
      const nextH = Math.max(100, Math.min(maxH, Math.round(startH + deltaY)));
      state.cardsConfig.laptimesCustomHeight = nextH;
      const tblWrap = dom.lapTableContainer || document.getElementById('lap-table-container');
      if (tblWrap) {
        tblWrap.style.maxHeight = `${nextH}px`;
      }
    });

    const stopResizeLaps = (e) => {
      if (!isResizingLaps) return;
      isResizingLaps = false;
      dom.laptimesResizeHandle.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { dom.laptimesResizeHandle.releasePointerCapture(e.pointerId); } catch (_) {}
      saveCardsConfig();
    };

    dom.laptimesResizeHandle.addEventListener('pointerup', stopResizeLaps);
    dom.laptimesResizeHandle.addEventListener('pointercancel', stopResizeLaps);
    dom.laptimesResizeHandle.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      toggleLaptimesFullHeight();
    });
  }

  // 3. Card Customizer Dropdown Handlers
  const chks = document.querySelectorAll('#menu-customize-cards input[type="checkbox"]');
  chks.forEach(chk => {
    chk.addEventListener('change', (e) => {
      const cardId = e.target.dataset.card;
      const targetCard = document.getElementById(`card-${cardId}`) || container.querySelector(`[data-card-id="${cardId}"]`);
      if (targetCard) {
        targetCard.style.display = e.target.checked ? '' : 'none';
        state.cardsConfig.hidden[cardId] = !e.target.checked;
        applyCardsConfigToUI();
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
      state.cardsConfig.laptimesFullHeight = false;
      container.querySelectorAll('.data-card').forEach(c => {
        c.classList.add('collapsed');
        if (c.dataset.cardId) state.cardsConfig.collapsed[c.dataset.cardId] = true;
      });
      applyCardsConfigToUI();
      saveCardsConfig();
    });
  }

  if (dom.btnExpandAllCards) {
    dom.btnExpandAllCards.addEventListener('click', () => {
      state.cardsConfig.laptimesFullHeight = false;
      container.querySelectorAll('.data-card').forEach(c => {
        c.classList.remove('collapsed');
        if (c.dataset.cardId) state.cardsConfig.collapsed[c.dataset.cardId] = false;
      });
      applyCardsConfigToUI();
      saveCardsConfig();
    });
  }

  if (dom.btnResetCardsOrder) {
    dom.btnResetCardsOrder.addEventListener('click', () => {
      state.cardsConfig = {
        order: ['laptimes', 'timing', 'cluster', 'lean', 'gg', 'phases'],
        collapsed: {},
        hidden: {},
        compactDensity: false,
        laptimesFullHeight: false,
        laptimesCustomHeight: null
      };
      applyCardsConfigToUI();
      saveCardsConfig();
    });
  }
}

function toggleLaptimesFullHeight(forceState) {
  const next = forceState !== undefined ? Boolean(forceState) : !state.cardsConfig.laptimesFullHeight;
  state.cardsConfig.laptimesFullHeight = next;
  if (next) {
    state.cardsConfig.collapsed.laptimes = false;
    state.cardsConfig.hidden.laptimes = false;
  }
  applyCardsConfigToUI();
  saveCardsConfig();
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

  // Check if all other visible cards besides laptimes are collapsed or hidden
  const otherCards = Array.from(container.querySelectorAll('.data-card:not(#card-laptimes)'));
  const allOthersCollapsedOrHidden = otherCards.every(c => c.classList.contains('collapsed') || c.style.display === 'none');
  const lapCard = document.getElementById('card-laptimes');
  const lapCardOpen = lapCard && !lapCard.classList.contains('collapsed') && lapCard.style.display !== 'none';

  const isFullHeight = Boolean(state.cardsConfig.laptimesFullHeight);
  container.classList.toggle('laptimes-full-height', isFullHeight);
  container.classList.toggle('laptimes-auto-flex', !isFullHeight && allOthersCollapsedOrHidden && lapCardOpen);

  if (dom.btnExpandLaptimesFull) {
    dom.btnExpandLaptimesFull.classList.toggle('active', isFullHeight);
    dom.btnExpandLaptimesFull.title = isFullHeight
      ? 'Restore other DATA cards (Exit full vertical height)'
      : 'Expand Lap Times & Session Log to full vertical height of DATA section';
    const iconExp = dom.btnExpandLaptimesFull.querySelector('.icon-expand-full');
    const iconRes = dom.btnExpandLaptimesFull.querySelector('.icon-restore-full');
    if (iconExp) iconExp.style.display = isFullHeight ? 'none' : '';
    if (iconRes) iconRes.style.display = isFullHeight ? '' : 'none';
  }
  if (dom.lblMenuExpandLaptimes) {
    dom.lblMenuExpandLaptimes.textContent = isFullHeight ? 'Full-Height Lap Log: ON' : 'Full-Height Lap Log: OFF';
  }

  const tblWrap = dom.lapTableContainer || document.getElementById('lap-table-container');
  if (tblWrap) {
    if (isFullHeight || (allOthersCollapsedOrHidden && lapCardOpen)) {
      tblWrap.style.maxHeight = 'none';
    } else if (state.cardsConfig.laptimesCustomHeight) {
      tblWrap.style.maxHeight = `${state.cardsConfig.laptimesCustomHeight}px`;
    } else {
      const hasMulti = (state.sessions && state.sessions.length > 1) || (state.laps || []).some(l => l.is_reference);
      tblWrap.style.maxHeight = hasMulti ? '260px' : '';
    }
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
      if (parsed.laptimesFullHeight !== undefined) state.cardsConfig.laptimesFullHeight = Boolean(parsed.laptimesFullHeight);
      if (parsed.laptimesCustomHeight !== undefined) state.cardsConfig.laptimesCustomHeight = parsed.laptimesCustomHeight;
    }
  } catch (err) {
    console.warn('Could not load cards config from localStorage:', err);
  }
  applyCardsConfigToUI();
}

function initDropdownMenus() {
  const wrappers = document.querySelectorAll('.dropdown-wrapper');
  
  wrappers.forEach(wrap => {
    const trigger = wrap.querySelector('.btn-dropdown, .btn-icon, .btn-tool-sm, .dropdown-trigger');
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
        if (item.id === 'btn-toggle-density' || item.classList.contains('channel-toggle-btn') || item.closest('#menu-channels')) return;
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

  // Compare Resizer (Map vs Telemetry in Side-by-Side / Turn Comparison Mode)
  if (dom.resizerCompare) {
    let isDraggingCompare = false;

    dom.resizerCompare.addEventListener('pointerdown', (e) => {
      isDraggingCompare = true;
      dom.resizerCompare.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      dom.resizerCompare.setPointerCapture(e.pointerId);
    });

    dom.resizerCompare.addEventListener('pointermove', (e) => {
      if (!isDraggingCompare) return;
      const leftArea = dom.workspaceLeft;
      if (!leftArea) return;
      const rect = leftArea.getBoundingClientRect();
      if (rect.width <= 0) return;
      let pct = ((e.clientX - rect.left) / rect.width) * 100;
      const minPct = Math.max(15, (250 / rect.width) * 100);
      const maxPct = Math.min(85, ((rect.width - 280) / rect.width) * 100);
      pct = Math.max(minPct, Math.min(maxPct, Math.round(pct)));
      state.layout.compareSplitPct = pct;
      document.documentElement.style.setProperty('--compare-split-pct', `${pct}%`);
      triggerLayoutResize();
    });

    const stopDragCompare = (e) => {
      if (!isDraggingCompare) return;
      isDraggingCompare = false;
      dom.resizerCompare.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { dom.resizerCompare.releasePointerCapture(e.pointerId); } catch (_) {}
      saveLayoutState();
      triggerLayoutResize();
    };

    dom.resizerCompare.addEventListener('pointerup', stopDragCompare);
    dom.resizerCompare.addEventListener('pointercancel', stopDragCompare);

    dom.resizerCompare.addEventListener('dblclick', () => {
      state.layout.compareSplitPct = 48;
      document.documentElement.style.setProperty('--compare-split-pct', '48%');
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

function syncWorkspacePanelsUI() {
  const grid = dom.mainWorkspace || document.querySelector('.workspace-grid');
  if (!grid) return;

  // Ensure at least one panel remains visible if not maximized
  if (state.layout.mapCollapsed && state.layout.videoCollapsed && state.layout.chartsCollapsed && state.layout.sidebarCollapsed) {
    state.layout.mapCollapsed = false;
  }

  const maxP = state.layout.maximizedPanel;
  const mapOpen = !state.layout.mapCollapsed;
  const videoOpen = !state.layout.videoCollapsed;
  const chartsOpen = !state.layout.chartsCollapsed;
  const dataOpen = !state.layout.sidebarCollapsed;
  const isPip = videoOpen && state.video && state.video.viewMode === 'pip';

  grid.classList.toggle('map-collapsed', !mapOpen);
  grid.classList.toggle('video-collapsed', !videoOpen);
  grid.classList.toggle('charts-collapsed', !chartsOpen);
  grid.classList.toggle('sidebar-collapsed', !dataOpen);
  grid.classList.toggle('top-row-collapsed', !mapOpen && (!videoOpen || isPip));

  grid.classList.toggle('panel-maximized-map', maxP === 'map');
  grid.classList.toggle('panel-maximized-video', maxP === 'video');
  grid.classList.toggle('panel-maximized-charts', maxP === 'charts');
  grid.classList.toggle('panel-maximized-data', maxP === 'data');

  // Synchronize Map & Video Top Row
  const panelMap = dom.panelMap;
  const panelVideo = dom.panelVideo;
  const resizerTop = dom.resizerTopSplit;

  grid.classList.remove('video-split-active', 'video-primary-active');
  if (panelVideo) panelVideo.classList.remove('video-pip-mode');

  if (isPip && maxP !== 'video') {
    if (panelVideo) {
      panelVideo.style.display = 'flex';
      panelVideo.classList.add('video-pip-mode');
    }
    if (panelMap) panelMap.style.display = mapOpen ? 'flex' : 'none';
    if (resizerTop) resizerTop.style.display = 'none';
  } else if (mapOpen && videoOpen) {
    if (panelMap) panelMap.style.display = 'flex';
    if (panelVideo) panelVideo.style.display = 'flex';
    if (resizerTop) resizerTop.style.display = 'flex';
    grid.classList.add('video-split-active');
  } else if (mapOpen && !videoOpen) {
    if (panelMap) panelMap.style.display = 'flex';
    if (panelVideo) panelVideo.style.display = 'none';
    if (resizerTop) resizerTop.style.display = 'none';
  } else if (!mapOpen && videoOpen) {
    if (panelMap) panelMap.style.display = 'none';
    if (panelVideo) panelVideo.style.display = 'flex';
    if (resizerTop) resizerTop.style.display = 'none';
    grid.classList.add('video-primary-active');
  } else {
    if (panelMap) panelMap.style.display = 'none';
    if (panelVideo) panelVideo.style.display = 'none';
    if (resizerTop) resizerTop.style.display = 'none';
  }

  // Synchronize Top-Header Workspace Panel Switcher Pills
  if (dom.btnPanelToggleMap) dom.btnPanelToggleMap.classList.toggle('active', maxP ? maxP === 'map' : mapOpen);
  if (dom.btnPanelToggleVideo) dom.btnPanelToggleVideo.classList.toggle('active', maxP ? maxP === 'video' : videoOpen);
  if (dom.btnPanelToggleCharts) dom.btnPanelToggleCharts.classList.toggle('active', maxP ? maxP === 'charts' : chartsOpen);
  if (dom.btnPanelToggleData) dom.btnPanelToggleData.classList.toggle('active', maxP ? maxP === 'data' : dataOpen);

  // Synchronize Maximize Icons on all 4 panels
  if (dom.btnMaximizeMap) dom.btnMaximizeMap.classList.toggle('active', maxP === 'map');
  if (dom.btnMaximizeVideo) dom.btnMaximizeVideo.classList.toggle('active', maxP === 'video');
  if (dom.btnMaximizeCharts) dom.btnMaximizeCharts.classList.toggle('active', maxP === 'charts');
  if (dom.btnMaximizeData) dom.btnMaximizeData.classList.toggle('active', maxP === 'data');
  if (dom.btnVideoPipToggle) dom.btnVideoPipToggle.classList.toggle('active', isPip);
}

function togglePanelVisibility(panelId, forceVisible) {
  // If another panel is currently maximized and user clicks a panel pill in top header, exit maximize
  if (state.layout.maximizedPanel) {
    if (state.layout.maximizedPanel === panelId && forceVisible === false) {
      state.layout.maximizedPanel = null;
    } else if (forceVisible === undefined) {
      const wasThisMax = state.layout.maximizedPanel === panelId;
      state.layout.maximizedPanel = null;
      if (!wasThisMax) {
        if (panelId === 'map') state.layout.mapCollapsed = false;
        if (panelId === 'video') state.layout.videoCollapsed = false;
        if (panelId === 'charts') state.layout.chartsCollapsed = false;
        if (panelId === 'data') state.layout.sidebarCollapsed = false;
        syncWorkspacePanelsUI();
        saveLayoutState();
        triggerLayoutResize();
        return;
      }
    }
  }

  if (panelId === 'map') {
    state.layout.mapCollapsed = forceVisible !== undefined ? !forceVisible : !state.layout.mapCollapsed;
  } else if (panelId === 'video') {
    state.layout.videoCollapsed = forceVisible !== undefined ? !forceVisible : !state.layout.videoCollapsed;
  } else if (panelId === 'charts') {
    state.layout.chartsCollapsed = forceVisible !== undefined ? !forceVisible : !state.layout.chartsCollapsed;
  } else if (panelId === 'data') {
    state.layout.sidebarCollapsed = forceVisible !== undefined ? !forceVisible : !state.layout.sidebarCollapsed;
  }

  syncWorkspacePanelsUI();
  saveLayoutState();
  setTimeout(() => triggerLayoutResize(), 40);
}

function toggleSidebarCollapse(force) {
  const nextCollapsed = (force !== undefined) ? force : !state.layout.sidebarCollapsed;
  togglePanelVisibility('data', !nextCollapsed);
}

function toggleChartsCollapse(force) {
  const nextCollapsed = (force !== undefined) ? force : !state.layout.chartsCollapsed;
  togglePanelVisibility('charts', !nextCollapsed);
}

function maximizePanel(panelId) {
  if (state.layout.maximizedPanel === panelId) {
    state.layout.maximizedPanel = null;
  } else {
    state.layout.maximizedPanel = panelId;
    if (panelId === 'map') state.layout.mapCollapsed = false;
    if (panelId === 'video') state.layout.videoCollapsed = false;
    if (panelId === 'charts') state.layout.chartsCollapsed = false;
    if (panelId === 'data') state.layout.sidebarCollapsed = false;
  }

  syncWorkspacePanelsUI();
  saveLayoutState();
  setTimeout(() => triggerLayoutResize(), 40);
}

function applyLayoutPreset(presetName) {
  if (presetName === 'default') {
    state.layout.sidebarWidth = 420;
    state.layout.chartsHeight = 280;
    state.layout.topSplitPct = 50;
    state.layout.compareSplitPct = 48;
    state.layout.mapCollapsed = false;
    state.layout.videoCollapsed = !(state.video && state.video.hasVideo);
    state.layout.sidebarCollapsed = false;
    state.layout.chartsCollapsed = false;
    state.layout.maximizedPanel = null;
    state.cardsConfig.compactDensity = false;
  } else if (presetName === 'track_focus') {
    state.layout.mapCollapsed = false;
    state.layout.sidebarCollapsed = true;
    state.layout.chartsCollapsed = true;
    state.layout.maximizedPanel = null;
  } else if (presetName === 'telemetry_focus') {
    state.layout.mapCollapsed = false;
    state.layout.sidebarCollapsed = false;
    state.layout.chartsCollapsed = false;
    state.layout.chartsHeight = Math.min(480, Math.round(window.innerHeight * 0.48));
    state.layout.sidebarWidth = 360;
    state.cardsConfig.compactDensity = true;
    state.cardsConfig.order = ['cluster', 'timing', 'laptimes', 'lean', 'gg', 'phases'];
    state.layout.maximizedPanel = null;
  } else if (presetName === 'laptop') {
    state.layout.mapCollapsed = false;
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
  document.documentElement.style.setProperty('--compare-split-pct', `${state.layout.compareSplitPct || 48}%`);

  syncWorkspacePanelsUI();
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
      compareSplitPct: state.layout.compareSplitPct,
      mapCollapsed: state.layout.mapCollapsed,
      videoCollapsed: state.layout.videoCollapsed,
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
      if (parsed.compareSplitPct) {
        state.layout.compareSplitPct = Math.max(15, Math.min(85, parsed.compareSplitPct));
        document.documentElement.style.setProperty('--compare-split-pct', `${state.layout.compareSplitPct}%`);
      }
      if (parsed.mapCollapsed !== undefined) {
        state.layout.mapCollapsed = !!parsed.mapCollapsed;
      }
      if (parsed.videoCollapsed !== undefined) {
        state.layout.videoCollapsed = !!parsed.videoCollapsed;
      }
      if (parsed.sidebarCollapsed !== undefined) {
        state.layout.sidebarCollapsed = !!parsed.sidebarCollapsed;
      }
      if (parsed.chartsCollapsed !== undefined) {
        state.layout.chartsCollapsed = !!parsed.chartsCollapsed;
      }
    }
  } catch (err) {
    console.warn('Could not load layout state from localStorage:', err);
  }
  syncWorkspacePanelsUI();
}

const VIEWER_SESSION_COLORS = [
  '#ff1801', '#00e5ff', '#ffb300', '#00e676',
  '#d500f9', '#ff4081', '#2979ff', '#ffd600'
];

function renderSessionFilterBar() {
  if (!dom.sessionFilterBar || !dom.sessionFilterPills) return;

  state.activeSessionFilter = 'ALL';
  dom.sessionFilterBar.style.display = 'flex';

  // Quick Lap Filter Buttons Only (Flying Only, Session Bests, Reset)
  const isBestPerSessActive = Boolean(state._bestPerSessionFilterActive);
  const pillsHtml = `
    <button type="button" class="session-pill lap-qfilter-pill ${state.hideOutInLaps && !isBestPerSessActive ? 'active' : ''}" data-qfilter="flying" title="Hide Out-Laps and In-Laps">
      ⚡ Flying
    </button>
    <button type="button" class="session-pill lap-qfilter-pill ${isBestPerSessActive ? 'active' : ''}" data-qfilter="best_per_session" title="Check only the fastest flying lap from each session">
      🏆 Session Bests
    </button>
    <button type="button" class="session-pill lap-qfilter-pill" data-qfilter="reset_all" title="Include & show all laps across all sessions">
      ☑️ Reset
    </button>
  `;

  dom.sessionFilterPills.innerHTML = pillsHtml;

  dom.sessionFilterPills.querySelectorAll('.lap-qfilter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const qf = btn.dataset.qfilter;
      if (qf === 'flying') {
        state._bestPerSessionFilterActive = false;
        state.hideOutInLaps = !state.hideOutInLaps;
        recalculateLapsAndSectors();
      } else if (qf === 'best_per_session') {
        state._bestPerSessionFilterActive = !state._bestPerSessionFilterActive;
        if (!state.excludedLapKeys) state.excludedLapKeys = new Set();
        state.excludedLapKeys.clear();
        if (state._bestPerSessionFilterActive) {
          state.hideOutInLaps = true;
          // First recalculate with all flying laps included to find true session bests
          recalculateLapsAndSectors();
          (state.laps || []).forEach(l => {
            if (!l.is_optimal && !l.is_session_best && !l.is_reference && l.lap_key) {
              state.excludedLapKeys.add(l.lap_key);
            }
          });
        } else {
          state.hideOutInLaps = false;
        }
        recalculateLapsAndSectors();
      } else if (qf === 'reset_all') {
        state._bestPerSessionFilterActive = false;
        state.hideOutInLaps = false;
        if (state.excludedLapKeys) state.excludedLapKeys.clear();
        recalculateLapsAndSectors();
      }
      if (dom.modalProgression && dom.modalProgression.style.display === 'flex' && typeof renderDayProgressionModal === 'function') {
        renderDayProgressionModal();
      }
    });
  });
}

function setSessionFilter(sessionId) {
  state.activeSessionFilter = 'ALL';
  recalculateLapsAndSectors();
  if (sessionId && sessionId !== 'ALL') {
    const matching = (state.laps || []).filter(l => !l.is_optimal && (l.session_id || 'S1') === sessionId);
    const bestInFilter = matching.find(l => l.is_session_best || l.is_best) || matching[0];
    if (bestInFilter) {
      selectLap(bestInFilter.lap_number, false);
    }
  }
}

function renderLapListTable() {
  if (!dom.lapTableBody) return;
  dom.lapTableBody.innerHTML = '';
  if (dom.selectLapJump) dom.selectLapJump.innerHTML = '<option value="-1">All Laps (Full Session)</option>';
  if (dom.selectLapA) dom.selectLapA.innerHTML = '';
  if (dom.selectLapB) dom.selectLapB.innerHTML = '';
  if (dom.selectExportLap) dom.selectExportLap.innerHTML = '';
  if (dom.selectSeamLap) dom.selectSeamLap.innerHTML = '';
  if (dom.selectMatrixLap) dom.selectMatrixLap.innerHTML = '<option value="-1">All Laps (Full Session)</option>';
  if (dom.selectScorecardLap) dom.selectScorecardLap.innerHTML = '<option value="-1">All Laps (Session Averages & Consistency)</option>';

  if (!state.collapsedSessionGroups) {
    state.collapsedSessionGroups = new Set();
  }

  // Populate all <select> dropdowns across the workspace
  (state.laps || []).forEach(l => {
    const durStr = formatTime(l.duration_s);
    const opt = document.createElement('option');
    opt.value = l.lap_number;
    opt.textContent = `${l.name} (${durStr})${l.is_best ? ' [BEST]' : (l.is_reference ? ' [REF]' : '')}`;
    if (dom.selectLapJump) dom.selectLapJump.appendChild(opt.cloneNode(true));
    if (dom.selectLapA) dom.selectLapA.appendChild(opt.cloneNode(true));
    if (dom.selectLapB) dom.selectLapB.appendChild(opt.cloneNode(true));
    if (dom.selectExportLap) dom.selectExportLap.appendChild(opt.cloneNode(true));
    if (dom.selectSeamLap) dom.selectSeamLap.appendChild(opt.cloneNode(true));
    if (dom.selectMatrixLap) dom.selectMatrixLap.appendChild(opt.cloneNode(true));
    if (dom.selectScorecardLap) dom.selectScorecardLap.appendChild(opt.cloneNode(true));
  });

  // Build ordered session groups & metadata
  const sessOrder = [];
  const sessMeta = {};
  (state.sessions || []).forEach((s, idx) => {
    const sid = s.id || `S${idx + 1}`;
    if (!sessMeta[sid]) {
      sessOrder.push(sid);
      sessMeta[sid] = {
        id: sid,
        label: s.label || sid,
        color: s.color || (s.is_reference ? '#ffd600' : VIEWER_SESSION_COLORS[idx % VIEWER_SESSION_COLORS.length]),
        is_reference: Boolean(s.is_reference),
        source_file: s.source_file || '',
        session_datetime: s.session_datetime || '',
        laps: []
      };
    }
  });

  (state.laps || []).forEach(l => {
    if (l.is_optimal) return;
    const lapSid = l.session_id || (l.is_reference ? 'REF' : 'S1');
    if (state.hideOutInLaps && (l.is_out_lap || l.is_in_lap)) return;

    if (!sessMeta[lapSid]) {
      const idx = sessOrder.length;
      sessOrder.push(lapSid);
      sessMeta[lapSid] = {
        id: lapSid,
        label: l.is_reference ? 'Reference Laps' : (l.session_label || `Session ${lapSid}`),
        color: l.session_color || (l.is_reference ? '#ffd600' : VIEWER_SESSION_COLORS[idx % VIEWER_SESSION_COLORS.length]),
        is_reference: Boolean(l.is_reference),
        source_file: '',
        session_datetime: l.session_datetime || '',
        laps: []
      };
    }
    sessMeta[lapSid].laps.push(l);
  });

  const nonEmptySessionIds = sessOrder.filter(sid => sessMeta[sid] && sessMeta[sid].laps.length > 0);
  const allGroupsCollapsed = nonEmptySessionIds.length > 0 && nonEmptySessionIds.every(sid => state.collapsedSessionGroups.has(sid));

  // Top "All Sessions" Summary Row
  const trAll = document.createElement('tr');
  trAll.dataset.lap = '-1';
  if (state.selectedLapNum === -1) trAll.className = 'active-lap-row';
  const totalDur = state.records.length > 0 ? (state.records[state.records.length - 1].time_s - state.records[0].time_s) : 0;
  const foldAllBtnHtml = nonEmptySessionIds.length > 1
    ? `<button type="button" class="btn-fold-all-sessions" title="${allGroupsCollapsed ? 'Expand all session groups' : 'Collapse all session groups'}">${allGroupsCollapsed ? '⊞ Expand' : '⊟ Fold'}</button>`
    : '';

  trAll.innerHTML = `
    <td style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
      <strong>🏁 All Sessions</strong>
      ${foldAllBtnHtml}
    </td>
    <td>${formatTime(totalDur)}</td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td>${state.sessionData?.stats?.max_speed_mph ? state.sessionData.stats.max_speed_mph.toFixed(0) + ' mph' : '-'}</td>
  `;
  trAll.addEventListener('click', (e) => {
    if (e.target.closest('.btn-fold-all-sessions')) return;
    selectLap(-1, false);
  });
  const btnFoldAll = trAll.querySelector('.btn-fold-all-sessions');
  if (btnFoldAll) {
    btnFoldAll.addEventListener('click', (e) => {
      e.stopPropagation();
      if (allGroupsCollapsed) {
        state.collapsedSessionGroups.clear();
      } else {
        nonEmptySessionIds.forEach(sid => state.collapsedSessionGroups.add(sid));
      }
      renderLapListTable();
    });
  }
  dom.lapTableBody.appendChild(trAll);

  // Render Each Session as a Header Row with Nested Lap Rows Below It
  nonEmptySessionIds.forEach(sid => {
    const group = sessMeta[sid];
    const sessLaps = group.laps;
    const sColor = group.color || '#ff1801';
    const isCollapsed = state.collapsedSessionGroups.has(sid);

    const includedCount = sessLaps.filter(l => l.included !== false).length;
    const allIncluded = includedCount === sessLaps.length && sessLaps.length > 0;
    const someIncluded = includedCount > 0 && includedCount < sessLaps.length;

    const flyingLaps = sessLaps.filter(l => l.is_flying && l.included !== false);
    const bestLapInSess = sessLaps.find(l => l.is_session_best && l.included !== false) ||
      (flyingLaps.length > 0 ? flyingLaps.reduce((a, b) => a.duration_s < b.duration_s ? a : b) : null);
    const bestTimeStr = bestLapInSess ? formatTime(bestLapInSess.duration_s) : '';

    const sessHourName = group.is_reference ? '⭐ Reference Laps' : (group.label || sid);
    const tooltipInfo = [group.session_datetime, group.source_file].filter(Boolean).join(' · ') || sessHourName;

    // 1. Session Group Header Row
    const trHeader = document.createElement('tr');
    trHeader.className = `session-group-header ${isCollapsed ? 'is-collapsed' : ''}`;
    trHeader.dataset.sessionId = sid;
    trHeader.style.setProperty('--sess-color', sColor);

    const countBadgeText = `${sessLaps.length} ${sessLaps.length === 1 ? 'Lap' : 'Laps'}`;
    trHeader.innerHTML = `
      <td colspan="6" class="session-group-cell">
        <div class="session-group-bar">
          <div class="session-group-left">
            <span class="session-group-caret" title="${isCollapsed ? 'Expand session laps' : 'Collapse session laps'}">${isCollapsed ? '▸' : '▾'}</span>
            <input type="checkbox" class="session-group-chk" data-session-id="${escapeHTML(sid)}" ${allIncluded ? 'checked' : ''} title="Check/uncheck all laps in ${escapeHTML(sessHourName)}">
            <span class="sess-dot" style="background:${sColor};"></span>
            <span class="session-group-title" style="color:${sColor};" title="${escapeHTML(tooltipInfo)}">${escapeHTML(sessHourName)}</span>
          </div>
          <div class="session-group-right">
            <span class="session-group-count">${countBadgeText}</span>
            ${bestTimeStr ? `<button type="button" class="session-group-best-btn" data-best-lap="${bestLapInSess.lap_number}" title="Jump to fastest lap in ${escapeHTML(sessHourName)} (${bestTimeStr})">⚡ ${bestTimeStr}</button>` : ''}
          </div>
        </div>
      </td>
    `;

    const sessChkEl = trHeader.querySelector('.session-group-chk');
    if (sessChkEl) {
      sessChkEl.indeterminate = someIncluded;
      sessChkEl.addEventListener('change', (e) => {
        e.stopPropagation();
        if (!state.excludedLapKeys) state.excludedLapKeys = new Set();
        const checkAll = e.target.checked;
        (state.laps || []).forEach(l => {
          if (l.is_optimal) return;
          const lSid = l.session_id || (l.is_reference ? 'REF' : 'S1');
          if (lSid === sid) {
            const lKey = l.lap_key || `${lSid}:${l.orig_lap_number !== undefined ? l.orig_lap_number : l.lap_number}`;
            if (checkAll) {
              state.excludedLapKeys.delete(lKey);
            } else {
              state.excludedLapKeys.add(lKey);
            }
          }
        });
        recalculateLapsAndSectors();
        if (dom.modalProgression && dom.modalProgression.style.display === 'flex' && typeof renderDayProgressionModal === 'function') {
          renderDayProgressionModal();
        }
      });
    }

    const bestJumpBtn = trHeader.querySelector('.session-group-best-btn');
    if (bestJumpBtn) {
      bestJumpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetLapNum = parseInt(bestJumpBtn.dataset.bestLap, 10);
        if (!isNaN(targetLapNum)) {
          selectLap(targetLapNum, false);
        }
      });
    }

    trHeader.addEventListener('click', (e) => {
      if (e.target.closest('.session-group-chk') || e.target.closest('.session-group-best-btn')) return;
      if (state.collapsedSessionGroups.has(sid)) {
        state.collapsedSessionGroups.delete(sid);
      } else {
        state.collapsedSessionGroups.add(sid);
      }
      renderLapListTable();
    });

    dom.lapTableBody.appendChild(trHeader);

    // 2. Nested Lap Rows (if session group is expanded)
    if (!isCollapsed) {
      sessLaps.forEach((l, lapIdxInSess) => {
        const isInc = l.included !== false;
        const lapSid = l.session_id || (l.is_reference ? 'REF' : 'S1');
        const lapKey = l.lap_key || `${lapSid}:${l.orig_lap_number !== undefined ? l.orig_lap_number : l.lap_number}`;
        const durStr = formatTime(l.duration_s);

        const tr = document.createElement('tr');
        tr.dataset.lap = l.lap_number.toString();
        tr.classList.add('lap-nested-row');
        if (lapIdxInSess === sessLaps.length - 1) tr.classList.add('lap-nested-last');
        if (l.is_best) tr.classList.add('best-lap-row');
        if (!isInc) tr.classList.add('lap-row-excluded');
        if (l.lap_number === state.selectedLapNum) tr.classList.add('active-lap-row');
        tr.style.setProperty('--sess-color', sColor);

        const s1 = l.sectors && l.sectors[0] ? `${l.sectors[0].toFixed(1)}` : '-';
        const s2 = l.sectors && l.sectors[1] ? `${l.sectors[1].toFixed(1)}` : '-';
        const s3 = l.sectors && l.sectors[2] ? `${l.sectors[2].toFixed(1)}` : '-';
        const maxSpd = l.max_speed_kmh ? (state.unitMph ? (l.max_speed_kmh * 0.621371).toFixed(0) : l.max_speed_kmh.toFixed(0)) : '-';

        const cleanLapName = (l.orig_name || l.name || `Lap ${l.lap_number}`).replace(new RegExp(`^${lapSid}\\s*[·\\-:]\\s*`, 'i'), '');
        const starBtn = !l.is_optimal
          ? `<button type="button" class="btn-star-ref" data-lap="${l.lap_number}" title="Save & Export as Reference Lap (.ddalap.json)">⭐</button>`
          : '';

        const chkHtml = !l.is_optimal
          ? `<input type="checkbox" class="lap-include-chk" data-lapkey="${escapeHTML(lapKey)}" ${isInc ? 'checked' : ''} title="Check/uncheck to include or exclude this lap from Best Lap, Optimal Lap & Day Progression">`
          : '';

        const treeBranch = lapIdxInSess === sessLaps.length - 1 ? '└' : '├';
        const trophyIcon = l.is_best ? '🏆 ' : (l.is_session_best && !l.is_reference ? '⚡ ' : '');

        tr.innerHTML = `
          <td class="lap-nested-first-cell">
            <span class="lap-nested-left-wrap">
              <span class="lap-tree-branch" style="color:${sColor};">${treeBranch}</span>
              ${chkHtml}
              <span class="lap-nested-name">${trophyIcon}${escapeHTML(cleanLapName)}</span>
            </span>
            ${starBtn}
          </td>
          <td><strong>${durStr}</strong></td>
          <td>${s1}</td>
          <td>${s2}</td>
          <td>${s3}</td>
          <td>${maxSpd}</td>
        `;
        tr.addEventListener('click', (e) => {
          if (e.target.closest('.btn-star-ref') || e.target.closest('.lap-include-chk')) return;
          selectLap(l.lap_number, false);
        });
        const chkEl = tr.querySelector('.lap-include-chk');
        if (chkEl) {
          chkEl.addEventListener('change', (e) => {
            e.stopPropagation();
            if (!state.excludedLapKeys) state.excludedLapKeys = new Set();
            if (e.target.checked) {
              state.excludedLapKeys.delete(lapKey);
            } else {
              state.excludedLapKeys.add(lapKey);
            }
            recalculateLapsAndSectors();
            if (dom.modalProgression && dom.modalProgression.style.display === 'flex' && typeof renderDayProgressionModal === 'function') {
              renderDayProgressionModal();
            }
          });
        }
        const btnStar = tr.querySelector('.btn-star-ref');
        if (btnStar) {
          btnStar.addEventListener('click', (e) => {
            e.stopPropagation();
            saveLapAsReferenceInBrowser(l.lap_number);
          });
        }
        dom.lapTableBody.appendChild(tr);
      });
    }
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
    if (dom.selectSeamLap) dom.selectSeamLap.value = bestLap.lap_number;
  }

  if (typeof applyCardsConfigToUI === 'function') {
    applyCardsConfigToUI();
  }
}

function saveLapAsReferenceInBrowser(lapNumber) {
  const lap = (state.laps || []).find(l => l.lap_number === lapNumber);
  if (!lap) return;

  const h = (state.sessionData && state.sessionData.header) || {};
  const trackName = (dom.metaTrackName ? dom.metaTrackName.textContent.trim() : '') || h.track_name || 'Unknown Track';
  const riderName = h.rider_name || 'Ducati Rider';
  const defaultLabel = `${riderName} · ${lap.orig_name || lap.name} (${formatTime(lap.duration_s)})`;

  const customName = prompt('Save Reference Lap — enter a name for this benchmark lap:', defaultLabel);
  if (!customName || !customName.trim()) return;

  const sliceRecs = state.records.slice(lap.start_index, lap.end_index + 1);
  if (!sliceRecs.length) return;

  const t0 = sliceRecs[0].time_s || 0;
  const d0 = sliceRecs[0].distance_m || 0;
  const normRecs = sliceRecs.map(r => {
    const copy = Object.assign({}, r);
    copy.time_s = Number(Math.max(0, (r.time_s || 0) - t0).toFixed(3));
    copy.distance_m = Number(Math.max(0, (r.distance_m || 0) - d0).toFixed(2));
    copy.session_id = 'REF';
    delete copy.orig_index;
    delete copy.local_index;
    return copy;
  });

  const refObj = {
    format: 'dda_reference_lap_v1',
    id: `ref_${Date.now()}_${lapNumber}`,
    name: customName.trim(),
    track_name: trackName,
    rider_name: riderName,
    bike_model: h.bike_model || '',
    bike_code: h.bike_code || '',
    session_datetime: h.session_datetime || new Date().toISOString().slice(0, 19).replace('T', ' '),
    unix_timestamp: h.unix_timestamp || Math.floor(Date.now() / 1000),
    duration_s: Number((lap.duration_s || 0).toFixed(3)),
    distance_m: Number((lap.distance_m || 0).toFixed(1)),
    sectors: lap.sectors || [lap.sector_1_s || null, lap.sector_2_s || null, lap.sector_3_s || null],
    max_speed_kmh: Number((lap.max_speed_kmh || 0).toFixed(1)),
    max_gps_speed_kmh: Number((lap.max_gps_speed_kmh || 0).toFixed(1)),
    max_lean_left_deg: Number((lap.max_lean_left_deg || 0).toFixed(1)),
    max_lean_right_deg: Number((lap.max_lean_right_deg || 0).toFixed(1)),
    max_rpm: lap.max_rpm || 0,
    gates: JSON.parse(JSON.stringify(state.gates || [])),
    records: normRecs
  };

  if (!Array.isArray(state.referenceLaps)) state.referenceLaps = [];
  state.referenceLaps.push(refObj);
  saveSettingsToStorage();
  if (typeof renderTrackLibrary === 'function') renderTrackLibrary();

  if (confirm(`Saved "${refObj.name}" to your built-in Reference Lap Library!\n\nWould you also like to download a shareable .ddalap.json file?`)) {
    downloadReferenceLapFile(refObj);
  }
}

function downloadReferenceLapFile(refObj) {
  if (!refObj) return;
  const safeName = `${refObj.track_name || 'Track'}_${refObj.name || 'RefLap'}`
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const jsonStr = JSON.stringify(refObj, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.ddalap.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function appendReferenceLapToSession(refObj) {
  if (!refObj || !Array.isArray(refObj.records) || refObj.records.length === 0) {
    alert('Reference Lap file contains no telemetry records.');
    return;
  }

  // Save to browser Reference Lap Library if not already present
  if (!Array.isArray(state.referenceLaps)) state.referenceLaps = [];
  if (refObj.id && !state.referenceLaps.some(r => r.id === refObj.id)) {
    state.referenceLaps.push(refObj);
    saveSettingsToStorage();
  }

  if (!state.records || state.records.length === 0) {
    // Wrap Reference Lap as a standalone session
    const wrapped = {
      is_multi_session: false,
      pre_segmented_laps: true,
      sessions: [{
        id: 'REF',
        label: `⭐ Ref · ${refObj.name || 'Reference'}`,
        color: '#ffd600',
        track_name: refObj.track_name || 'Track',
        rider_name: refObj.rider_name || 'Rider',
        is_reference: true
      }],
      header: {
        track_name: refObj.track_name || 'Track',
        rider_name: refObj.rider_name || 'Rider',
        bike_model: refObj.bike_model || '',
        session_datetime: refObj.session_datetime || ''
      },
      stats: {
        duration_s: refObj.duration_s || 0,
        duration_min: (refObj.duration_s || 0) / 60.0,
        max_speed_kmh: refObj.max_speed_kmh || 0,
        max_speed_mph: (refObj.max_speed_kmh || 0) * 0.621371
      },
      gates: refObj.gates || [],
      laps: [{
        lap_number: 1,
        orig_lap_number: 1,
        session_id: 'REF',
        session_label: `⭐ Ref · ${refObj.name || 'Reference'}`,
        session_color: '#ffd600',
        name: `REF · ${refObj.name || 'Reference'}`,
        orig_name: refObj.name || 'Reference',
        start_time_s: 0,
        end_time_s: refObj.duration_s || refObj.records[refObj.records.length - 1].time_s,
        duration_s: refObj.duration_s || refObj.records[refObj.records.length - 1].time_s,
        start_index: 0,
        end_index: refObj.records.length - 1,
        distance_m: refObj.distance_m || 0,
        sectors: refObj.sectors || [null, null, null],
        max_speed_kmh: refObj.max_speed_kmh || 0,
        max_gps_speed_kmh: refObj.max_gps_speed_kmh || 0,
        is_flying: true,
        is_reference: true,
        is_best: true,
        is_session_best: true
      }],
      records: refObj.records
    };
    loadSessionData(wrapped);
    return;
  }

  // Ensure existing laps are marked as pre-segmented so recalculateLapsAndSectors preserves them
  if (!state.sessionData) state.sessionData = {};
  state.sessionData.pre_segmented_laps = true;
  state.sessionData.is_multi_session = true;
  state.laps = (state.laps || []).filter(l => !l.is_optimal);
  state.laps.forEach(l => {
    if (!l.session_id) l.session_id = 'S1';
    if (!l.session_color) l.session_color = '#ff1801';
  });

  const lastRec = state.records[state.records.length - 1];
  const tOffset = (lastRec ? lastRec.time_s : 0) + 1.0;
  const dOffset = (lastRec ? (lastRec.distance_m || 0) : 0) + 10.0;
  const startIdx = state.records.length;
  const t0 = refObj.records[0].time_s || 0;
  const d0 = refObj.records[0].distance_m || 0;
  const newLapNum = state.laps.reduce((m, l) => Math.max(m, l.lap_number || 0), 0) + 1;

  refObj.records.forEach((r, idx) => {
    const rc = Object.assign({}, r);
    rc.time_s = Number((tOffset + Math.max(0, (r.time_s || 0) - t0)).toFixed(3));
    rc.distance_m = Number((dOffset + Math.max(0, (r.distance_m || 0) - d0)).toFixed(2));
    rc.lap = newLapNum;
    rc.session_id = 'REF';
    rc.orig_index = startIdx + idx;
    rc.local_index = startIdx + idx;
    state.records.push(rc);
  });

  const endIdx = state.records.length - 1;
  const dur = refObj.duration_s || (state.records[endIdx].time_s - state.records[startIdx].time_s);

  state.laps.push({
    lap_number: newLapNum,
    orig_lap_number: 1,
    session_id: 'REF',
    session_label: `REF · ${refObj.name || 'Reference'}`,
    session_color: '#ffd600',
    name: `REF · ${refObj.name || 'Reference'}`,
    orig_name: refObj.name || 'Reference',
    start_time_s: state.records[startIdx].time_s,
    end_time_s: state.records[endIdx].time_s,
    duration_s: dur,
    start_index: startIdx,
    end_index: endIdx,
    distance_m: refObj.distance_m || (state.records[endIdx].distance_m - state.records[startIdx].distance_m),
    sectors: refObj.sectors || [null, null, null],
    max_speed_kmh: refObj.max_speed_kmh || 0,
    max_gps_speed_kmh: refObj.max_gps_speed_kmh || 0,
    max_lean_left_deg: refObj.max_lean_left_deg || 0,
    max_lean_right_deg: refObj.max_lean_right_deg || 0,
    max_rpm: refObj.max_rpm || 0,
    is_flying: true,
    is_out_lap: false,
    is_in_lap: false,
    is_reference: true,
    is_session_best: true,
    is_best: false
  });

  if (!Array.isArray(state.sessions)) state.sessions = [];
  if (!state.sessions.some(s => s.id === 'REF')) {
    state.sessions.push({
      id: 'REF',
      label: 'Reference Laps',
      color: '#ffd600',
      track_name: refObj.track_name || '',
      rider_name: refObj.rider_name || '',
      is_reference: true
    });
  }

  applySmoothingToRecords();
  recalculateLapsAndSectors();
  renderMapTrack(false);
  if (dom.modalProgression && dom.modalProgression.style.display === 'flex' && typeof renderDayProgressionModal === 'function') {
    renderDayProgressionModal();
  }
}

function appendSessionJsonToWorkspace(jsonObj, fileName = '') {
  if (!jsonObj || !Array.isArray(jsonObj.records) || jsonObj.records.length === 0) {
    alert('Selected JSON file contains no telemetry records.');
    return;
  }

  if (!state.records || state.records.length === 0) {
    loadSessionData(jsonObj);
    return;
  }

  if (!state.sessionData) state.sessionData = {};
  state.sessionData.pre_segmented_laps = false;
  state.sessionData.is_multi_session = true;

  // Ensure existing records and sessions are tagged with S1 if not already tagged
  state.records.forEach(r => {
    if (!r.session_id) r.session_id = 'S1';
  });
  if (!Array.isArray(state.sessions) || state.sessions.length === 0) {
    const h0 = state.sessionData.header || {};
    state.sessions = [{
      id: 'S1',
      label: `S1 · ${h0.session_datetime || 'Session 1'}`,
      color: VIEWER_SESSION_COLORS[0],
      track_name: h0.track_name || '',
      rider_name: h0.rider_name || '',
      is_reference: false
    }];
  }

  const nonRefSessions = state.sessions.filter(s => !s.is_reference);
  const nextIdx = nonRefSessions.length;
  const newSid = `S${nextIdx + 1}`;
  const newColor = VIEWER_SESSION_COLORS[nextIdx % VIEWER_SESSION_COLORS.length];
  const hNew = jsonObj.header || {};
  const newLabel = `${newSid} · ${hNew.session_datetime || fileName.replace(/\.json$/i, '') || `Session ${nextIdx + 1}`}`;

  const lastRec = state.records[state.records.length - 1];
  const tOffset = (lastRec ? lastRec.time_s : 0) + 1.0;
  const dOffset = (lastRec ? (lastRec.distance_m || 0) : 0) + 10.0;
  const startIdx = state.records.length;
  const t0 = jsonObj.records[0].time_s || 0;
  const d0 = jsonObj.records[0].distance_m || 0;

  jsonObj.records.forEach((r, idx) => {
    const rc = Object.assign({}, r);
    rc.time_s = Number((tOffset + Math.max(0, (r.time_s || 0) - t0)).toFixed(3));
    rc.distance_m = Number((dOffset + Math.max(0, (r.distance_m || 0) - d0)).toFixed(2));
    rc.session_id = newSid;
    rc.orig_index = startIdx + idx;
    rc.local_index = startIdx + idx;
    state.records.push(rc);
  });

  const endIdx = state.records.length - 1;
  state.sessions.push({
    id: newSid,
    index: nextIdx + 1,
    label: newLabel,
    color: newColor,
    track_name: hNew.track_name || '',
    rider_name: hNew.rider_name || '',
    session_datetime: hNew.session_datetime || '',
    start_index: startIdx,
    end_index: endIdx,
    is_reference: false
  });

  applySmoothingToRecords();
  recalculateLapsAndSectors();
  renderMapTrack(false);
  if (dom.modalProgression && dom.modalProgression.style.display === 'flex' && typeof renderDayProgressionModal === 'function') {
    renderDayProgressionModal();
  }
}

function loadSessionData(jsonObj) {
  state.sessionData = jsonObj;
  state.records = jsonObj.records || [];
  state.laps = jsonObj.laps || [];
  state.activeSessionFilter = 'ALL';
  state.excludedLapKeys = new Set();
  state.hideOutInLaps = false;

  const h = jsonObj.header || {};
  if (Array.isArray(jsonObj.sessions) && jsonObj.sessions.length > 0) {
    state.sessions = jsonObj.sessions;
  } else {
    state.sessions = [{
      id: 'S1',
      label: `S1 · ${h.session_datetime || 'Session 1'}`,
      color: VIEWER_SESSION_COLORS[0],
      track_name: h.track_name || '',
      rider_name: h.rider_name || '',
      session_datetime: h.session_datetime || '',
      is_reference: false
    }];
  }

  // Merge any reference_laps embedded from dda_settings.json into state.referenceLaps
  if (jsonObj.settings && Array.isArray(jsonObj.settings.reference_laps)) {
    if (!Array.isArray(state.referenceLaps)) state.referenceLaps = [];
    const existingIds = new Set(state.referenceLaps.map(r => r.id));
    jsonObj.settings.reference_laps.forEach(ref => {
      if (ref && ref.id && !existingIds.has(ref.id)) {
        state.referenceLaps.push(ref);
        existingIds.add(ref.id);
      }
    });
  }

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

  const s = jsonObj.stats || {};
  if (!matched && dom.metaTrackName) {
    dom.metaTrackName.textContent = h.track_name || 'Ducati Telemetry Track';
  }
  if (dom.metaRiderName) dom.metaRiderName.textContent = h.rider_name || 'Ducati Rider';
  const metaBikeEl = document.getElementById('meta-bike-model');
  if (metaBikeEl) {
    if (h.bike_model) {
      metaBikeEl.textContent = `🏍️ ${h.bike_model}`;
      metaBikeEl.style.display = '';
    } else {
      metaBikeEl.style.display = 'none';
    }
  }
  const metaDateEl = document.getElementById('meta-session-date');
  if (metaDateEl) {
    if (h.session_datetime) {
      metaDateEl.textContent = `📅 ${h.session_datetime}`;
      metaDateEl.style.display = '';
    } else {
      metaDateEl.style.display = 'none';
    }
  }
  if (!localStorage.getItem('dda_settings')) {
    if (h.rider_name) state.motogp.riderName = h.rider_name.toUpperCase();
    if (h.bike_model) state.motogp.bikeName = h.bike_model;
    syncMotoGPConfigToUI();
  }
  if (dom.metaDuration) {
    const lapCnt = (state.laps || []).filter(l => !l.is_optimal).length;
    dom.metaDuration.textContent = `🏁 ${lapCnt} ${lapCnt === 1 ? 'Lap' : 'Laps'}`;
  }
  if (dom.settingsSessionDuration) dom.settingsSessionDuration.textContent = `${(s.duration_min || 0).toFixed(1)} min`;
  if (dom.settingsSessionFrames) dom.settingsSessionFrames.textContent = state.records.length.toLocaleString();
  const totalDistKm = (state.records[state.records.length - 1]?.distance_m || 0) / 1000.0;
  if (dom.settingsSessionDist) dom.settingsSessionDist.textContent = `${totalDistKm.toFixed(2)} km`;
  const odoKm = s.odometer_end_km || h.header_odometer_km || 0;
  if (dom.settingsSessionOdo) dom.settingsSessionOdo.textContent = odoKm > 0 ? `${Math.round(odoKm).toLocaleString()} km` : '-- km';

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

function parseUploadedFile(file, appendMode = false) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      if (file.name.endsWith('.json')) {
        const json = JSON.parse(e.target.result);
        if (json.format === 'dda_reference_lap_v1' || (json.records && json.duration_s && !json.header)) {
          appendReferenceLapToSession(json);
        } else if (appendMode && state.records && state.records.length > 0) {
          appendSessionJsonToWorkspace(json, file.name);
        } else {
          loadSessionData(json);
        }
      } else {
        alert('Please select an exported .json session file or .ddalap.json Reference Lap file.');
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

  if (dom.btnToggleApexMarkers) {
    dom.btnToggleApexMarkers.addEventListener('click', () => {
      state.showApexMarkers = !state.showApexMarkers;
      if (dom.lblMenuApexes) dom.lblMenuApexes.textContent = state.showApexMarkers ? 'Turn Apex Markers: ON' : 'Turn Apex Markers: OFF';
      if (dom.prefShowApexMarkers) dom.prefShowApexMarkers.checked = state.showApexMarkers;
      saveSettingsToStorage();
      if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
    });
  }

  function toggleChartTurnMarkers() {
    state.showChartTurnMarkers = !state.showChartTurnMarkers;
    if (dom.lblMenuChartTurns) dom.lblMenuChartTurns.textContent = state.showChartTurnMarkers ? 'Chart Turn Markers: ON' : 'Chart Turn Markers: OFF';
    if (dom.btnChartTurnsToggle) {
      dom.btnChartTurnsToggle.classList.toggle('active', state.showChartTurnMarkers);
      dom.btnChartTurnsToggle.textContent = state.showChartTurnMarkers ? '📍 Turns: ON' : '📍 Turns: OFF';
    }
    if (dom.prefShowChartTurns) dom.prefShowChartTurns.checked = state.showChartTurnMarkers;
    saveSettingsToStorage();
    if (typeof renderCharts === 'function') renderCharts();
  }

  if (dom.btnToggleChartTurns) {
    dom.btnToggleChartTurns.addEventListener('click', toggleChartTurnMarkers);
  }

  if (dom.btnChartTurnsToggle) {
    dom.btnChartTurnsToggle.addEventListener('click', toggleChartTurnMarkers);
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
  if (dom.btnCopyScorecard) {
    dom.btnCopyScorecard.addEventListener('click', () => {
      const lapNum = dom.selectScorecardLap ? parseInt(dom.selectScorecardLap.value, 10) : -1;
      if (typeof generateScorecardSummaryText === 'function') {
        const text = generateScorecardSummaryText(lapNum);
        navigator.clipboard.writeText(text).then(() => {
          const orig = dom.btnCopyScorecard.textContent;
          dom.btnCopyScorecard.textContent = '✅ Copied!';
          setTimeout(() => { dom.btnCopyScorecard.textContent = orig; }, 2000);
        }).catch(err => {
          console.error('Clipboard copy failed:', err);
          alert('Failed to copy to clipboard.');
        });
      }
    });
  }
  if (dom.btnExportScorecardCsv) {
    dom.btnExportScorecardCsv.addEventListener('click', () => {
      const lapNum = dom.selectScorecardLap ? parseInt(dom.selectScorecardLap.value, 10) : -1;
      if (typeof generateScorecardCsv === 'function') {
        const csv = generateScorecardCsv(lapNum);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const trackSlug = (dom.metaTrackName ? dom.metaTrackName.textContent.trim() : 'track').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        a.href = url;
        a.download = `dda_scorecard_${trackSlug}_${lapNum === -1 ? 'all_laps' : 'lap_' + lapNum}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    });
  }

  // Day Progression & Multi-Session Analytics Modal
  function openProgressionModal() {
    if (dom.modalProgression) {
      dom.modalProgression.style.display = 'flex';
      if (typeof renderDayProgressionModal === 'function') renderDayProgressionModal();
    }
  }
  if (dom.btnOpenProgression) {
    dom.btnOpenProgression.addEventListener('click', openProgressionModal);
  }
  if (dom.btnCardProgression) {
    dom.btnCardProgression.addEventListener('click', openProgressionModal);
  }
  if (dom.btnCloseProgression) {
    dom.btnCloseProgression.addEventListener('click', () => {
      if (dom.modalProgression) dom.modalProgression.style.display = 'none';
    });
  }
  document.querySelectorAll('.btn-prog-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-prog-mode').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.progressionChartMode = btn.dataset.pmode || 'laptimes';
      if (typeof renderDayProgressionModal === 'function') renderDayProgressionModal();
    });
  });
  if (dom.progressionCanvas) {
    dom.progressionCanvas.addEventListener('mousemove', (e) => {
      const pts = state.progressionHitPoints || [];
      if (pts.length === 0) return;
      const rect = dom.progressionCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let hit = null;
      let minDist = 18;
      pts.forEach(p => {
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < minDist) {
          minDist = d;
          hit = p;
        }
      });
      if (hit) {
        dom.progressionCanvas.style.cursor = 'pointer';
        if (dom.lblProgChartHint) {
          dom.lblProgChartHint.textContent = `${hit.lap.name}: ${formatTime(hit.lap.duration_s)} (Click to jump, Shift+Click to compare)`;
          dom.lblProgChartHint.style.color = '#00e5ff';
        }
      } else {
        dom.progressionCanvas.style.cursor = 'default';
        if (dom.lblProgChartHint) {
          dom.lblProgChartHint.textContent = 'Click any lap point to jump to that lap · Shift+Click to compare against Best Lap';
          dom.lblProgChartHint.style.color = '';
        }
      }
    });
    dom.progressionCanvas.addEventListener('click', (e) => {
      const pts = state.progressionHitPoints || [];
      if (pts.length === 0) return;
      const rect = dom.progressionCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let hit = null;
      let minDist = 18;
      pts.forEach(p => {
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < minDist) {
          minDist = d;
          hit = p;
        }
      });
      if (hit && hit.lap) {
        if (dom.modalProgression) dom.modalProgression.style.display = 'none';
        if (e.shiftKey) {
          const bestLap = state.laps.find(l => l.is_best) || state.laps[0];
          state.compareMode = true;
          if (dom.btnToggleCompare) dom.btnToggleCompare.classList.add('active');
          if (dom.compareBanner) dom.compareBanner.style.display = 'flex';
          state.compareLaps = [bestLap ? bestLap.lap_number : hit.lap.lap_number, hit.lap.lap_number];
          selectLap(hit.lap.lap_number, true);
        } else {
          selectLap(hit.lap.lap_number, false);
        }
      }
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
      
      // Default to Seam Bar tab if active or first open
      if (state.seamBar.activeTab === 'seambar') {
        if (dom.tabExportSeambar) dom.tabExportSeambar.classList.add('active');
        if (dom.tabExportMotogp) dom.tabExportMotogp.classList.remove('active');
        if (dom.exportPaneSeambar) dom.exportPaneSeambar.style.display = 'block';
        if (dom.exportPaneMotogp) dom.exportPaneMotogp.style.display = 'none';
        setTimeout(() => {
          if (typeof renderSeamBarStaticPreview === 'function') renderSeamBarStaticPreview();
        }, 120);
      } else {
        if (dom.tabExportMotogp) dom.tabExportMotogp.classList.add('active');
        if (dom.tabExportSeambar) dom.tabExportSeambar.classList.remove('active');
        if (dom.exportPaneMotogp) dom.exportPaneMotogp.style.display = 'block';
        if (dom.exportPaneSeambar) dom.exportPaneSeambar.style.display = 'none';
        setTimeout(() => playIntroPreviewAnimation(), 120);
      }
    });
  }
  if (dom.btnCloseVideoModal) {
    dom.btnCloseVideoModal.addEventListener('click', () => {
      if (dom.modalVideoExport) dom.modalVideoExport.style.display = 'none';
    });
  }

  // Export Tab Switcher
  if (dom.tabExportSeambar) {
    dom.tabExportSeambar.addEventListener('click', () => {
      state.seamBar.activeTab = 'seambar';
      dom.tabExportSeambar.classList.add('active');
      if (dom.tabExportMotogp) dom.tabExportMotogp.classList.remove('active');
      if (dom.exportPaneSeambar) dom.exportPaneSeambar.style.display = 'block';
      if (dom.exportPaneMotogp) dom.exportPaneMotogp.style.display = 'none';
      if (typeof renderSeamBarStaticPreview === 'function') renderSeamBarStaticPreview();
    });
  }

  if (dom.tabExportMotogp) {
    dom.tabExportMotogp.addEventListener('click', () => {
      state.seamBar.activeTab = 'motogp';
      dom.tabExportMotogp.classList.add('active');
      if (dom.tabExportSeambar) dom.tabExportSeambar.classList.remove('active');
      if (dom.exportPaneMotogp) dom.exportPaneMotogp.style.display = 'block';
      if (dom.exportPaneSeambar) dom.exportPaneSeambar.style.display = 'none';
      if (typeof playIntroPreviewAnimation === 'function') playIntroPreviewAnimation();
    });
  }

  // Seam Bar Controls
  if (dom.inputSeamWidth && dom.valSeamWidth) {
    dom.inputSeamWidth.addEventListener('input', (e) => {
      const w = parseInt(e.target.value, 10) || 190;
      dom.valSeamWidth.textContent = `${w}px`;
      state.seamBar.width = w;
      if (typeof renderSeamBarStaticPreview === 'function') renderSeamBarStaticPreview();
    });
  }

  if (dom.inputSeamOpacity && dom.valSeamOpacity) {
    dom.inputSeamOpacity.addEventListener('input', (e) => {
      const op = parseInt(e.target.value, 10) || 68;
      dom.valSeamOpacity.textContent = `${op}%`;
      state.seamBar.glassOpacity = op / 100;
      if (typeof renderSeamBarStaticPreview === 'function') renderSeamBarStaticPreview();
    });
  }

  if (dom.inputDotColor) {
    dom.inputDotColor.addEventListener('input', (e) => {
      state.seamBar.dotColor = e.target.value;
      if (typeof renderSeamBarStaticPreview === 'function') renderSeamBarStaticPreview();
    });
  }

  document.querySelectorAll('.palette-presets .color-dot[data-dot]').forEach(dot => {
    dot.addEventListener('click', () => {
      const c = dot.getAttribute('data-dot');
      if (dom.inputDotColor) dom.inputDotColor.value = c;
      state.seamBar.dotColor = c;
      if (typeof renderSeamBarStaticPreview === 'function') renderSeamBarStaticPreview();
    });
  });

  // Module Toggles
  [
    dom.chkModRider, dom.chkModTiming, dom.chkModMap,
    dom.chkModTurn, dom.chkModGmeter, dom.chkModLean, dom.chkModPedals
  ].forEach(chk => {
    if (chk) {
      chk.addEventListener('change', () => {
        if (typeof renderSeamBarStaticPreview === 'function') renderSeamBarStaticPreview();
      });
    }
  });

  // Timeframe Mode Switcher
  if (dom.selectSeamTimeframe) {
    dom.selectSeamTimeframe.addEventListener('change', (e) => {
      const mode = e.target.value;
      state.seamBar.timeframeMode = mode;
      if (dom.rowSeamLapSelect) dom.rowSeamLapSelect.style.display = mode === 'lap' ? 'flex' : 'none';
      if (dom.rowSeamCustomTime) dom.rowSeamCustomTime.style.display = mode === 'custom' ? 'flex' : 'none';
    });
  }

  if (dom.btnSeamCurrentRange) {
    dom.btnSeamCurrentRange.addEventListener('click', () => {
      const recs = (state.activeRecords && state.activeRecords.length > 0) ? state.activeRecords : state.records;
      if (recs && recs.length > 0) {
        if (dom.inputSeamStart) dom.inputSeamStart.value = Math.floor(recs[0].time_s);
        if (dom.inputSeamEnd) dom.inputSeamEnd.value = Math.ceil(recs[recs.length - 1].time_s);
      }
    });
  }

  if (dom.btnPreviewSeamIntro) {
    dom.btnPreviewSeamIntro.addEventListener('click', () => {
      if (typeof playSeamBarPreviewAnimation === 'function') playSeamBarPreviewAnimation('intro');
    });
  }

  if (dom.btnPreviewSeamLive) {
    dom.btnPreviewSeamLive.addEventListener('click', () => {
      if (typeof playSeamBarPreviewAnimation === 'function') playSeamBarPreviewAnimation('live');
    });
  }

  if (dom.btnRenderSeamVideo) {
    dom.btnRenderSeamVideo.addEventListener('click', () => {
      if (typeof exportSeamBarVideo === 'function') exportSeamBarVideo();
    });
  }

  // MotoGP Customizer Inputs
  if (dom.inputRiderName) {
    dom.inputRiderName.addEventListener('input', (e) => {
      state.motogp.riderName = e.target.value.toUpperCase();
      syncMotoGPConfigToUI();
      saveSettingsToStorage();
      if (typeof renderSeamBarStaticPreview === 'function') renderSeamBarStaticPreview();
    });
  }
  if (dom.inputBikeName) {
    dom.inputBikeName.addEventListener('input', (e) => {
      state.motogp.bikeName = e.target.value;
      syncMotoGPConfigToUI();
      saveSettingsToStorage();
      if (typeof renderSeamBarStaticPreview === 'function') renderSeamBarStaticPreview();
    });
  }
  if (dom.inputRiderNum) {
    dom.inputRiderNum.addEventListener('input', (e) => {
      state.motogp.riderNum = e.target.value;
      syncMotoGPConfigToUI();
      saveSettingsToStorage();
      if (typeof renderSeamBarStaticPreview === 'function') renderSeamBarStaticPreview();
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
      if (typeof renderSeamBarStaticPreview === 'function') renderSeamBarStaticPreview();
    });
  }

  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      state.motogp.badgeColor = dot.dataset.c;
      if (dom.inputNumberColor) dom.inputNumberColor.value = dot.dataset.c;
      syncMotoGPConfigToUI();
      saveSettingsToStorage();
      playIntroPreviewAnimation();
      if (typeof renderSeamBarStaticPreview === 'function') renderSeamBarStaticPreview();
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

  // Channel Toggle Buttons & Lane Assignment Pickers
  document.querySelectorAll('.channel-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ch = btn.dataset.channel;
      if (ch && state.channels[ch] !== undefined) {
        state.channels[ch] = !state.channels[ch];
        btn.classList.toggle('active', state.channels[ch]);
        btn.classList.toggle('channel-off', !state.channels[ch]);
        if (typeof updateChannelsStripeUI === 'function') updateChannelsStripeUI();
        saveSettingsToStorage();
        renderCharts();
      }
    });
  });

  document.querySelectorAll('.channel-lane-picker .btn-lane-pick').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const picker = btn.closest('.channel-lane-picker');
      const ch = picker ? picker.dataset.channel : null;
      const lane = parseInt(btn.dataset.lane, 10);
      if (!ch || isNaN(lane)) return;

      if (!state.channelLanes) state.channelLanes = {};
      state.channelLanes[ch] = lane;

      picker.querySelectorAll('.btn-lane-pick').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.lane, 10) === lane);
      });

      // Automatically enable channel if user selects a lane for a disabled channel
      if (!state.channels[ch]) {
        state.channels[ch] = true;
        const chBtn = document.querySelector(`.channel-toggle-btn[data-channel="${ch}"]`);
        if (chBtn) {
          chBtn.classList.add('active');
          chBtn.classList.remove('channel-off');
        }
      }

      if (typeof updateChannelsStripeUI === 'function') updateChannelsStripeUI();
      saveSettingsToStorage();
      renderCharts();
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
        if (dom.btnAddTurn) dom.btnAddTurn.classList.remove('active');
        if (dom.gateToastMsg) dom.gateToastMsg.textContent = 'Click on track map to add a Sector Split Gate...';
        if (dom.gateInstructionToast) dom.gateInstructionToast.style.display = 'flex';
        const m = document.getElementById('map-container');
        if (m) m.style.cursor = 'crosshair';
      }
    });
  }

  if (dom.btnAddTurn) {
    dom.btnAddTurn.addEventListener('click', () => {
      if (state.turnEditMode) {
        if (typeof cancelTurnEdit === 'function') cancelTurnEdit();
      } else {
        if (typeof enterTurnEditMode === 'function') enterTurnEditMode();
      }
    });
  }

  if (dom.btnMenuAddTurn) {
    dom.btnMenuAddTurn.addEventListener('click', () => {
      if (typeof enterTurnEditMode === 'function') enterTurnEditMode();
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
  function toggleExtremaMarkers() {
    state.showSpeedExtrema = !(state.showSpeedExtrema !== false);
    if (dom.prefShowExtrema) dom.prefShowExtrema.checked = state.showSpeedExtrema;
    if (dom.btnToggleExtrema) {
      dom.btnToggleExtrema.classList.toggle('active', state.showSpeedExtrema);
      dom.btnToggleExtrema.textContent = state.showSpeedExtrema ? '⚡ Speeds: ON' : '⚡ Speeds: OFF';
    }
    if (dom.btnMenuToggleExtrema) {
      dom.btnMenuToggleExtrema.classList.toggle('active', state.showSpeedExtrema);
    }
    if (dom.lblMenuExtrema) {
      dom.lblMenuExtrema.textContent = state.showSpeedExtrema ? 'Speed Markers: ON' : 'Speed Markers: OFF';
    }
    saveSettingsToStorage();
    if (typeof renderSpeedExtremaMarkers === 'function') renderSpeedExtremaMarkers();
  }

  if (dom.btnToggleExtrema) dom.btnToggleExtrema.addEventListener('click', toggleExtremaMarkers);
  if (dom.btnMenuToggleExtrema) dom.btnMenuToggleExtrema.addEventListener('click', toggleExtremaMarkers);

  // Map Options dropdown items for Layer and Smoothing
  document.querySelectorAll('.btn-layer-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const layer = btn.dataset.layer;
      if (layer && dom.selectMapLayer) {
        dom.selectMapLayer.value = layer;
        dom.selectMapLayer.dispatchEvent(new Event('change'));
        document.querySelectorAll('.btn-layer-opt').forEach(b => b.classList.toggle('active', b.dataset.layer === layer));
      }
    });
  });

  document.querySelectorAll('.btn-smooth-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const smooth = btn.dataset.smooth;
      if (smooth && dom.selectSmoothing) {
        dom.selectSmoothing.value = smooth;
        dom.selectSmoothing.dispatchEvent(new Event('change'));
        document.querySelectorAll('.btn-smooth-opt').forEach(b => b.classList.toggle('active', b.dataset.smooth === smooth));
      }
    });
  });

  if (dom.prefShowExtrema) {
    dom.prefShowExtrema.addEventListener('change', (e) => {
      state.showSpeedExtrema = e.target.checked;
      if (dom.btnToggleExtrema) {
        dom.btnToggleExtrema.classList.toggle('active', state.showSpeedExtrema);
        dom.btnToggleExtrema.textContent = state.showSpeedExtrema ? '⚡ Speeds: ON' : '⚡ Speeds: OFF';
      }
      if (dom.btnMenuToggleExtrema) {
        dom.btnMenuToggleExtrema.classList.toggle('active', state.showSpeedExtrema);
      }
      if (dom.lblMenuExtrema) {
        dom.lblMenuExtrema.textContent = state.showSpeedExtrema ? 'Speed Markers: ON' : 'Speed Markers: OFF';
      }
      saveSettingsToStorage();
      renderSpeedExtremaMarkers();
    });
  }
  if (dom.prefShowApexMarkers) {
    dom.prefShowApexMarkers.addEventListener('change', (e) => {
      state.showApexMarkers = e.target.checked;
      if (dom.lblMenuApexes) dom.lblMenuApexes.textContent = state.showApexMarkers ? 'Turn Apex Markers: ON' : 'Turn Apex Markers: OFF';
      saveSettingsToStorage();
      if (typeof renderTurnApexMarkers === 'function') renderTurnApexMarkers();
    });
  }
  if (dom.prefShowChartTurns) {
    dom.prefShowChartTurns.addEventListener('change', (e) => {
      state.showChartTurnMarkers = e.target.checked;
      if (dom.lblMenuChartTurns) dom.lblMenuChartTurns.textContent = state.showChartTurnMarkers ? 'Chart Turn Markers: ON' : 'Chart Turn Markers: OFF';
      if (dom.btnChartTurnsToggle) {
        dom.btnChartTurnsToggle.classList.toggle('active', state.showChartTurnMarkers);
        dom.btnChartTurnsToggle.textContent = state.showChartTurnMarkers ? '📍 Turns: ON' : '📍 Turns: OFF';
      }
      saveSettingsToStorage();
      if (typeof renderCharts === 'function') renderCharts();
    });
  }

  function setRedlineRpm(rpm) {
    const parsed = parseInt(rpm, 10);
    if (isNaN(parsed)) return;
    state.redlineRpm = Math.max(5000, Math.min(18000, parsed));
    state.shiftLightStartRpm = Math.round(state.redlineRpm * 0.80);
    state.shiftLightEndRpm = state.redlineRpm;

    if (dom.lblTachRedline) dom.lblTachRedline.textContent = state.redlineRpm.toLocaleString();
    if (dom.prefRedlineSlider) dom.prefRedlineSlider.value = state.redlineRpm;
    if (dom.prefRedlineInput) dom.prefRedlineInput.value = state.redlineRpm;
    if (dom.dataMenuRedlineSlider) dom.dataMenuRedlineSlider.value = state.redlineRpm;
    if (dom.dataMenuRedlineInput) dom.dataMenuRedlineInput.value = state.redlineRpm;

    if (dom.prefShiftStartSlider) dom.prefShiftStartSlider.value = state.shiftLightStartRpm;
    if (dom.prefShiftStartInput) dom.prefShiftStartInput.value = state.shiftLightStartRpm;
    if (dom.dataMenuShiftStartSlider) dom.dataMenuShiftStartSlider.value = state.shiftLightStartRpm;
    if (dom.dataMenuShiftStartInput) dom.dataMenuShiftStartInput.value = state.shiftLightStartRpm;

    if (dom.prefShiftEndSlider) dom.prefShiftEndSlider.value = state.shiftLightEndRpm;
    if (dom.prefShiftEndInput) dom.prefShiftEndInput.value = state.shiftLightEndRpm;
    if (dom.dataMenuShiftEndSlider) dom.dataMenuShiftEndSlider.value = state.shiftLightEndRpm;
    if (dom.dataMenuShiftEndInput) dom.dataMenuShiftEndInput.value = state.shiftLightEndRpm;

    if (typeof updateTachScale === 'function') updateTachScale(state.redlineRpm);
    if (typeof updateShiftLightBandsUI === 'function') updateShiftLightBandsUI();
    saveSettingsToStorage();
    if (state.records && state.records.length > 0) {
      updateUI();
    }
  }

  function setShiftLightStartRpm(rpm) {
    const parsed = parseInt(rpm, 10);
    if (isNaN(parsed)) return;
    state.shiftLightStartRpm = Math.max(3000, Math.min(state.shiftLightEndRpm || state.redlineRpm || 12000, parsed));
    if (dom.prefShiftStartSlider) dom.prefShiftStartSlider.value = state.shiftLightStartRpm;
    if (dom.prefShiftStartInput) dom.prefShiftStartInput.value = state.shiftLightStartRpm;
    if (dom.dataMenuShiftStartSlider) dom.dataMenuShiftStartSlider.value = state.shiftLightStartRpm;
    if (dom.dataMenuShiftStartInput) dom.dataMenuShiftStartInput.value = state.shiftLightStartRpm;
    if (typeof updateShiftLightBandsUI === 'function') updateShiftLightBandsUI();
    saveSettingsToStorage();
    if (state.records && state.records.length > 0) {
      updateUI();
    }
  }

  function setShiftLightEndRpm(rpm) {
    const parsed = parseInt(rpm, 10);
    if (isNaN(parsed)) return;
    state.shiftLightEndRpm = Math.max(state.shiftLightStartRpm || 8000, Math.min(18000, parsed));
    if (dom.prefShiftEndSlider) dom.prefShiftEndSlider.value = state.shiftLightEndRpm;
    if (dom.prefShiftEndInput) dom.prefShiftEndInput.value = state.shiftLightEndRpm;
    if (dom.dataMenuShiftEndSlider) dom.dataMenuShiftEndSlider.value = state.shiftLightEndRpm;
    if (dom.dataMenuShiftEndInput) dom.dataMenuShiftEndInput.value = state.shiftLightEndRpm;
    if (typeof updateShiftLightBandsUI === 'function') updateShiftLightBandsUI();
    saveSettingsToStorage();
    if (state.records && state.records.length > 0) {
      updateUI();
    }
  }

  if (dom.btnQuickRedline) {
    dom.btnQuickRedline.addEventListener('click', (e) => {
      e.stopPropagation();
      const wrap = document.getElementById('dropdown-cards-wrap');
      if (wrap) {
        document.querySelectorAll('.dropdown-wrapper').forEach(w => w.classList.remove('open'));
        wrap.classList.add('open');
        if (dom.dataMenuRedlineInput) {
          dom.dataMenuRedlineInput.focus();
          dom.dataMenuRedlineInput.select();
        }
      }
    });
  }

  // Prevent dropdown closing when interacting with DATA section settings sliders/inputs
  const dataMenuRedlineWrap = document.getElementById('data-menu-redline-wrap');
  if (dataMenuRedlineWrap) {
    dataMenuRedlineWrap.addEventListener('click', (e) => e.stopPropagation());
    dataMenuRedlineWrap.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  if (dom.prefRedlineSlider) {
    dom.prefRedlineSlider.addEventListener('input', (e) => setRedlineRpm(e.target.value));
  }
  if (dom.prefRedlineInput) {
    dom.prefRedlineInput.addEventListener('input', (e) => setRedlineRpm(e.target.value));
  }
  if (dom.dataMenuRedlineSlider) {
    dom.dataMenuRedlineSlider.addEventListener('input', (e) => setRedlineRpm(e.target.value));
  }
  if (dom.dataMenuRedlineInput) {
    dom.dataMenuRedlineInput.addEventListener('input', (e) => setRedlineRpm(e.target.value));
  }

  if (dom.prefShiftStartSlider) {
    dom.prefShiftStartSlider.addEventListener('input', (e) => setShiftLightStartRpm(e.target.value));
  }
  if (dom.prefShiftStartInput) {
    dom.prefShiftStartInput.addEventListener('input', (e) => setShiftLightStartRpm(e.target.value));
  }
  if (dom.dataMenuShiftStartSlider) {
    dom.dataMenuShiftStartSlider.addEventListener('input', (e) => setShiftLightStartRpm(e.target.value));
  }
  if (dom.dataMenuShiftStartInput) {
    dom.dataMenuShiftStartInput.addEventListener('input', (e) => setShiftLightStartRpm(e.target.value));
  }

  if (dom.prefShiftEndSlider) {
    dom.prefShiftEndSlider.addEventListener('input', (e) => setShiftLightEndRpm(e.target.value));
  }
  if (dom.prefShiftEndInput) {
    dom.prefShiftEndInput.addEventListener('input', (e) => setShiftLightEndRpm(e.target.value));
  }
  if (dom.dataMenuShiftEndSlider) {
    dom.dataMenuShiftEndSlider.addEventListener('input', (e) => setShiftLightEndRpm(e.target.value));
  }
  if (dom.dataMenuShiftEndInput) {
    dom.dataMenuShiftEndInput.addEventListener('input', (e) => setShiftLightEndRpm(e.target.value));
  }

  document.querySelectorAll('.btn-redline-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rpm = btn.dataset.rpm;
      if (rpm) setRedlineRpm(rpm);
    });
  });

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
        parseUploadedFile(e.target.files[0], false);
      }
      e.target.value = '';
    });
  }

  // Add Session / Reference Lap Merge Upload
  const triggerAddSessionUpload = () => {
    if (dom.addSessionFileInput) dom.addSessionFileInput.click();
  };
  if (dom.btnAddSessionFile) dom.btnAddSessionFile.addEventListener('click', triggerAddSessionUpload);
  if (dom.btnCardAddRef) dom.btnCardAddRef.addEventListener('click', triggerAddSessionUpload);
  if (dom.btnProgAddSession) dom.btnProgAddSession.addEventListener('click', triggerAddSessionUpload);
  if (dom.addSessionFileInput) {
    dom.addSessionFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        Array.from(e.target.files).forEach(file => parseUploadedFile(file, true));
      }
      e.target.value = '';
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
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        files.forEach((f, idx) => {
          const isRef = f.name.toLowerCase().endsWith('.ddalap.json');
          const shouldAppend = isRef || idx > 0 || e.shiftKey;
          parseUploadedFile(f, shouldAppend);
        });
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
  if (dom.btnClearSectionCharts) {
    dom.btnClearSectionCharts.addEventListener('click', () => {
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

  // Layout Toggle & Uniform Panel Minimize / Maximize / Top-Bar Switcher Controls
  if (dom.btnToggleLayout) {
    dom.btnToggleLayout.addEventListener('click', () => {
      if (typeof toggleWorkspaceLayout === 'function') toggleWorkspaceLayout();
    });
  }

  // Top-Header Workspace Panel Switcher Pills
  [
    { el: dom.btnPanelToggleMap, id: 'map' },
    { el: dom.btnPanelToggleVideo, id: 'video' },
    { el: dom.btnPanelToggleCharts, id: 'charts' },
    { el: dom.btnPanelToggleData, id: 'data' }
  ].forEach(({ el, id }) => {
    if (el) {
      el.addEventListener('click', () => togglePanelVisibility(id));
    }
  });

  // Uniform Panel Minimize Buttons (—)
  [
    { el: dom.btnMinimizeMap, id: 'map' },
    { el: dom.btnMinimizeVideo, id: 'video' },
    { el: dom.btnMinimizeCharts, id: 'charts' },
    { el: dom.btnMinimizeData, id: 'data' }
  ].forEach(({ el, id }) => {
    if (el) {
      el.addEventListener('click', () => togglePanelVisibility(id, false));
    }
  });

  // Uniform Panel Maximize Buttons (⤢)
  [
    { el: dom.btnMaximizeMap, id: 'map' },
    { el: dom.btnMaximizeVideo, id: 'video' },
    { el: dom.btnMaximizeCharts, id: 'charts' },
    { el: dom.btnMaximizeData, id: 'data' }
  ].forEach(({ el, id }) => {
    if (el) {
      el.addEventListener('click', () => maximizePanel(id));
    }
  });

  // Video PIP Toggle Button on Video Header
  if (dom.btnVideoPipToggle) {
    dom.btnVideoPipToggle.addEventListener('click', () => {
      const nextPip = !(state.video && state.video.viewMode === 'pip');
      if (state.video) state.video.viewMode = nextPip ? 'pip' : 'split';
      state.layout.videoCollapsed = false;
      syncWorkspacePanelsUI();
      setTimeout(() => triggerLayoutResize(), 50);
    });
  }

  if (dom.btnCollapseSidebar) {
    dom.btnCollapseSidebar.addEventListener('click', () => toggleSidebarCollapse());
  }

  if (dom.btnCollapseCharts) {
    dom.btnCollapseCharts.addEventListener('click', () => toggleChartsCollapse());
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
    } else if (e.code === 'KeyT' && e.altKey) {
      e.preventDefault();
      toggleChartTurnMarkers();
    } else if (e.code === 'KeyT') {
      if (dom.modalScorecard) {
        const isVis = dom.modalScorecard.style.display === 'flex';
        dom.modalScorecard.style.display = isVis ? 'none' : 'flex';
        if (!isVis) {
          const lapNum = dom.selectScorecardLap ? parseInt(dom.selectScorecardLap.value, 10) : -1;
          if (typeof renderScorecardTable === 'function') renderScorecardTable(lapNum);
        }
      }
    } else if (e.code === 'KeyP') {
      if (dom.modalProgression) {
        const isVis = dom.modalProgression.style.display === 'flex';
        dom.modalProgression.style.display = isVis ? 'none' : 'flex';
        if (!isVis && typeof renderDayProgressionModal === 'function') {
          renderDayProgressionModal();
        }
      }
    } else if (e.code === 'KeyA') {
      if (dom.btnToggleApexMarkers) dom.btnToggleApexMarkers.click();
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
      if (dom.modalProgression) dom.modalProgression.style.display = 'none';
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
      if (state.turnEditMode && typeof cancelTurnEdit === 'function') {
        cancelTurnEdit();
      }
    }
  });
}
