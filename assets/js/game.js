/* ==========================================================================
   NEON VAULT — UI controller, spin lifecycle, audio and local persistence
   Depends on: core.js → symbols.js → renderer.js
   Virtual credits only. No network requests, no third-party runtime code.
   ========================================================================== */
(function () {
  "use strict";

  const NV = window.NV;
  if (!NV || !NV.CONFIG || !NV.createRenderer || !NV.art) {
    console.error("[NEON VAULT] Required modules are missing. Check script order.");
    return;
  }

  const {
    BETS,
    DEFAULT_BET_INDEX,
    START_CREDITS,
    FREE_MULTIPLIER,
    SYMBOLS,
    SYMBOL_IDS
  } = NV.CONFIG;
  const { clamp, formatInt, prefersReducedMotion } = NV.util;
  const SAVE_KEY = "neon-vault-save-v1";
  const SAVE_VERSION = 1;
  const REDUCED_STOPS = [80, 120, 160, 200, 240];
  const TURBO_STOPS = [360, 520, 680, 840, 1000];
  const NORMAL_STOPS = [620, 840, 1060, 1280, 1500];
  const WEIGHT_TOTAL = SYMBOL_IDS.reduce((sum, id) => sum + SYMBOLS[id].weight, 0);
  const reducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };
  const secureRandom = NV.createSecureRandom();

  const dom = {};
  [
    "reelsCanvas", "creditsValue", "winValue", "freeValue", "statusLine",
    "betDown", "betUp", "betValue", "lineBetValue", "spinCost", "spinBtn",
    "turboBtn", "soundBtn", "resetBtn", "resetDialog", "totalSpinsValue",
    "bestWinValue", "bonusOverlay", "bonusTitle", "bonusCopy", "copyrightYear",
    "spinSr", "turboSr", "soundSr"
  ].forEach((id) => {
    dom[id] = document.getElementById(id);
  });

  const machine = document.getElementById("game");
  const winCell = dom.winValue ? dom.winValue.closest(".hud-cell") : null;
  const freeCell = dom.freeValue ? dom.freeValue.closest(".hud-cell") : null;

  if (!dom.reelsCanvas || !dom.spinBtn || !dom.statusLine || !machine) {
    console.error("[NEON VAULT] Game markup is incomplete.");
    return;
  }

  let renderer = null;
  try {
    renderer = NV.createRenderer(dom.reelsCanvas);
  } catch (error) {
    console.error("[NEON VAULT] Canvas renderer failed to start.", error);
  }

  if (!renderer) {
    dom.spinBtn.disabled = true;
    dom.statusLine.textContent = "RENDER ERROR // 当前浏览器无法初始化 Canvas 游戏";
    dom.statusLine.classList.add("is-error");
    return;
  }

  const state = {
    credits: START_CREDITS,
    betIndex: DEFAULT_BET_INDEX,
    sound: false,
    turbo: false,
    totalSpins: 0,
    bestWin: 0,
    phase: "idle",
    locked: false,
    grid: NV.generateIdleGrid(secureRandom),
    spin: null,
    inFree: false,
    freeRemaining: 0,
    freeAwarded: 0,
    freeSessionWin: 0,
    lastWin: 0,
    showWin: false,
    winLines: [],
    scatterCells: [],
    scatterCount: 0,
    result: null,
    timers: []
  };
  let restoredSession = false;
  let rendererVisible = true;
  let rafId = 0;

  /* ------------------------------------------------------------------------
     Audio — tiny Web Audio synthesizer; no sound files, no external requests
     ------------------------------------------------------------------------ */
  const audio = (() => {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    let context = null;
    let master = null;
    let enabled = false;

    function ensure() {
      if (!AudioCtor) return null;
      if (!context) {
        try {
          context = new AudioCtor();
          master = context.createGain();
          master.gain.value = 0.22;
          master.connect(context.destination);
        } catch (error) {
          context = null;
          return null;
        }
      }
      if (context.state === "suspended") {
        const resumed = context.resume();
        if (resumed && typeof resumed.catch === "function") resumed.catch(() => {});
      }
      return context;
    }

    function tone(frequency, duration, options = {}) {
      if (!context) return;
      try {
        const start = context.currentTime + (options.delay || 0);
        const level = Math.max(0.0001, options.gain || 0.055);
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = options.type || "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        if (options.to) {
          oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, options.to), start + duration);
        }
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(level, start + Math.min(0.02, duration * 0.22));
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.03);
      } catch (error) {
        /* Audio is an enhancement; never let it break a spin. */
      }
    }

    const effects = {
      ui() {
        tone(940, 0.055, { type: "square", gain: 0.018, to: 720 });
      },
      spin() {
        tone(150, 0.2, { type: "sawtooth", gain: 0.035, to: 82 });
        tone(320, 0.12, { type: "triangle", gain: 0.02, to: 190 });
      },
      reel(index) {
        tone(560 + index * 56, 0.045, { type: "triangle", gain: 0.026 });
      },
      win() {
        [523.25, 659.25, 783.99].forEach((frequency, index) => {
          tone(frequency, 0.26, { delay: index * 0.06, type: "sine", gain: 0.04 });
        });
      },
      bigwin() {
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((frequency, index) => {
          tone(frequency, 0.42, { delay: index * 0.075, type: "triangle", gain: 0.046 });
        });
      },
      scatter() {
        [880, 1174.66, 1567.98].forEach((frequency, index) => {
          tone(frequency, 0.5, { delay: index * 0.08, type: "sine", gain: 0.04 });
        });
      },
      bonus() {
        [392, 523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
          tone(frequency, 0.34, { delay: index * 0.09, type: "triangle", gain: 0.05 });
        });
      },
      error() {
        tone(150, 0.18, { type: "square", gain: 0.03, to: 96 });
      }
    };

    function play(name, argument) {
      if (!enabled || !ensure()) return;
      const effect = effects[name];
      if (effect) effect(argument);
    }

    return {
      play,
      setEnabled(next) {
        enabled = Boolean(next);
        if (enabled) ensure();
      },
      unlock() {
        if (enabled) ensure();
      },
      get enabled() {
        return enabled;
      }
    };
  })();

  /* ------------------------------------------------------------------------
     Persistence
     ------------------------------------------------------------------------ */
  function loadSession() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== SAVE_VERSION) return;

      const credits = Math.floor(Number(saved.credits));
      if (Number.isFinite(credits) && credits >= 0) state.credits = credits;

      const betIndex = Math.floor(Number(saved.betIndex));
      if (Number.isInteger(betIndex) && betIndex >= 0 && betIndex < BETS.length) {
        state.betIndex = betIndex;
      }

      state.sound = Boolean(saved.sound);
      state.turbo = Boolean(saved.turbo);

      const spins = Math.floor(Number(saved.totalSpins));
      if (Number.isFinite(spins) && spins >= 0) state.totalSpins = spins;

      const best = Math.floor(Number(saved.bestWin));
      if (Number.isFinite(best) && best >= 0) state.bestWin = best;

      restoredSession = true;
    } catch (error) {
      /* Corrupt or unavailable storage must not block the game. */
    }

    while (state.betIndex > 0 && BETS[state.betIndex] > state.credits) {
      state.betIndex -= 1;
    }
  }

  function saveSession() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: SAVE_VERSION,
        credits: state.credits,
        betIndex: state.betIndex,
        sound: state.sound,
        turbo: state.turbo,
        totalSpins: state.totalSpins,
        bestWin: state.bestWin
      }));
    } catch (error) {
      /* Private mode or quota limits can disable storage; gameplay continues. */
    }
  }

  /* ------------------------------------------------------------------------
     Timers
     ------------------------------------------------------------------------ */
  function schedule(callback, delay) {
    const id = window.setTimeout(() => {
      state.timers = state.timers.filter((timer) => timer !== id);
      callback();
    }, Math.max(0, delay));
    state.timers.push(id);
    return id;
  }

  function clearTimers() {
    state.timers.forEach((id) => window.clearTimeout(id));
    state.timers = [];
  }

  /* ------------------------------------------------------------------------
     UI helpers
     ------------------------------------------------------------------------ */
  function currentBet() {
    return BETS[state.betIndex];
  }

  function setStatus(message, tone) {
    dom.statusLine.textContent = message;
    dom.statusLine.classList.remove("is-spinning", "is-win", "is-bonus", "is-error");
    if (tone) dom.statusLine.classList.add(`is-${tone}`);
  }

  function updateToggleState() {
    if (dom.soundBtn) {
      dom.soundBtn.setAttribute("aria-pressed", String(state.sound));
      if (dom.soundSr) dom.soundSr.textContent = state.sound ? "关闭音效" : "开启音效";
    }
    if (dom.turboBtn) {
      dom.turboBtn.setAttribute("aria-pressed", String(state.turbo));
      if (dom.turboSr) {
        dom.turboSr.textContent = state.turbo ? "关闭 Turbo 快速旋转" : "开启 Turbo 快速旋转";
      }
    }
  }

  function updateHud(hit) {
    const bet = currentBet();
    dom.creditsValue.textContent = formatInt(state.credits);
    dom.winValue.textContent = formatInt(state.lastWin);
    dom.freeValue.textContent = state.freeRemaining > 0 || state.inFree
      ? String(state.freeRemaining)
      : "—";
    dom.betValue.textContent = formatInt(bet);
    dom.lineBetValue.textContent = formatInt(bet / 10);
    dom.spinCost.textContent = formatInt(bet);
    dom.totalSpinsValue.textContent = formatInt(state.totalSpins);
    dom.bestWinValue.textContent = formatInt(state.bestWin);

    if (winCell) {
      winCell.classList.remove("is-hit");
      if (hit && state.lastWin > 0) {
        /* Restart the one-shot CSS animation. */
        void winCell.offsetWidth;
        winCell.classList.add("is-hit");
      }
    }
    if (freeCell) freeCell.classList.toggle("is-active", state.inFree);

    dom.spinBtn.classList.toggle("is-spinning", state.phase === "spinning");
    const lowBalance = !state.inFree && state.credits < bet;
    dom.spinBtn.disabled = state.locked || lowBalance;
    dom.betDown.disabled = state.locked || state.inFree || state.betIndex === 0;
    dom.betUp.disabled = state.locked || state.inFree
      || state.betIndex >= BETS.length - 1
      || BETS[state.betIndex + 1] > state.credits;
    dom.turboBtn.disabled = state.locked;

    machine.setAttribute("aria-busy", String(state.locked));

    let label;
    if (state.phase === "spinning") {
      label = "转轴旋转中";
    } else if (state.inFree) {
      label = "免费旋转进行中";
    } else if (lowBalance) {
      label = "余额不足，请降低投注或重置游戏会话";
    } else {
      label = `旋转老虎机，花费 ${formatInt(bet)} 虚拟筹码`;
    }
    if (dom.spinSr) dom.spinSr.textContent = label;
  }

  function updateCanvasLabel(result) {
    if (!result) {
      dom.reelsCanvas.setAttribute("aria-label", "五列三行的赛博朋克老虎机转轴，等待旋转");
      return;
    }
    const summary = result.scatterCount >= 3
      ? `出现 ${result.scatterCount} 个 SCATTER。`
      : "";
    const payout = result.totalWin > 0
      ? `本轮赢得 ${formatInt(result.totalWin)} 虚拟筹码。`
      : "本轮未中奖。";
    dom.reelsCanvas.setAttribute(
      "aria-label",
      `${NV.describeGrid(result.grid)}。${summary}${payout}`
    );
  }

  function showBonusOverlay(title, copy) {
    if (!dom.bonusOverlay) return;
    dom.bonusTitle.textContent = title;
    dom.bonusCopy.textContent = copy;
    dom.bonusOverlay.hidden = false;
  }

  function hideBonusOverlay() {
    if (dom.bonusOverlay) dom.bonusOverlay.hidden = true;
  }

  /* ------------------------------------------------------------------------
     Spin construction
     ------------------------------------------------------------------------ */
  function pickStripSymbol() {
    let roll = secureRandom() * WEIGHT_TOTAL;
    for (let index = 0; index < SYMBOL_IDS.length; index += 1) {
      const id = SYMBOL_IDS[index];
      roll -= SYMBOLS[id].weight;
      if (roll < 0) return id;
    }
    return SYMBOL_IDS[SYMBOL_IDS.length - 1];
  }

  function makeStrip(grid) {
    const strip = [];
    for (let index = 0; index < 10; index += 1) strip.push(pickStripSymbol());
    strip.push(grid[0], grid[1], grid[2]);
    return strip;
  }

  function getStopDurations() {
    if (prefersReducedMotion()) return REDUCED_STOPS;
    return state.turbo ? TURBO_STOPS : NORMAL_STOPS;
  }

  function beginSpin(options = {}) {
    const isFree = Boolean(options.free);
    if (state.phase === "spinning") return false;
    if (!isFree && state.locked) return false;
    if (isFree && (!state.inFree || state.freeRemaining <= 0)) return false;
    if (!isFree && state.credits < currentBet()) {
      setStatus("LOW BALANCE // 余额不足，请降低投注或点击 RESET", "error");
      audio.play("error");
      return false;
    }

    const bet = currentBet();
    if (!isFree) {
      state.credits -= bet;
    } else {
      state.freeRemaining -= 1;
    }

    const multiplier = state.inFree ? FREE_MULTIPLIER : 1;
    const result = NV.evaluateGrid(NV.generateGrid(secureRandom), bet, multiplier);
    const stops = getStopDurations();

    state.result = result;
    state.grid = result.grid;
    state.winLines = [];
    state.scatterCells = result.scatterCells;
    state.scatterCount = result.scatterCount;
    state.lastWin = 0;
    state.showWin = false;
    state.phase = "spinning";
    state.locked = true;
    state.totalSpins += 1;
    state.spin = {
      start: performance.now(),
      stops,
      strips: result.grid.map((column) => makeStrip(column)),
      free: isFree,
      result
    };

    renderer.clearEffects();
    updateHud();
    updateCanvasLabel(null);
    dom.reelsCanvas.setAttribute("aria-label", "五列转轴正在旋转，结果已经锁定");
    setStatus(
      isFree
        ? `FREE SPIN // ×2 倍率 · 剩余 ${state.freeRemaining} 次`
        : `SPINNING // 转轴解码中 · 本次投注 ${formatInt(bet)}`,
      isFree ? "bonus" : "spinning"
    );
    audio.play("spin");
    stops.forEach((delay, index) => {
      schedule(() => audio.play("reel", index), delay);
    });

    const finishDelay = stops[stops.length - 1] + (prefersReducedMotion() ? 70 : 230);
    schedule(() => finishSpin(isFree), finishDelay);
    return true;
  }

  function finishSpin(isFree) {
    if (state.phase !== "spinning" || !state.result) return;
    const result = state.result;
    const bet = currentBet();
    const win = result.totalWin;
    const trigger = result.scatterCount >= 3;

    state.phase = "idle";
    state.spin = null;
    state.winLines = result.lineWins;
    state.scatterCells = result.scatterCells;
    state.scatterCount = result.scatterCount;
    state.lastWin = win;
    state.showWin = win > 0 || trigger;

    if (win > 0) {
      state.credits += win;
      if (win > state.bestWin) state.bestWin = win;
      if (isFree) state.freeSessionWin += win;
      renderer.spawnBurst(
        result.lineWins,
        result.scatterCells,
        result.scatterCount,
        win >= bet * 15
      );
      if (trigger) audio.play("scatter");
      audio.play(win >= bet * 15 ? "bigwin" : "win");
    }

    updateCanvasLabel(result);
    updateHud(win > 0);
    saveSession();

    const lineText = result.lineWins.length > 0
      ? ` · ${result.lineWins.length} 条中奖线`
      : "";
    const scatterText = trigger ? ` · ${result.scatterCount} 个 SCATTER` : "";
    const prefix = isFree ? "FREE ×2 // " : "PAYOUT // ";
    const missPrefix = isFree ? "FREE ×2 // " : "NO SIGNAL // ";

    if (win > 0) {
      setStatus(`${prefix}本轮赢得 ${formatInt(win)}${lineText}${scatterText}`, "win");
    } else {
      setStatus(`${missPrefix}本轮未中奖${scatterText}`, trigger ? "bonus" : "");
    }

    if (trigger) {
      if (!isFree) {
        beginFreeSession(result);
        return;
      }

      state.freeRemaining += result.retriggerSpins;
      state.freeAwarded += result.retriggerSpins;
      showBonusOverlay(
        `+${result.retriggerSpins} FREE SPINS`,
        `RETRIGGER // 额外增加 ${result.retriggerSpins} 次 · 当前剩余 ${state.freeRemaining}`
      );
      setStatus(
        `RETRIGGER // 免费旋转 +${result.retriggerSpins} · 剩余 ${state.freeRemaining}`,
        "bonus"
      );
      audio.play("bonus");
      updateHud();
      schedule(() => {
        hideBonusOverlay();
        continueFreeSequence();
      }, prefersReducedMotion() ? 1100 : 1900);
      return;
    }

    if (isFree) {
      schedule(continueFreeSequence, prefersReducedMotion()
        ? 250
        : state.turbo ? 480 : 850);
      return;
    }

    const hold = prefersReducedMotion() ? 150 : state.turbo ? 650 : win > 0 ? 1450 : 900;
    schedule(() => {
      state.locked = false;
      updateHud();
      if (state.credits < currentBet()) {
        setStatus("LOW BALANCE // 余额不足，请降低投注或点击 RESET 重置", "error");
      }
    }, hold);
  }

  function beginFreeSession(result) {
    state.freeRemaining = result.freeSpins;
    state.freeAwarded = result.freeSpins;
    state.freeSessionWin = 0;
    updateHud();
    showBonusOverlay(
      `${result.freeSpins} FREE SPINS`,
      "VAULT BREACH // 所有奖金 ×2 · 自动连转"
    );
    setStatus(
      `VAULT BREACH // ${result.freeSpins} 次免费旋转 · 所有奖金 ×2`,
      "bonus"
    );
    audio.play("bonus");
    saveSession();

    schedule(() => {
      hideBonusOverlay();
      state.inFree = true;
      setStatus(`FREE PROTOCOL // ${state.freeRemaining} 次免费旋转启动`, "bonus");
      updateHud();
      schedule(() => {
        if (state.phase !== "spinning" && state.locked && state.inFree) {
          beginSpin({ free: true });
        }
      }, prefersReducedMotion() ? 180 : 620);
    }, prefersReducedMotion() ? 1200 : 2400);
  }

  function continueFreeSequence() {
    if (!state.inFree || state.phase === "spinning") return;
    if (state.freeRemaining > 0) {
      schedule(() => {
        if (state.inFree && state.locked && state.phase !== "spinning") {
          beginSpin({ free: true });
        }
      }, prefersReducedMotion() ? 120 : 420);
      return;
    }
    endFreeSession();
  }

  function endFreeSession() {
    if (!state.inFree) return;
    state.inFree = false;
    state.freeRemaining = 0;
    state.locked = false;
    hideBonusOverlay();
    setStatus(
      `FREE PROTOCOL COMPLETE // 免费旋转共赢得 ${formatInt(state.freeSessionWin)} 虚拟筹码`,
      state.freeSessionWin > 0 ? "win" : ""
    );
    updateHud();
    saveSession();
  }

  function handleSpin() {
    if (state.locked || state.phase === "spinning") return;
    if (dom.resetDialog && dom.resetDialog.open) return;
    if (state.inFree) {
      beginSpin({ free: true });
      return;
    }
    if (state.credits < currentBet()) {
      setStatus("LOW BALANCE // 余额不足，请降低投注或点击 RESET", "error");
      audio.play("error");
      return;
    }
    state.lastWin = 0;
    updateHud();
    beginSpin({ free: false });
  }

  function changeBet(direction) {
    if (state.locked || state.inFree || state.phase === "spinning") return;
    const next = clamp(state.betIndex + direction, 0, BETS.length - 1);
    if (next === state.betIndex) return;
    if (BETS[next] > state.credits) {
      setStatus("LOW BALANCE // 该投注档位高于当前余额", "error");
      audio.play("error");
      return;
    }
    state.betIndex = next;
    state.lastWin = 0;
    state.showWin = false;
    updateHud();
    updateCanvasLabel(null);
    saveSession();
    audio.play("ui");
    setStatus(
      `BET SET // 总投注 ${formatInt(currentBet())} · 每线 ${formatInt(currentBet() / 10)}`,
      ""
    );
  }

  function resetSession() {
    clearTimers();
    state.credits = START_CREDITS;
    state.betIndex = DEFAULT_BET_INDEX;
    state.totalSpins = 0;
    state.bestWin = 0;
    state.phase = "idle";
    state.locked = false;
    state.spin = null;
    state.inFree = false;
    state.freeRemaining = 0;
    state.freeAwarded = 0;
    state.freeSessionWin = 0;
    state.lastWin = 0;
    state.showWin = false;
    state.winLines = [];
    state.scatterCells = [];
    state.scatterCount = 0;
    state.result = null;
    state.grid = NV.generateIdleGrid(secureRandom);
    hideBonusOverlay();
    renderer.clearEffects();
    updateCanvasLabel(null);
    updateHud();
    updateToggleState();
    saveSession();
    audio.play("ui");
    setStatus("SESSION RESET // 本地会话已重置 · 5,000 虚拟筹码", "");
  }

  /* ------------------------------------------------------------------------
     Rendering loop
     ------------------------------------------------------------------------ */
  function drawFrame(now) {
    if (document.hidden) {
      rafId = 0;
      return;
    }
    renderer.draw(state, now, { reducedMotion: prefersReducedMotion() });
    rafId = window.requestAnimationFrame(drawFrame);
  }

  function startLoop() {
    if (rafId || document.hidden) return;
    rafId = window.requestAnimationFrame(drawFrame);
  }

  function stopLoop() {
    if (!rafId) return;
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function resizeRenderer() {
    renderer.resize();
    if (!rafId) renderer.draw(state, performance.now(), { reducedMotion: prefersReducedMotion() });
  }

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(resizeRenderer);
    resizeObserver.observe(dom.reelsCanvas.parentElement || dom.reelsCanvas);
  }
  window.addEventListener("resize", resizeRenderer, { passive: true });
  window.addEventListener("orientationchange", resizeRenderer, { passive: true });

  if ("IntersectionObserver" in window) {
    const visibilityObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      rendererVisible = entry ? entry.isIntersecting : true;
      if (rendererVisible && !document.hidden) startLoop();
      else stopLoop();
    }, { rootMargin: "120px" });
    visibilityObserver.observe(dom.reelsCanvas.parentElement || dom.reelsCanvas);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopLoop();
      return;
    }
    resizeRenderer();
    if (rendererVisible) startLoop();
  });

  if (reducedMotion.addEventListener) {
    reducedMotion.addEventListener("change", () => {
      if (prefersReducedMotion()) {
        document.querySelectorAll(".reveal").forEach((element) => {
          element.classList.add("is-visible");
        });
      }
      resizeRenderer();
      startLoop();
    });
  }

  /* ------------------------------------------------------------------------
     Reveal animations
     ------------------------------------------------------------------------ */
  const revealElements = document.querySelectorAll(".reveal");
  if (!prefersReducedMotion() && "IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -7% 0px", threshold: 0.08 });
    revealElements.forEach((element) => revealObserver.observe(element));
  } else {
    revealElements.forEach((element) => element.classList.add("is-visible"));
  }

  /* ------------------------------------------------------------------------
     Events
     ------------------------------------------------------------------------ */
  loadSession();
  audio.setEnabled(state.sound);
  updateToggleState();
  updateHud();
  updateCanvasLabel(null);
  renderer.resize();
  renderer.draw(state, performance.now(), { reducedMotion: prefersReducedMotion() });
  startLoop();
  saveSession();

  if (restoredSession) {
    setStatus(
      state.credits >= currentBet()
        ? "SYSTEM READY // 已恢复本地会话 · 按 SPACE 启动转轴"
        : "SYSTEM READY // 余额不足 · 点击 RESET 重新注资",
      state.credits >= currentBet() ? "" : "error"
    );
  } else {
    setStatus("SYSTEM READY // 点击 SPIN 启动转轴", "");
  }

  dom.spinBtn.addEventListener("click", handleSpin);
  dom.betDown.addEventListener("click", () => changeBet(-1));
  dom.betUp.addEventListener("click", () => changeBet(1));

  dom.turboBtn.addEventListener("click", () => {
    if (state.locked) return;
    state.turbo = !state.turbo;
    updateToggleState();
    updateHud();
    saveSession();
    audio.play("ui");
    setStatus(state.turbo
      ? "TURBO ONLINE // 快速旋转已开启"
      : "TURBO OFFLINE // 快速旋转已关闭", "");
  });

  dom.soundBtn.addEventListener("click", () => {
    state.sound = !state.sound;
    audio.setEnabled(state.sound);
    if (state.sound) audio.play("ui");
    updateToggleState();
    saveSession();
    setStatus(state.sound
      ? "AUDIO ONLINE // 音效已开启"
      : "AUDIO MUTED // 音效已关闭", "");
  });

  dom.reelsCanvas.addEventListener("pointerdown", () => {
    machine.focus({ preventScroll: true });
    audio.unlock();
  });

  document.addEventListener("pointerdown", () => audio.unlock(), { passive: true });

  const resetDialog = dom.resetDialog;
  if (resetDialog) {
    dom.resetBtn.addEventListener("click", () => {
      audio.play("ui");
      if (typeof resetDialog.showModal === "function") {
        resetDialog.returnValue = "";
        resetDialog.showModal();
      } else if (window.confirm("重置本局？虚拟筹码将恢复至 5,000，旋转次数与最高赢得会清零。")) {
        resetSession();
      }
    });
    resetDialog.addEventListener("close", () => {
      if (resetDialog.returnValue === "confirm") {
        resetSession();
        dom.resetBtn.focus({ preventScroll: true });
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (resetDialog && resetDialog.open) return;
    const target = event.target;
    const withinMachine = target instanceof Node && machine.contains(target);
    if (!withinMachine) return;

    if (event.code === "Space" || event.key === " ") {
      if (target.closest("button, a, summary, input, textarea, select, [contenteditable='true']")) {
        return;
      }
      event.preventDefault();
      handleSpin();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      changeBet(event.key === "ArrowUp" ? 1 : -1);
    }
  });

  document.querySelectorAll(".mobile-nav a").forEach((link) => {
    link.addEventListener("click", () => {
      const details = link.closest("details");
      if (details) details.open = false;
    });
  });

  if (dom.copyrightYear) dom.copyrightYear.textContent = String(new Date().getFullYear());

  /* ------------------------------------------------------------------------
     Debug-only RTP simulator
     Usage: NV.debug.simulateRTP(1000000)
     It never changes the player's balance or local save.
     ------------------------------------------------------------------------ */
  function createSeededRandom(seed) {
    let value = Number(seed) >>> 0;
    return function seededRandom() {
      value += 0x6D2B79F5;
      let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  function simulateRTP(spins = 200000, options = {}) {
    const count = Math.max(1, Math.min(5000000, Math.floor(Number(spins) || 200000)));
    const bet = BETS.indexOf(options.bet) >= 0 ? options.bet : 100;
    const random = options.seed === undefined
      ? Math.random
      : createSeededRandom(options.seed);
    let wagered = 0;
    let payout = 0;
    let basePayout = 0;
    let freePayout = 0;
    let triggers = 0;
    let freeSpinsPlayed = 0;
    let maxWin = 0;

    for (let index = 0; index < count; index += 1) {
      wagered += bet;
      const base = NV.evaluateGrid(NV.generateGrid(random), bet, 1);
      payout += base.totalWin;
      basePayout += base.totalWin;
      if (base.totalWin > maxWin) maxWin = base.totalWin;

      if (base.freeSpins > 0) {
        triggers += 1;
        let remaining = base.freeSpins;
        while (remaining > 0) {
          remaining -= 1;
          freeSpinsPlayed += 1;
          const free = NV.evaluateGrid(NV.generateGrid(random), bet, FREE_MULTIPLIER);
          payout += free.totalWin;
          freePayout += free.totalWin;
          if (free.totalWin > maxWin) maxWin = free.totalWin;
          remaining += free.retriggerSpins;
        }
      }
    }

    return {
      spins: count,
      bet,
      wagered,
      payout,
      rtp: Number(((payout / wagered) * 100).toFixed(3)),
      baseRtp: Number(((basePayout / wagered) * 100).toFixed(3)),
      freeRtp: Number(((freePayout / wagered) * 100).toFixed(3)),
      triggerRate: Number(((triggers / count) * 100).toFixed(4)),
      freeSpinsPlayed,
      averageFreeSpins: triggers ? Number((freeSpinsPlayed / triggers).toFixed(2)) : 0,
      maxWin,
      seed: options.seed === undefined ? null : options.seed
    };
  }

  NV.debug = Object.assign(NV.debug || {}, {
    simulateRTP,
    snapshot() {
      return {
        credits: state.credits,
        bet: currentBet(),
        betIndex: state.betIndex,
        phase: state.phase,
        locked: state.locked,
        inFree: state.inFree,
        freeRemaining: state.freeRemaining,
        lastWin: state.lastWin,
        totalSpins: state.totalSpins,
        bestWin: state.bestWin,
        sound: state.sound,
        turbo: state.turbo
      };
    }
  });
})();
