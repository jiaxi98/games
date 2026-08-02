function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function createHUDTemplate(campaign) {
  const allied = escapeHTML(campaign.battleLabels?.allied ?? 'Vanguard');
  const enemy = escapeHTML(campaign.battleLabels?.enemy ?? 'Enemy Host');
  return `
    <div class="as-hud-layer" data-ref="hud-layer">
      <section class="as-objective" data-ref="objective" aria-live="polite">
        <div class="as-objective-kicker" data-ref="objective-kicker">Current objective</div>
        <div class="as-objective-title" data-ref="objective-title">Awaiting orders</div>
        <div class="as-objective-detail" data-ref="objective-detail"></div>
        <div class="as-objective-progress" data-ref="objective-progress">
          <i></i>
        </div>
      </section>

      <section class="as-battle as-sans" aria-label="Battle cohesion">
        <div class="as-battle-phase" data-ref="battle-phase">Vanguard scattered</div>
        <div class="as-battle-row" data-ref="allied-row" data-side="allied">
          <span>${allied}</span><strong data-ref="allied-state">Scattered</strong>
        </div>
        <div class="as-battle-row" data-ref="enemy-row" data-side="enemy">
          <span>${enemy}</span><strong data-ref="enemy-state">Ordered</strong>
        </div>
      </section>

      <section class="as-encounter as-sans" data-ref="encounter" data-visible="false">
        <div class="as-encounter-copy">
          <span class="as-encounter-kicker">Enemy captain</span>
          <strong data-ref="encounter-name">Captain of Saint-Orens</strong>
          <span data-ref="encounter-phase">Commanding</span>
        </div>
        <span class="as-encounter-track"><i data-ref="encounter-fill"></i></span>
      </section>

      <div class="as-reticle" data-ref="reticle" aria-hidden="true"></div>
      <div class="as-hit-marker" data-ref="hit-marker" aria-hidden="true"></div>
      <div class="as-damage-direction" data-ref="damage-direction" aria-hidden="true"></div>
      <div class="as-interaction as-sans" data-ref="interaction" aria-live="polite">
        <span class="as-key" data-ref="interaction-key">E</span>
        <span data-ref="interaction-label">Interact</span>
      </div>

      <section class="as-bars as-sans" aria-label="Player condition">
        <div class="as-bar-row">
          <span class="as-bar-label">Health</span>
          <span class="as-bar-track"><i class="as-bar-fill as-health-fill" data-ref="health-fill"></i></span>
        </div>
        <div class="as-bar-row">
          <span class="as-bar-label">Stamina</span>
          <span class="as-bar-track"><i class="as-bar-fill as-stamina-fill" data-ref="stamina-fill"></i></span>
        </div>
      </section>

      <section class="as-context as-sans">
        <div class="as-command-strip" data-ref="command-strip" aria-label="Retinue commands"></div>
        <div class="as-tutorial" data-ref="tutorial" aria-live="polite"></div>
      </section>

      <section class="as-announcement" data-ref="announcement" aria-live="assertive">
        <div class="as-announcement-title" data-ref="announcement-title"></div>
        <div class="as-announcement-detail" data-ref="announcement-detail"></div>
      </section>

      <section class="as-subtitle" data-ref="subtitle" aria-live="polite">
        <span class="as-subtitle-speaker" data-ref="subtitle-speaker"></span>
        <span class="as-subtitle-text" data-ref="subtitle-text"></span>
      </section>

      <div class="as-kill-feed" data-ref="kill-feed" aria-live="polite"></div>
    </div>

    <div class="as-panel-scrim" data-ref="panel-scrim" data-visible="false">
      <section class="as-panel" data-ref="panel" role="dialog" aria-modal="true">
        <div class="as-panel-kicker" data-ref="panel-kicker"></div>
        <h1 class="as-panel-title" data-ref="panel-title"></h1>
        <div class="as-panel-subtitle" data-ref="panel-subtitle"></div>
        <div class="as-panel-body" data-ref="panel-body"></div>
        <div class="as-panel-order" data-ref="panel-order"></div>
        <div class="as-stats" data-ref="panel-stats"></div>
        <div class="as-button-row" data-ref="panel-actions"></div>
      </section>
    </div>
  `;
}

export function fillPanel(refs, panel) {
  refs.panelKicker.textContent = panel.kicker ?? '';
  refs.panelTitle.textContent = panel.title ?? '';
  refs.panelSubtitle.textContent = panel.subtitle ?? '';
  refs.panelBody.textContent = panel.body ?? '';
  refs.panelOrder.textContent = panel.order ?? '';
  refs.panelOrder.hidden = !panel.order;
  refs.panelStats.innerHTML = '';
  refs.panelActions.innerHTML = '';

  for (const stat of panel.stats ?? []) {
    const item = refs.panelStats.ownerDocument.createElement('div');
    item.className = 'as-stat';
    item.textContent = stat.value ?? '—';
    const label = refs.panelStats.ownerDocument.createElement('small');
    label.textContent = stat.label ?? '';
    item.append(label);
    refs.panelStats.append(item);
  }
  refs.panelStats.hidden = !(panel.stats?.length);

  for (const action of panel.actions ?? []) {
    const button = refs.panelActions.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'as-button';
    button.dataset.action = action.id;
    if (action.primary) button.dataset.primary = 'true';
    button.textContent = action.label;
    refs.panelActions.append(button);
  }
}
