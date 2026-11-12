/* ==========================================================================
   NEON VAULT — core rules, RNG and shared helpers
   No dependencies. Runs directly from a static file. Virtual credits only.
   ========================================================================== */
(function () {
  "use strict";

  const NV = window.NV = window.NV || {};

  const START_CREDITS = 5000;
  const BETS = [20, 50, 100, 250, 500, 1000];
  const DEFAULT_BET_INDEX = 2;
  const FREE_MULTIPLIER = 2;
  const PAYLINES = [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [0, 0, 1, 0, 0],
    [2, 2, 1, 2, 2],
    [1, 0, 0, 0, 1],
    [1, 2, 2, 2, 1],
    [0, 1, 0, 1, 0]
  ];
  const LINE_COLORS = [
    "#38f6ff", "#ff2fb3", "#dcff32", "#8cffb7", "#ffb344",
    "#8b7cff", "#5ba7ff", "#ff7c52", "#ff86d7", "#61f2a1"
  ];

  const SYMBOLS = {
    chip: {
      label: "CHIP",
      cn: "芯片",
      weight: 26,
      color: "#5ba7ff",
      pays: { 3: 2, 4: 10, 5: 50 }
    },
    dice: {
      label: "DICE",
      cn: "骰子",
      weight: 22,
      color: "#ff86d7",
      pays: { 3: 3, 4: 15, 5: 75 }
    },
    mask: {
      label: "ONI",
      cn: "鬼面",
      weight: 16,
      color: "#ffb344",
      pays: { 3: 5, 4: 25, 5: 120 }
    },
    katana: {
      label: "KATANA",
      cn: "武士刀",
      weight: 11,
      color: "#38f6ff",
      pays: { 3: 10, 4: 50, 5: 250 }
    },
    skull: {
      label: "SKULL",
      cn: "骷髅",
      weight: 7,
      color: "#8cffb7",
      pays: { 3: 20, 4: 100, 5: 500 }
    },
    wild: {
      label: "WILD",
      cn: "狂野",
      weight: 3,
      color: "#dcff32",
      pays: { 3: 50, 4: 250, 5: 2000 }
    },
    scatter: {
      label: "VAULT",
      cn: "金库",
      weight: 2,
      color: "#ffd76d",
      pays: null
    }
  };

  const SYMBOL_IDS = Object.keys(SYMBOLS);
  const SYMBOL_WEIGHT_TOTAL = SYMBOL_IDS.reduce((sum, id) => sum + SYMBOLS[id].weight, 0);
  const SCATTER_PAYS = { 3: 2, 4: 5, 5: 20 };
  const FREE_SPINS = { 3: 8, 4: 12, 5: 20 };
  const RETRIGGER_SPINS = { 3: 2, 4: 4, 5: 8 };
  const RTP_SIMULATION = 97.2;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
  }

  function formatInt(value) {
    const number = Math.round(Number(value) || 0);
    return number.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  function hexAlpha(hex, alpha) {
    const raw = String(hex).replace("#", "");
    const full = raw.length === 3
      ? raw.split("").map((char) => char + char).join("")
      : raw;
    const number = Number.parseInt(full, 16);
    if (!Number.isFinite(number)) return `rgba(255,255,255,${alpha})`;
    const r = (number >> 16) & 255;
    const g = (number >> 8) & 255;
    const b = number & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /**
   * Weighted, left-to-right slot evaluation.
   * @param {string[][]} grid Five columns, three rows each.
   * @param {number} totalBet Total virtual credits wagered.
   * @param {number} multiplier 1 for base play, 2 during free spins.
   */
  function evaluateGrid(grid, totalBet, multiplier = 1) {
    const lineBet = totalBet / PAYLINES.length;
    const lineWins = [];
    let lineTotal = 0;

    for (let index = 0; index < PAYLINES.length; index += 1) {
      const rows = PAYLINES[index];
      const sequence = rows.map((row, col) => grid[col][row]);
      if (sequence[0] === "scatter") continue;

      let base;
      if (sequence[0] === "wild") {
        base = sequence.find((symbol) => symbol !== "wild" && symbol !== "scatter") || "wild";
      } else {
        base = sequence[0];
      }

      let count = 0;
      while (count < sequence.length && (sequence[count] === base || sequence[count] === "wild")) {
        count += 1;
      }
      if (count < 3) continue;

      const payTable = SYMBOLS[base] && SYMBOLS[base].pays;
      const pay = payTable && payTable[count];
      if (!pay) continue;

      const amount = Math.round(pay * lineBet * multiplier);
      lineTotal += amount;
      lineWins.push({
        lineIndex: index,
        line: index + 1,
        symbol: base,
        count,
        amount,
        rows
      });
    }

    const scatterCells = [];
    for (let col = 0; col < grid.length; col += 1) {
      for (let row = 0; row < grid[col].length; row += 1) {
        if (grid[col][row] === "scatter") scatterCells.push({ col, row });
      }
    }

    const scatterCount = scatterCells.length;
    const tier = Math.min(scatterCount, 5);
    const scatterWin = scatterCount >= 3
      ? Math.round(SCATTER_PAYS[tier] * totalBet * multiplier)
      : 0;
    const totalWin = lineTotal + scatterWin;
    const freeSpins = scatterCount >= 3 ? FREE_SPINS[tier] : 0;
    const retriggerSpins = scatterCount >= 3 ? RETRIGGER_SPINS[tier] : 0;

    return {
      grid,
      lineWins,
      lineTotal,
      scatterCells,
      scatterCount,
      scatterWin,
      freeSpins,
      retriggerSpins,
      tier,
      totalWin,
      multiplier,
      lineBet
    };
  }

  function pickWeighted(randomFn) {
    let roll = randomFn() * SYMBOL_WEIGHT_TOTAL;
    for (let index = 0; index < SYMBOL_IDS.length; index += 1) {
      const id = SYMBOL_IDS[index];
      roll -= SYMBOLS[id].weight;
      if (roll < 0) return id;
    }
    return SYMBOL_IDS[SYMBOL_IDS.length - 1];
  }

  function generateGrid(randomFn = Math.random) {
    const grid = [];
    for (let col = 0; col < 5; col += 1) {
      const column = [];
      for (let row = 0; row < 3; row += 1) {
        column.push(pickWeighted(randomFn));
      }
      grid.push(column);
    }
    return grid;
  }

  function generateIdleGrid(randomFn = Math.random) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const grid = generateGrid(randomFn);
      const outcome = evaluateGrid(grid, 100, 1);
      if (outcome.lineWins.length === 0 && outcome.scatterCount < 3) {
        return grid;
      }
    }
    return generateGrid(randomFn);
  }

  function describeGrid(grid) {
    return grid.map((column, index) => {
      const symbols = column.map((id) => SYMBOLS[id].cn).join("、");
      return `第${index + 1}列 ${symbols}`;
    }).join("；");
  }

  function createSecureRandom() {
    const cryptoObject = window.crypto || window.msCrypto;
    if (!cryptoObject || typeof cryptoObject.getRandomValues !== "function") {
      return Math.random;
    }
    const buffer = new Uint32Array(1);
    return function secureRandom() {
      cryptoObject.getRandomValues(buffer);
      return buffer[0] / 4294967296;
    };
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  NV.CONFIG = {
    START_CREDITS,
    BETS,
    DEFAULT_BET_INDEX,
    FREE_MULTIPLIER,
    PAYLINES,
    LINE_COLORS,
    SYMBOLS,
    SYMBOL_IDS,
    SCATTER_PAYS,
    FREE_SPINS,
    RETRIGGER_SPINS,
    RTP_SIMULATION
  };
  NV.util = { clamp, easeOutCubic, formatInt, hexAlpha, prefersReducedMotion };
  NV.evaluateGrid = evaluateGrid;
  NV.generateGrid = generateGrid;
  NV.generateIdleGrid = generateIdleGrid;
  NV.describeGrid = describeGrid;
  NV.createSecureRandom = createSecureRandom;
})();
