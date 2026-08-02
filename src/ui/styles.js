export const UI_STYLE_ID = 'ashen-standard-ui-styles';

export function ensureUIStyles(documentRef = globalThis.document) {
  if (!documentRef?.head) return null;
  const existing = documentRef.getElementById(UI_STYLE_ID);
  if (existing) return existing;

  const style = documentRef.createElement('style');
  style.id = UI_STYLE_ID;
  style.textContent = `
    :root {
      --as-ink: #111514;
      --as-iron: #202725;
      --as-paper: #d6cfbc;
      --as-paper-dim: #a9a38f;
      --as-brass: #b29a63;
      --as-madder: #8d3f35;
      --as-woad: #435e6b;
      --as-blood: #8b2925;
      --as-safe-top: max(18px, env(safe-area-inset-top));
      --as-safe-right: max(20px, env(safe-area-inset-right));
      --as-safe-bottom: max(18px, env(safe-area-inset-bottom));
      --as-safe-left: max(20px, env(safe-area-inset-left));
    }

    .as-ui,
    .as-ui * {
      box-sizing: border-box;
    }

    .as-ui {
      position: fixed;
      inset: 0;
      z-index: 30;
      overflow: hidden;
      pointer-events: none;
      color: var(--as-paper);
      font-family: Georgia, "Times New Roman", serif;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
      user-select: none;
      --as-vignette: 0;
      --as-damage: 0;
      --as-health: 1;
      --as-stamina: 1;
    }

    .as-ui[hidden],
    .as-hidden {
      display: none !important;
    }

    .as-ui::before,
    .as-ui::after {
      content: "";
      position: absolute;
      inset: -4%;
      pointer-events: none;
      opacity: 0;
      transition: opacity 150ms ease;
    }

    .as-ui::before {
      background:
        radial-gradient(circle at center, transparent 36%, rgba(28, 4, 2, .1) 61%, rgba(44, 5, 2, .9) 108%);
      opacity: calc(var(--as-damage) * .96);
      mix-blend-mode: screen;
    }

    .as-ui::after {
      background:
        radial-gradient(ellipse at center, transparent 45%, rgba(4, 7, 7, .2) 72%, rgba(3, 4, 4, .82) 112%),
        linear-gradient(180deg, rgba(9, 12, 13, .12), transparent 18%, transparent 78%, rgba(3, 4, 4, .2));
      opacity: calc(.16 + var(--as-vignette) * .72);
    }

    .as-sans {
      font-family: "Trebuchet MS", "Segoe UI", sans-serif;
      letter-spacing: .08em;
    }

    .as-hud-layer {
      position: absolute;
      inset: 0;
      opacity: 1;
      transition: opacity 180ms ease;
    }

    .as-ui[data-active="false"] .as-hud-layer {
      opacity: 0;
      visibility: hidden;
    }

    .as-ui[data-mode="menu"] .as-hud-layer,
    .as-ui[data-mode="pause"] .as-hud-layer,
    .as-ui[data-mode="death"] .as-hud-layer,
    .as-ui[data-mode="victory"] .as-hud-layer {
      opacity: .15;
    }

    .as-bars {
      position: absolute;
      left: var(--as-safe-left);
      bottom: calc(var(--as-safe-bottom) + 2px);
      width: clamp(210px, 24vw, 340px);
      filter: drop-shadow(0 3px 5px rgba(0, 0, 0, .68));
    }

    .as-bar-row {
      position: relative;
      height: 18px;
      margin-top: 7px;
      transform-origin: left center;
    }

    .as-bar-label {
      position: absolute;
      left: 11px;
      top: 50%;
      z-index: 2;
      transform: translateY(-50%);
      color: rgba(231, 225, 206, .82);
      font: 700 9px/1 "Trebuchet MS", sans-serif;
      letter-spacing: .18em;
      text-transform: uppercase;
      text-shadow: 0 1px 2px #000;
    }

    .as-bar-track {
      position: absolute;
      inset: 0;
      overflow: hidden;
      border: 1px solid rgba(188, 176, 141, .32);
      background: rgba(9, 12, 12, .78);
      clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .55);
    }

    .as-bar-fill {
      height: 100%;
      width: 100%;
      transform: scaleX(var(--value, 1));
      transform-origin: left center;
      transition: transform 150ms linear, filter 140ms ease;
    }

    .as-bar-fill::after {
      content: "";
      display: block;
      width: 100%;
      height: 100%;
      background: linear-gradient(180deg, rgba(255,255,255,.16), transparent 38%, rgba(0,0,0,.24));
    }

    .as-health-fill {
      background: #8a3930;
      box-shadow: inset -8px 0 12px rgba(32, 0, 0, .42);
    }

    .as-stamina-fill {
      background: #9a8959;
      box-shadow: inset -8px 0 12px rgba(27, 21, 5, .42);
    }

    .as-ui[data-low-health="true"] .as-health-fill {
      animation: as-pulse-health 1s ease-in-out infinite;
    }

    .as-objective {
      position: absolute;
      top: var(--as-safe-top);
      left: var(--as-safe-left);
      width: min(460px, calc(100vw - var(--as-safe-left) - var(--as-safe-right)));
      padding: 13px 16px 14px 18px;
      border-left: 2px solid rgba(178, 154, 99, .85);
      background: linear-gradient(90deg, rgba(9, 13, 13, .76), rgba(9, 13, 13, .26) 74%, transparent);
      filter: drop-shadow(0 2px 5px rgba(0,0,0,.55));
      transform: translateX(0);
      opacity: 1;
      transition: opacity 240ms ease, transform 300ms ease;
    }

    .as-objective[data-state="enter"] {
      opacity: 0;
      transform: translateX(-18px);
    }

    .as-objective[data-state="complete"] {
      opacity: 0;
      transform: translateX(12px);
    }

    .as-objective-kicker {
      color: var(--as-brass);
      font: 700 9px/1.2 "Trebuchet MS", sans-serif;
      letter-spacing: .2em;
      text-transform: uppercase;
    }

    .as-objective-title {
      margin-top: 4px;
      font-size: clamp(16px, 1.6vw, 21px);
      line-height: 1.18;
      text-shadow: 0 2px 3px rgba(0,0,0,.85);
    }

    .as-objective-detail {
      max-width: 390px;
      margin-top: 4px;
      color: rgba(216, 210, 191, .74);
      font: 12px/1.35 "Trebuchet MS", sans-serif;
    }

    .as-objective-progress {
      width: min(270px, 76%);
      height: 2px;
      margin-top: 10px;
      background: rgba(207, 198, 171, .16);
    }

    .as-objective-progress > i {
      display: block;
      width: 100%;
      height: 100%;
      background: var(--as-brass);
      transform: scaleX(var(--progress, 0));
      transform-origin: left;
      transition: transform 180ms linear;
    }

    .as-battle {
      position: absolute;
      top: var(--as-safe-top);
      right: var(--as-safe-right);
      width: clamp(190px, 20vw, 280px);
      padding: 9px 12px 10px;
      color: rgba(222, 216, 196, .86);
      background: linear-gradient(270deg, rgba(8, 12, 12, .67), transparent);
      text-align: right;
      filter: drop-shadow(0 2px 4px #000);
    }

    .as-battle-phase {
      min-height: 12px;
      margin-bottom: 8px;
      color: rgba(201, 190, 158, .74);
      font: 700 9px/1.2 "Trebuchet MS", sans-serif;
      letter-spacing: .17em;
      text-transform: uppercase;
    }

    .as-battle-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
      margin-top: 5px;
      font: 700 9px/1 "Trebuchet MS", sans-serif;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .as-battle-row > strong {
      color: rgba(225, 216, 190, .72);
      font-size: 8px;
      letter-spacing: .13em;
    }

    .as-battle-row[data-state="routed"] {
      opacity: .5;
      text-decoration: line-through;
    }

    .as-encounter {
      position: absolute;
      left: 50%;
      top: calc(var(--as-safe-top) + 4px);
      width: min(460px, calc(100vw - 48px));
      transform: translate(-50%, -12px);
      padding: 8px 14px 10px;
      background: linear-gradient(90deg, transparent, rgba(8, 11, 11, .76) 16%, rgba(8, 11, 11, .76) 84%, transparent);
      text-align: center;
      opacity: 0;
      transition: opacity 180ms ease, transform 240ms ease;
    }

    .as-encounter[data-visible="true"] {
      transform: translate(-50%, 0);
      opacity: 1;
    }

    .as-encounter-copy {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: baseline;
      color: rgba(228, 220, 199, .86);
      font-size: 10px;
      text-transform: uppercase;
    }

    .as-encounter-copy strong {
      color: #eadfbe;
      font: 400 16px/1 Georgia, serif;
      letter-spacing: .04em;
    }

    .as-encounter-kicker,
    .as-encounter-copy > span:last-child {
      color: rgba(195, 170, 112, .76);
      font-size: 8px;
      letter-spacing: .16em;
    }

    .as-encounter-track {
      display: block;
      height: 3px;
      margin-top: 8px;
      overflow: hidden;
      background: rgba(255,255,255,.12);
    }

    .as-encounter-track > i {
      display: block;
      width: 100%;
      height: 100%;
      transform: scaleX(var(--value, 1));
      transform-origin: left;
      background: var(--as-madder);
      transition: transform 160ms linear, background 240ms ease;
    }

    .as-encounter[data-phase="desperate"] .as-encounter-track > i {
      background: #b34b3f;
    }

    .as-reticle {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 28px;
      height: 28px;
      transform: translate(-50%, -50%) scale(var(--reticle-scale, 1));
      opacity: var(--reticle-opacity, .72);
      transition: transform 90ms ease, opacity 120ms ease, filter 100ms ease;
      filter: drop-shadow(0 1px 1px rgba(0, 0, 0, .95));
    }

    .as-reticle::before,
    .as-reticle::after {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(var(--reticle-color, #ddd4bd), var(--reticle-color, #ddd4bd)) center 1px / 1px 6px no-repeat,
        linear-gradient(var(--reticle-color, #ddd4bd), var(--reticle-color, #ddd4bd)) center calc(100% - 1px) / 1px 6px no-repeat,
        linear-gradient(90deg, var(--reticle-color, #ddd4bd), var(--reticle-color, #ddd4bd)) 1px center / 6px 1px no-repeat,
        linear-gradient(90deg, var(--reticle-color, #ddd4bd), var(--reticle-color, #ddd4bd)) calc(100% - 1px) center / 6px 1px no-repeat;
    }

    .as-reticle::after {
      inset: 12px;
      border: 1px solid var(--reticle-color, #ddd4bd);
      border-radius: 50%;
      background: none;
    }

    .as-reticle[data-state="guard"] { --reticle-color: #b69f68; }
    .as-reticle[data-state="hostile"] { --reticle-color: #c75b4f; }
    .as-reticle[data-state="interact"] { --reticle-color: #d9c786; --reticle-scale: 1.1; }
    .as-reticle[data-state="hidden"] { --reticle-opacity: 0; }

    .as-interaction {
      position: absolute;
      left: 50%;
      top: calc(50% + 35px);
      max-width: min(500px, calc(100vw - 40px));
      padding: 7px 12px;
      transform: translateX(-50%);
      border: 1px solid rgba(188, 176, 141, .2);
      background: rgba(9, 12, 12, .68);
      color: rgba(226, 220, 202, .9);
      font: 600 11px/1.2 "Trebuchet MS", sans-serif;
      letter-spacing: .06em;
      text-align: center;
      text-shadow: 0 1px 2px #000;
      opacity: 0;
      transition: opacity 130ms ease, transform 160ms ease;
    }

    .as-interaction[data-visible="true"] {
      opacity: 1;
      transform: translateX(-50%) translateY(2px);
    }

    .as-key {
      display: inline-flex;
      min-width: 22px;
      height: 20px;
      align-items: center;
      justify-content: center;
      margin-right: 8px;
      padding: 0 6px;
      border: 1px solid rgba(212, 201, 168, .55);
      background: rgba(191, 180, 146, .1);
      color: #e2d9bd;
      font: 700 10px/1 "Trebuchet MS", sans-serif;
      box-shadow: inset 0 -2px rgba(0,0,0,.28);
    }

    .as-context {
      position: absolute;
      left: 50%;
      bottom: calc(var(--as-safe-bottom) + 16px);
      width: min(520px, calc(100vw - 40px));
      transform: translateX(-50%);
      text-align: center;
    }

    .as-tutorial {
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      padding: 7px 11px;
      border-top: 1px solid rgba(185, 169, 123, .34);
      background: linear-gradient(90deg, transparent, rgba(8, 11, 11, .72) 20%, rgba(8, 11, 11, .72) 80%, transparent);
      color: rgba(219, 213, 195, .82);
      font: 11px/1.3 "Trebuchet MS", sans-serif;
      letter-spacing: .025em;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 180ms ease, transform 240ms ease;
    }

    .as-tutorial[data-visible="true"] {
      opacity: 1;
      transform: translateY(0);
    }

    .as-command-strip {
      display: flex;
      justify-content: center;
      gap: 6px;
      margin-bottom: 9px;
      opacity: 0;
      transform: translateY(7px);
      transition: opacity 180ms ease, transform 240ms ease;
    }

    .as-command-strip[data-visible="true"] {
      opacity: 1;
      transform: translateY(0);
    }

    .as-command {
      padding: 6px 8px;
      border: 1px solid rgba(192, 177, 134, .26);
      background: rgba(8, 11, 11, .72);
      color: rgba(225, 217, 195, .76);
      font: 700 9px/1 "Trebuchet MS", sans-serif;
      letter-spacing: .1em;
      text-transform: uppercase;
    }

    .as-command[data-active="true"] {
      border-color: rgba(190, 163, 98, .74);
      color: #eadbaa;
      background: rgba(79, 66, 36, .7);
    }

    .as-announcement {
      position: absolute;
      left: 50%;
      top: 25%;
      width: min(680px, calc(100vw - 40px));
      transform: translate(-50%, -8px);
      padding: 20px;
      text-align: center;
      text-shadow: 0 2px 4px #000;
      opacity: 0;
      transition: opacity 180ms ease, transform 240ms ease;
    }

    .as-announcement[data-visible="true"] {
      opacity: 1;
      transform: translate(-50%, 0);
    }

    .as-announcement::before {
      content: "";
      display: block;
      width: min(320px, 60%);
      height: 1px;
      margin: 0 auto 12px;
      background: linear-gradient(90deg, transparent, var(--as-brass), transparent);
    }

    .as-announcement-title {
      color: #e4dcc5;
      font-size: clamp(22px, 2.6vw, 36px);
      line-height: 1;
      letter-spacing: .045em;
      text-transform: uppercase;
    }

    .as-announcement-detail {
      max-width: 560px;
      margin: 10px auto 0;
      color: rgba(214, 207, 188, .72);
      font: 12px/1.45 "Trebuchet MS", sans-serif;
      letter-spacing: .06em;
    }

    .as-subtitle {
      position: absolute;
      left: 50%;
      bottom: calc(var(--as-safe-bottom) + 92px);
      width: min(760px, calc(100vw - 40px));
      transform: translateX(-50%);
      text-align: center;
      text-shadow: 0 2px 3px #000, 0 0 8px #000;
      opacity: 0;
      transition: opacity 160ms ease;
    }

    .as-subtitle[data-visible="true"] { opacity: 1; }

    .as-subtitle-speaker {
      margin-right: 6px;
      color: #c3aa70;
      font: 700 11px/1.35 "Trebuchet MS", sans-serif;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .as-subtitle-text {
      color: #eee8d8;
      font: 15px/1.4 Georgia, serif;
    }

    .as-hit-marker {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 30px;
      height: 30px;
      transform: translate(-50%, -50%) scale(.75);
      opacity: 0;
    }

    .as-hit-marker::before,
    .as-hit-marker::after {
      content: "";
      position: absolute;
      left: 50%;
      top: 50%;
      width: 24px;
      height: 1px;
      background: #e3dac2;
      box-shadow: 0 1px 1px #000;
    }

    .as-hit-marker::before { transform: translate(-50%, -50%) rotate(45deg); }
    .as-hit-marker::after { transform: translate(-50%, -50%) rotate(-45deg); }
    .as-hit-marker[data-kind="armor"]::before,
    .as-hit-marker[data-kind="armor"]::after { background: #b29a63; }
    .as-hit-marker[data-kind="kill"]::before,
    .as-hit-marker[data-kind="kill"]::after { background: #b94b40; height: 2px; }
    .as-hit-marker[data-active="true"] { animation: as-hit-marker 260ms ease-out both; }

    .as-kill-feed {
      position: absolute;
      right: var(--as-safe-right);
      top: calc(var(--as-safe-top) + 108px);
      width: min(310px, 48vw);
      text-align: right;
    }

    .as-kill-item {
      margin-top: 6px;
      color: rgba(226, 217, 194, .86);
      font: 10px/1.3 "Trebuchet MS", sans-serif;
      letter-spacing: .05em;
      text-shadow: 0 1px 3px #000;
      animation: as-feed-in 3.8s ease both;
    }

    .as-kill-item strong {
      color: #c7aa69;
      font-weight: 700;
      text-transform: uppercase;
    }

    .as-damage-direction {
      position: absolute;
      left: 50%;
      top: 50%;
      width: min(42vw, 430px);
      height: min(42vw, 430px);
      transform: translate(-50%, -50%) rotate(var(--angle, 0deg));
      opacity: 0;
      transition: opacity 100ms ease;
    }

    .as-damage-direction::before {
      content: "";
      position: absolute;
      left: 50%;
      top: 0;
      width: 90px;
      height: 34px;
      transform: translateX(-50%);
      background: radial-gradient(ellipse at top, rgba(153, 35, 28, .74), transparent 67%);
    }

    .as-damage-direction[data-active="true"] {
      animation: as-damage-direction 650ms ease-out both;
    }

    .as-panel-scrim {
      position: absolute;
      inset: 0;
      z-index: 6;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 28px;
      pointer-events: auto;
      background:
        radial-gradient(circle at 50% 35%, rgba(33, 40, 39, .45), rgba(4, 7, 7, .92) 78%),
        linear-gradient(135deg, rgba(62, 65, 60, .18), transparent);
      opacity: 0;
      visibility: hidden;
      transition: opacity 260ms ease, visibility 0s linear 260ms;
    }

    .as-panel-scrim[data-visible="true"] {
      opacity: 1;
      visibility: visible;
      transition-delay: 0s;
    }

    .as-panel {
      position: relative;
      width: min(620px, 100%);
      max-height: calc(100vh - 50px);
      overflow: auto;
      padding: clamp(28px, 5vw, 56px);
      border: 1px solid rgba(178, 162, 117, .31);
      background:
        linear-gradient(rgba(17, 22, 21, .96), rgba(10, 14, 14, .97)),
        repeating-linear-gradient(105deg, transparent 0 5px, rgba(255,255,255,.01) 5px 6px);
      box-shadow: 0 25px 80px rgba(0,0,0,.75), inset 0 0 0 5px rgba(0,0,0,.22);
      text-align: center;
      transform: translateY(10px);
      transition: transform 320ms ease;
    }

    .as-panel-scrim[data-visible="true"] .as-panel { transform: translateY(0); }

    .as-panel::before,
    .as-panel::after {
      content: "";
      position: absolute;
      left: 24px;
      right: 24px;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(178, 154, 99, .58), transparent);
    }
    .as-panel::before { top: 19px; }
    .as-panel::after { bottom: 19px; }

    .as-panel-kicker {
      color: var(--as-brass);
      font: 700 10px/1.3 "Trebuchet MS", sans-serif;
      letter-spacing: .26em;
      text-transform: uppercase;
    }

    .as-panel-title {
      margin: 10px 0 4px;
      color: #e0d8c0;
      font-size: clamp(34px, 6vw, 66px);
      font-weight: 400;
      line-height: .98;
      letter-spacing: .035em;
      text-transform: uppercase;
      text-shadow: 0 3px 8px rgba(0,0,0,.7);
    }

    .as-panel-subtitle {
      margin: 9px 0 25px;
      color: rgba(204, 196, 174, .58);
      font: 700 10px/1.4 "Trebuchet MS", sans-serif;
      letter-spacing: .15em;
      text-transform: uppercase;
    }

    .as-panel-body {
      max-width: 470px;
      margin: 0 auto;
      color: rgba(221, 215, 197, .8);
      font-size: 15px;
      line-height: 1.6;
    }

    .as-panel-order {
      margin: 24px auto 0;
      padding: 15px 18px;
      border-top: 1px solid rgba(178, 154, 99, .24);
      border-bottom: 1px solid rgba(178, 154, 99, .24);
      color: rgba(224, 216, 193, .9);
      font-size: 14px;
      line-height: 1.5;
      font-style: italic;
    }

    .as-button-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      margin-top: 30px;
    }

    .as-button {
      min-width: 170px;
      padding: 12px 18px;
      border: 1px solid rgba(190, 174, 127, .45);
      background: rgba(173, 150, 91, .12);
      color: #ded4b8;
      font: 700 11px/1 "Trebuchet MS", sans-serif;
      letter-spacing: .15em;
      text-transform: uppercase;
      cursor: pointer;
      pointer-events: auto;
      transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
    }

    .as-button:hover,
    .as-button:focus-visible {
      border-color: rgba(215, 194, 134, .88);
      outline: none;
      background: rgba(173, 150, 91, .24);
      color: #f0e5c6;
    }

    .as-button[data-primary="true"] {
      background: rgba(157, 130, 67, .32);
    }

    .as-pause-list {
      display: grid;
      gap: 10px;
      max-width: 330px;
      margin: 25px auto 0;
    }

    .as-pause-list .as-button { width: 100%; }

    .as-stats {
      display: flex;
      justify-content: center;
      gap: 30px;
      margin-top: 23px;
    }

    .as-stat {
      min-width: 80px;
      color: #d9ceb0;
      font-size: 24px;
    }

    .as-stat small {
      display: block;
      margin-top: 4px;
      color: rgba(199, 190, 165, .56);
      font: 700 8px/1.3 "Trebuchet MS", sans-serif;
      letter-spacing: .16em;
      text-transform: uppercase;
    }

    @keyframes as-hit-marker {
      0% { opacity: 0; transform: translate(-50%, -50%) scale(.65); }
      25% { opacity: 1; }
      100% { opacity: 0; transform: translate(-50%, -50%) scale(1.25); }
    }

    @keyframes as-damage-direction {
      0% { opacity: 0; }
      15% { opacity: 1; }
      100% { opacity: 0; }
    }

    @keyframes as-feed-in {
      0% { opacity: 0; transform: translateX(8px); }
      9%, 75% { opacity: 1; transform: translateX(0); }
      100% { opacity: 0; transform: translateX(3px); }
    }

    @keyframes as-pulse-health {
      0%, 100% { filter: brightness(.85); }
      50% { filter: brightness(1.28); }
    }

    @media (max-width: 700px), (max-height: 560px) {
      .as-objective-detail { display: none; }
      .as-objective { width: min(68vw, 390px); padding: 10px 12px; }
      .as-battle { width: min(32vw, 220px); }
      .as-battle-row { grid-template-columns: 1fr 42px; }
      .as-subtitle { bottom: calc(var(--as-safe-bottom) + 72px); }
      .as-bars { width: min(44vw, 270px); }
      .as-panel { padding: 28px 24px; }
      .as-panel-title { font-size: clamp(30px, 8vw, 48px); }
    }

    @media (prefers-reduced-motion: reduce) {
      .as-ui *,
      .as-ui *::before,
      .as-ui *::after {
        animation-duration: .001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: .001ms !important;
      }
    }
  `;
  documentRef.head.append(style);
  return style;
}
