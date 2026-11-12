/* ==========================================================================
   NEON VAULT — Canvas renderer
   Draws the machine matrix, reel motion, win paths and particles.
   ========================================================================== */
(function () {
  "use strict";

  const NV = window.NV = window.NV || {};
  const {
    PAYLINES,
    LINE_COLORS,
    SYMBOLS
  } = NV.CONFIG;
  const { clamp, hexAlpha } = NV.util;
  const TAU = Math.PI * 2;
  const MONO = '"Cascadia Code", "Cascadia Mono", Consolas, monospace';
  const DISPLAY = 'Impact, "Arial Black", "Arial Narrow Bold", sans-serif';

  function roundRect(g, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + width - r, y);
    g.quadraticCurveTo(x + width, y, x + width, y + r);
    g.lineTo(x + width, y + height - r);
    g.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    g.lineTo(x + r, y + height);
    g.quadraticCurveTo(x, y + height, x, y + height - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  function makeLayout(width, height) {
    const edge = clamp(width * 0.028, 10, 36);
    const gap = clamp(width * 0.009, 4, 10);
    const header = clamp(height * 0.062, 19, 47);
    const top = header + clamp(height * 0.016, 4, 11);
    const bottom = clamp(height * 0.042, 9, 30);
    const gridWidth = width - edge * 2;
    const gridHeight = Math.max(80, height - top - bottom);
    const cellWidth = (gridWidth - gap * 4) / 5;
    const cellHeight = (gridHeight - gap * 2) / 3;
    const columns = [];
    const rows = [];
    for (let col = 0; col < 5; col += 1) {
      columns.push(edge + col * (cellWidth + gap));
    }
    for (let row = 0; row < 3; row += 1) {
      rows.push(top + row * (cellHeight + gap));
    }
    return {
      width,
      height,
      edge,
      gap,
      header,
      top,
      bottom,
      gridWidth,
      gridHeight,
      cellWidth,
      cellHeight,
      columns,
      rows
    };
  }

  function createRenderer(canvas) {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return null;

    let pixelRatio = 1;
    let width = 0;
    let height = 0;
    let layout = null;
    let lastDrawAt = 0;
    let flash = 0;
    let particles = [];
    let reducedMotion = false;
    const cache = NV.art.createCache(() => pixelRatio);

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const parentRect = canvas.parentElement
        ? canvas.parentElement.getBoundingClientRect()
        : { width: 0, height: 0 };
      const nextWidth = Math.max(280, Math.round(rect.width || parentRect.width || 280));
      const nextHeight = Math.max(
        180,
        Math.round(rect.height || parentRect.height || nextWidth * (720 / 1120))
      );
      const nextDpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const backingWidth = Math.round(nextWidth * nextDpr);
      const backingHeight = Math.round(nextHeight * nextDpr);

      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
      }

      if (
        width !== nextWidth ||
        height !== nextHeight ||
        pixelRatio !== nextDpr
      ) {
        cache.clear();
        particles = [];
        flash = 0;
        lastDrawAt = 0;
      }

      width = nextWidth;
      height = nextHeight;
      pixelRatio = nextDpr;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.imageSmoothingEnabled = true;
      if ("imageSmoothingQuality" in context) context.imageSmoothingQuality = "high";
      layout = makeLayout(width, height);
      return layout;
    }

    function drawIcon(id, x, y, size, alpha = 1, scale = 1) {
      const entry = cache.get(id, size);
      context.save();
      context.globalAlpha = alpha;
      context.translate(x, y);
      context.scale(scale, scale);
      context.drawImage(
        entry.bitmap,
        -entry.cssSize / 2,
        -entry.cssSize / 2,
        entry.cssSize,
        entry.cssSize
      );
      context.restore();
    }

    function drawBackground(now) {
      const bg = context.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, "#04060c");
      bg.addColorStop(0.48, "#070812");
      bg.addColorStop(1, "#090611");
      context.fillStyle = bg;
      context.fillRect(0, 0, width, height);

      context.save();
      context.globalCompositeOperation = "screen";
      const cyanGlow = context.createRadialGradient(
        width * 0.13, height * 0.44, 0,
        width * 0.13, height * 0.44, width * 0.48
      );
      cyanGlow.addColorStop(0, "rgba(56,246,255,.075)");
      cyanGlow.addColorStop(0.5, "rgba(56,246,255,.018)");
      cyanGlow.addColorStop(1, "rgba(56,246,255,0)");
      context.fillStyle = cyanGlow;
      context.fillRect(0, 0, width, height);

      const magentaGlow = context.createRadialGradient(
        width * 0.88, height * 0.64, 0,
        width * 0.88, height * 0.64, width * 0.55
      );
      magentaGlow.addColorStop(0, "rgba(255,47,179,.065)");
      magentaGlow.addColorStop(0.52, "rgba(255,47,179,.015)");
      magentaGlow.addColorStop(1, "rgba(255,47,179,0)");
      context.fillStyle = magentaGlow;
      context.fillRect(0, 0, width, height);
      context.restore();

      context.save();
      context.strokeStyle = "rgba(114, 221, 255, .032)";
      context.lineWidth = 1;
      const step = Math.max(22, width * 0.032);
      for (let x = width * 0.5; x < width; x += step) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x + width * 0.1, height);
        context.stroke();
      }
      context.restore();

      const horizon = context.createLinearGradient(0, height * 0.75, 0, height);
      horizon.addColorStop(0, "rgba(3,3,8,0)");
      horizon.addColorStop(1, "rgba(2,2,6,.72)");
      context.fillStyle = horizon;
      context.fillRect(0, 0, width, height);

      context.save();
      const sweepX = ((now * 0.018) % (width + 260)) - 130;
      const sweep = context.createLinearGradient(sweepX - 80, 0, sweepX + 80, 0);
      sweep.addColorStop(0, "rgba(120,248,255,0)");
      sweep.addColorStop(0.5, "rgba(120,248,255,.018)");
      sweep.addColorStop(1, "rgba(120,248,255,0)");
      context.fillStyle = sweep;
      context.fillRect(0, 0, width, height);
      context.restore();
    }

    function drawHeader(now, state) {
      const fontSize = clamp(width * 0.0095, 6, 9.5);
      const y = layout.header * 0.58;
      const left = layout.edge;
      const right = width - layout.edge;
      const pulse = 0.65 + Math.sin(now * 0.0035) * 0.25;

      context.save();
      context.textBaseline = "middle";
      context.font = `600 ${fontSize}px ${MONO}`;
      context.fillStyle = "rgba(168, 216, 234, .64)";
      context.textAlign = "left";
      context.fillText("NV-88 // MATRIX", left, y);

      context.beginPath();
      context.arc(left + 4, y - fontSize * 0.95, 1.8, 0, TAU);
      context.fillStyle = hexAlpha(state.inFree ? "#ff2fb3" : "#38f6ff", pulse);
      context.shadowColor = state.inFree ? "#ff2fb3" : "#38f6ff";
      context.shadowBlur = 8;
      context.fill();
      context.shadowBlur = 0;

      let status = "CRYPTO RNG // LOCAL";
      let statusColor = "rgba(147, 195, 214, .48)";
      if (state.inFree) {
        status = "FREE PROTOCOL // x2";
        statusColor = "rgba(255, 134, 215, .8)";
      }
      if (state.phase === "spinning") {
        status = "DECODING // SIGNAL";
        statusColor = "rgba(56, 246, 255, .82)";
      } else if (state.showWin) {
        status = "PAYOUT // LOCKED";
        statusColor = "rgba(220, 255, 50, .82)";
      }
      context.font = `500 ${fontSize}px ${MONO}`;
      context.fillStyle = statusColor;
      context.textAlign = "right";
      context.fillText(status, right, y);

      const headerLine = context.createLinearGradient(left, 0, right, 0);
      headerLine.addColorStop(0, "rgba(56,246,255,.24)");
      headerLine.addColorStop(0.4, "rgba(130,216,255,.08)");
      headerLine.addColorStop(0.75, "rgba(255,47,179,.12)");
      headerLine.addColorStop(1, "rgba(255,47,179,.2)");
      context.strokeStyle = headerLine;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(left, layout.header - 1);
      context.lineTo(right, layout.header - 1);
      context.stroke();

      context.fillStyle = "rgba(136, 173, 193, .32)";
      const tickY = layout.header - 1;
      for (let col = 0; col < 5; col += 1) {
        const x = layout.columns[col] + layout.cellWidth / 2;
        context.fillRect(x, tickY, 1, 3);
      }
      context.restore();
    }

    function drawColumnBackdrops() {
      const { columns, rows, cellWidth, cellHeight, gap, top, gridHeight } = layout;
      for (let col = 0; col < columns.length; col += 1) {
        const x = columns[col] - gap * 0.42;
        const y = top - gap * 0.52;
        const w = cellWidth + gap * 0.84;
        const h = gridHeight + gap * 1.04;
        const gradient = context.createLinearGradient(0, y, 0, y + h);
        gradient.addColorStop(0, "rgba(13, 22, 34, .98)");
        gradient.addColorStop(0.52, "rgba(7, 12, 20, .98)");
        gradient.addColorStop(1, "rgba(9, 9, 17, .98)");

        roundRect(context, x, y, w, h, Math.max(3, cellWidth * 0.035));
        context.fillStyle = gradient;
        context.fill();
        context.strokeStyle = "rgba(102, 211, 242, .17)";
        context.lineWidth = 1;
        context.stroke();

        const accent = context.createLinearGradient(x, 0, x + w, 0);
        accent.addColorStop(0, "rgba(56,246,255,.38)");
        accent.addColorStop(0.8, "rgba(56,246,255,.06)");
        accent.addColorStop(1, "rgba(255,47,179,.2)");
        context.strokeStyle = accent;
        context.beginPath();
        context.moveTo(x + w * 0.13, y + 0.5);
        context.lineTo(x + w * 0.82, y + 0.5);
        context.stroke();

        context.fillStyle = "rgba(255,255,255,.02)";
        context.fillRect(columns[col], top, cellWidth, cellHeight * 0.08);

        context.strokeStyle = "rgba(120, 215, 255, .06)";
        context.beginPath();
        for (let row = 1; row < 3; row += 1) {
          const lineY = rows[row] - gap * 0.5;
          context.moveTo(columns[col] + 8, lineY);
          context.lineTo(columns[col] + cellWidth - 8, lineY);
        }
        context.stroke();
      }

      const corner = Math.min(18, cellWidth * 0.15);
      context.save();
      context.strokeStyle = "rgba(56,246,255,.33)";
      context.lineWidth = 1;
      const left = columns[0] - gap * 0.42;
      const rightX = columns[4] + cellWidth + gap * 0.42;
      const topY = top - gap * 0.52;
      const bottomY = top + gridHeight + gap * 0.52;
      context.beginPath();
      context.moveTo(left, topY + corner);
      context.lineTo(left, topY);
      context.lineTo(left + corner, topY);
      context.moveTo(rightX - corner, bottomY);
      context.lineTo(rightX, bottomY);
      context.lineTo(rightX, bottomY - corner);
      context.stroke();
      context.restore();
    }

    function drawSymbolCell(state, col, row, options = {}) {
      const id = state.grid[col][row];
      const symbol = SYMBOLS[id];
      const baseX = layout.columns[col];
      const baseY = layout.rows[row];
      const centreX = baseX + layout.cellWidth / 2;
      const centreY = baseY + layout.cellHeight / 2 - layout.cellHeight * 0.015;
      const iconSize = Math.min(layout.cellWidth * 0.69, layout.cellHeight * 0.74) * (options.scale || 1);
      const alpha = options.alpha === undefined ? 1 : options.alpha;
      const float = options.float
        ? Math.sin(options.now * 0.0013 + col * 0.9 + row * 1.4) * Math.min(1.25, layout.cellHeight * 0.007)
        : 0;

      drawIcon(id, centreX, centreY + float, iconSize, alpha);

      if (width > 410) {
        const labelSize = clamp(layout.cellWidth * 0.04, 5.5, 8);
        context.save();
        context.font = `500 ${labelSize}px ${MONO}`;
        context.textAlign = "right";
        context.textBaseline = "alphabetic";
        context.fillStyle = hexAlpha(options.labelColor || symbol.color, options.labelAlpha || 0.5);
        context.fillText(symbol.label, baseX + layout.cellWidth - Math.max(6, layout.cellWidth * 0.06), baseY + layout.cellHeight - Math.max(5, layout.cellHeight * 0.045));
        context.restore();
      }
    }

    function drawWinningBackdrop(col, row, color, age) {
      const x = layout.columns[col];
      const y = layout.rows[row];
      const inset = Math.max(2, layout.cellWidth * 0.018);
      const pulse = 0.72 + Math.sin(age * 0.006) * 0.18;
      context.save();
      roundRect(
        context,
        x + inset, y + inset,
        layout.cellWidth - inset * 2,
        layout.cellHeight - inset * 2,
        Math.max(3, layout.cellWidth * 0.035)
      );
      context.fillStyle = hexAlpha(color, 0.07);
      context.fill();
      context.strokeStyle = hexAlpha(color, pulse);
      context.lineWidth = 1.2;
      context.shadowColor = color;
      context.shadowBlur = 13;
      context.stroke();
      context.shadowBlur = 0;

      context.beginPath();
      context.moveTo(x + layout.cellWidth - inset - 11, y + inset + 7);
      context.lineTo(x + layout.cellWidth - inset - 7, y + inset + 7);
      context.lineTo(x + layout.cellWidth - inset - 7, y + inset + 11);
      context.strokeStyle = hexAlpha(color, 0.78);
      context.lineWidth = 1;
      context.stroke();
      context.restore();
    }

    function drawIdleGrid(state, now) {
      const float = state.phase === "idle" && !state.showWin;
      for (let col = 0; col < 5; col += 1) {
        for (let row = 0; row < 3; row += 1) {
          drawSymbolCell(state, col, row, { float, now });
        }
      }
    }

    function drawMotionColumn(state, col, now) {
      const spin = state.spin;
      const start = spin.start;
      const stop = spin.start + spin.stops[col];
      const age = now - stop;
      const elapsed = Math.max(0, now - start);
      const progress = clamp(elapsed / spin.stops[col], 0, 1);
      const x = layout.columns[col];
      const iconSize = Math.min(layout.cellWidth * 0.69, layout.cellHeight * 0.74);
      const bouncePhase = age >= 0 ? clamp(age / 300, 0, 1) : 0;
      const bounce = age >= 0 ? 1 + (1 - NV.util.easeOutCubic(bouncePhase)) * 0.055 : 1;

      context.save();
      roundRect(
        context,
        x - 1,
        layout.top - 1,
        layout.cellWidth + 2,
        layout.gridHeight + 2,
        Math.max(3, layout.cellWidth * 0.035)
      );
      context.clip();

      if (age < 0) {
        const strip = spin.strips[col];
        const loop = strip.length * layout.cellHeight;
        const distance = loop * (1.3 + col * 0.09);
        const eased = NV.util.easeOutCubic(progress);
        const scroll = eased * distance + elapsed * (state.turbo ? 0.23 : 0.13);
        const offset = scroll % loop;
        const shift = offset % layout.cellHeight;
        const startIndex = Math.floor(offset / layout.cellHeight);
        const visibleRows = Math.ceil(layout.gridHeight / layout.cellHeight) + 3;

        for (let n = -1; n <= visibleRows; n += 1) {
          const stripIndex = ((startIndex + n) % strip.length + strip.length) % strip.length;
          const y = layout.top + n * layout.cellHeight - shift;
          if (y > layout.top - layout.cellHeight && y < layout.top + layout.gridHeight + layout.cellHeight) {
            drawIcon(
              strip[stripIndex],
              x + layout.cellWidth / 2,
              y + layout.cellHeight / 2,
              iconSize,
              0.93
            );
          }
        }

        const blurred = context.createLinearGradient(0, layout.top, 0, layout.top + layout.cellHeight * 1.2);
        blurred.addColorStop(0, "rgba(5, 7, 13, .5)");
        blurred.addColorStop(1, "rgba(5, 7, 13, 0)");
        context.fillStyle = blurred;
        context.fillRect(x, layout.top, layout.cellWidth, layout.cellHeight * 1.2);

        const flicker = 0.04 + (Math.sin(now * 0.09 + col) * 0.5 + 0.5) * 0.055;
        context.fillStyle = `rgba(120, 247, 255, ${flicker})`;
        for (let n = 0; n < 4; n += 1) {
          const lineX = x + layout.cellWidth * (0.15 + n * 0.22);
          context.fillRect(lineX, layout.top + layout.cellHeight * 0.2, 1, layout.gridHeight * 0.6);
        }
      } else {
        for (let row = 0; row < 3; row += 1) {
          const float = 0;
          drawSymbolCell(state, col, row, {
            scale: bounce,
            now,
            float,
            alpha: 1
          });
        }
      }

      const fadeTop = context.createLinearGradient(0, layout.top, 0, layout.top + layout.cellHeight * 0.7);
      fadeTop.addColorStop(0, "rgba(5, 7, 13, .62)");
      fadeTop.addColorStop(1, "rgba(5, 7, 13, 0)");
      context.fillStyle = fadeTop;
      context.fillRect(x, layout.top, layout.cellWidth, layout.cellHeight * 0.7);

      const fadeBottom = context.createLinearGradient(0, layout.top + layout.gridHeight - layout.cellHeight * 0.55, 0, layout.top + layout.gridHeight);
      fadeBottom.addColorStop(0, "rgba(5, 7, 13, 0)");
      fadeBottom.addColorStop(1, "rgba(5, 7, 13, .58)");
      context.fillStyle = fadeBottom;
      context.fillRect(x, layout.top + layout.gridHeight - layout.cellHeight * 0.55, layout.cellWidth, layout.cellHeight * 0.55);

      if (age >= 0 && age < 190) {
        const stopFlash = 1 - age / 190;
        context.fillStyle = `rgba(139, 251, 255, ${stopFlash * 0.09})`;
        context.fillRect(x, layout.top, layout.cellWidth, layout.gridHeight);
        context.fillStyle = `rgba(220, 255, 255, ${stopFlash * 0.6})`;
        context.fillRect(x + 9, layout.top + 1, layout.cellWidth - 18, 1);
      }
      context.restore();
    }

    function drawMatrix(state, now) {
      const spinning = state.phase === "spinning";
      const winMap = buildWinMap(state);

      if (!spinning) {
        drawIdleGrid(state, now);
      } else {
        for (let col = 0; col < 5; col += 1) {
          drawMotionColumn(state, col, now);
        }
      }

      if (state.showWin && winMap.size > 0) {
        for (let col = 0; col < 5; col += 1) {
          for (let row = 0; row < 3; row += 1) {
            if (winMap.has(`${col}:${row}`)) continue;
            const x = layout.columns[col];
            const y = layout.rows[row];
            roundRect(
              context,
              x + 1, y + 1,
              layout.cellWidth - 2,
              layout.cellHeight - 2,
              Math.max(2, layout.cellWidth * 0.03)
            );
            context.fillStyle = "rgba(2, 4, 9, .48)";
            context.fill();
          }
        }

        winMap.forEach((entry, key) => {
          const [col, row] = key.split(":").map(Number);
          drawWinningBackdrop(col, row, entry.color, now);
        });
      }

      if (state.showWin) {
        drawWinPaths(state, now);
      }

      drawColumnEdges();
    }

    function buildWinMap(state) {
      const map = new Map();
      if (!state.winLines) return map;
      for (const win of state.winLines) {
        const color = LINE_COLORS[win.lineIndex % LINE_COLORS.length];
        for (let col = 0; col < win.count; col += 1) {
          const row = PAYLINES[win.lineIndex][col];
          const key = `${col}:${row}`;
          if (!map.has(key)) map.set(key, { color, wins: [win] });
          else map.get(key).wins.push(win);
        }
      }
      if (state.scatterCount >= 3 && state.scatterCells) {
        for (const cell of state.scatterCells) {
          const key = `${cell.col}:${cell.row}`;
          if (!map.has(key)) map.set(key, { color: "#ffd76d", wins: [], scatter: true });
        }
      }
      return map;
    }

    function drawWinPaths(state, now) {
      if (!state.winLines || !state.winLines.length) return;
      context.save();
      for (let index = 0; index < state.winLines.length; index += 1) {
        const win = state.winLines[index];
        const color = LINE_COLORS[win.lineIndex % LINE_COLORS.length];
        const pulse = 0.72 + Math.sin(now * 0.006 + index) * 0.13;
        const points = [];
        for (let col = 0; col < win.count; col += 1) {
          const row = PAYLINES[win.lineIndex][col];
          points.push({
            x: layout.columns[col] + layout.cellWidth / 2,
            y: layout.rows[row] + layout.cellHeight / 2
          });
        }
        if (points.length < 2) continue;

        context.save();
        context.strokeStyle = hexAlpha(color, pulse);
        context.lineWidth = clamp(layout.cellWidth * 0.011, 1.3, 2.8);
        context.shadowColor = color;
        context.shadowBlur = 12;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.setLineDash([6, 6]);
        context.lineDashOffset = -((now * 0.025) % 12);
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
          context.lineTo(points[pointIndex].x, points[pointIndex].y);
        }
        context.stroke();
        context.setLineDash([]);
        context.shadowBlur = 0;

        points.forEach((point, pointIndex) => {
          context.beginPath();
          context.arc(point.x, point.y, clamp(layout.cellWidth * 0.021, 2, 4.6), 0, TAU);
          context.fillStyle = "rgba(4, 6, 11, .92)";
          context.fill();
          context.strokeStyle = hexAlpha(color, 0.94);
          context.lineWidth = 1.3;
          context.stroke();
          if (pointIndex === 0) {
            context.beginPath();
            context.arc(point.x, point.y, clamp(layout.cellWidth * 0.04, 4, 8), 0, TAU);
            context.strokeStyle = hexAlpha(color, 0.25);
            context.lineWidth = 1;
            context.stroke();
          }
        });
        context.restore();
      }
      context.restore();
    }

    function drawColumnEdges() {
      context.save();
      context.strokeStyle = "rgba(115, 220, 250, .14)";
      context.lineWidth = 1;
      for (let col = 0; col < 5; col += 1) {
        const x = layout.columns[col] - layout.gap * 0.42;
        const y = layout.top - layout.gap * 0.52;
        roundRect(
          context,
          x, y,
          layout.cellWidth + layout.gap * 0.84,
          layout.gridHeight + layout.gap * 1.04,
          Math.max(3, layout.cellWidth * 0.035)
        );
        context.stroke();
      }

      const bottomY = layout.top + layout.gridHeight + layout.gap * 1.32;
      if (height - bottomY > 10) {
        context.font = `500 ${clamp(width * 0.008, 5.5, 8)}px ${MONO}`;
        context.textBaseline = "middle";
        context.fillStyle = "rgba(131, 169, 190, .36)";
        context.textAlign = "left";
        context.fillText("PAYLINE ENGINE // 10", layout.edge, bottomY + 4);
        context.textAlign = "right";
        context.fillStyle = "rgba(255, 134, 215, .36)";
        context.fillText("VIRTUAL MATRIX", width - layout.edge, bottomY + 4);
      }
      context.restore();
    }

    function drawScatterPulse(state, now) {
      if (!state.showWin || state.scatterCount < 3) return;
      context.save();
      for (const cell of state.scatterCells) {
        const x = layout.columns[cell.col] + layout.cellWidth / 2;
        const y = layout.rows[cell.row] + layout.cellHeight / 2;
        const pulse = (now * 0.0018) % 1;
        const radius = Math.min(layout.cellWidth, layout.cellHeight) * (0.3 + pulse * 0.23);
        context.beginPath();
        context.arc(x, y, radius, 0, TAU);
        context.strokeStyle = `rgba(255, 215, 109, ${(1 - pulse) * 0.65})`;
        context.lineWidth = 1.4;
        context.stroke();
      }
      context.restore();
    }

    function updateParticles(delta) {
      if (!particles.length) return;
      for (const particle of particles) {
        particle.x += particle.vx * delta * 0.06;
        particle.y += particle.vy * delta * 0.06;
        particle.vy += 0.03 * delta * 0.06;
        particle.life -= delta;
        particle.rotation += particle.vr * delta * 0.06;
      }
      particles = particles.filter((particle) => particle.life > 0);
    }

    function drawParticles() {
      if (!particles.length) return;
      context.save();
      context.globalCompositeOperation = "lighter";
      for (const particle of particles) {
        const alpha = clamp(particle.life / particle.maxLife, 0, 1);
        context.save();
        context.globalAlpha = alpha;
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.fillStyle = particle.color;
        context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.42);
        context.restore();
      }
      context.restore();
    }

    function drawFlash() {
      if (flash <= 0.01) return;
      const gradient = context.createRadialGradient(
        width / 2, height * 0.48, 0,
        width / 2, height * 0.48, width * 0.66
      );
      gradient.addColorStop(0, `rgba(199, 253, 255, ${flash * 0.09})`);
      gradient.addColorStop(0.65, `rgba(56, 246, 255, ${flash * 0.025})`);
      gradient.addColorStop(1, "rgba(56,246,255,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    }

    function draw(state, now, options = {}) {
      if (!layout) resize();
      if (!layout) return;
      reducedMotion = Boolean(options.reducedMotion);
      const delta = lastDrawAt ? Math.min(48, now - lastDrawAt) : 16;
      lastDrawAt = now;
      if (!reducedMotion) {
        updateParticles(delta);
        flash *= Math.pow(0.9, delta / 16);
      } else {
        particles = [];
        flash = 0;
      }

      drawBackground(now);
      drawHeader(now, state);
      drawColumnBackdrops();
      drawMatrix(state, now);
      drawScatterPulse(state, now);
      drawParticles();
      drawFlash();
    }

    function spawnBurst(winLines, scatterCells, scatterCount, strong = false) {
      if (reducedMotion) return;
      const colors = [];
      const points = [];
      if (winLines && winLines.length) {
        for (const win of winLines) {
          const color = LINE_COLORS[win.lineIndex % LINE_COLORS.length];
          for (let col = 0; col < win.count; col += 1) {
            const row = PAYLINES[win.lineIndex][col];
            points.push({
              x: layout.columns[col] + layout.cellWidth / 2,
              y: layout.rows[row] + layout.cellHeight / 2
            });
            colors.push(color);
          }
        }
      }
      if (scatterCount >= 3 && scatterCells) {
        for (const cell of scatterCells) {
          points.push({
            x: layout.columns[cell.col] + layout.cellWidth / 2,
            y: layout.rows[cell.row] + layout.cellHeight / 2
          });
          colors.push("#ffd76d");
        }
      }
      if (!points.length) {
        points.push({ x: width / 2, y: height / 2 });
        colors.push("#dcff32");
      }

      const limit = strong ? 54 : 28;
      const extra = strong ? 18 : 8;
      const total = Math.min(limit, points.length * 2 + extra);
      for (let index = 0; index < total; index += 1) {
        const point = points[index % points.length];
        const life = 620 + Math.random() * 650;
        particles.push({
          x: point.x + (Math.random() - 0.5) * layout.cellWidth * 0.7,
          y: point.y + (Math.random() - 0.5) * layout.cellHeight * 0.5,
          vx: (Math.random() - 0.5) * 3.7,
          vy: -1.1 - Math.random() * 3.6,
          life,
          maxLife: life,
          size: 1.3 + Math.random() * 3.4,
          color: colors[index % colors.length],
          rotation: Math.random() * TAU,
          vr: (Math.random() - 0.5) * 0.18
        });
      }
      flash = strong ? 1.15 : 0.8;
    }

    function clearEffects() {
      particles = [];
      flash = 0;
      lastDrawAt = 0;
    }

    function getLayout() {
      return layout;
    }

    resize();

    return {
      resize,
      draw,
      spawnBurst,
      clearEffects,
      getLayout
    };
  }

  NV.createRenderer = createRenderer;
})();
