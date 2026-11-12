/* ==========================================================================
   NEON VAULT — procedural canvas symbol artwork
   Every icon is drawn locally; no image requests, no third-party assets.
   ========================================================================== */
(function () {
  "use strict";

  const NV = window.NV = window.NV || {};
  const TAU = Math.PI * 2;
  const MONO = '"Cascadia Code", "Cascadia Mono", Consolas, monospace';
  const COLORS = NV.CONFIG.SYMBOLS;

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

  function halo(g, color, alpha = 0.22) {
    const gradient = g.createRadialGradient(50, 49, 2, 50, 50, 50);
    gradient.addColorStop(0, NV.util.hexAlpha(color, alpha));
    gradient.addColorStop(0.52, NV.util.hexAlpha(color, alpha * 0.24));
    gradient.addColorStop(1, NV.util.hexAlpha(color, 0));
    g.fillStyle = gradient;
    g.fillRect(0, 0, 100, 100);
  }

  function glowStroke(g, color, width, blur = 9) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.lineCap = "round";
    g.lineJoin = "round";
  }

  function line(g, x1, y1, x2, y2, color, width, blur = 0) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = "round";
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.stroke();
    g.shadowBlur = 0;
  }

  function dot(g, x, y, radius, color, glow = 8) {
    g.beginPath();
    g.arc(x, y, radius, 0, TAU);
    g.fillStyle = color;
    g.shadowColor = color;
    g.shadowBlur = glow;
    g.fill();
    g.shadowBlur = 0;
  }

  function drawChip(g) {
    halo(g, "#38f6ff");
    g.save();
    const body = g.createRadialGradient(38, 34, 3, 50, 50, 38);
    body.addColorStop(0, "#143447");
    body.addColorStop(0.57, "#081b25");
    body.addColorStop(1, "#040b11");
    g.beginPath();
    g.arc(50, 50, 33, 0, TAU);
    g.fillStyle = body;
    g.fill();
    glowStroke(g, "#5beeff", 2.5, 12);
    g.stroke();
    g.shadowBlur = 0;

    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * TAU + Math.PI / 12;
      line(
        g,
        50 + Math.cos(angle) * 33,
        50 + Math.sin(angle) * 33,
        50 + Math.cos(angle) * 39,
        50 + Math.sin(angle) * 39,
        i % 3 === 0 ? "#dcff32" : "rgba(79, 234, 255, .72)",
        i % 3 === 0 ? 2 : 1.2
      );
    }

    g.beginPath();
    g.arc(50, 50, 23, 0, TAU);
    g.strokeStyle = "rgba(120, 247, 255, .65)";
    g.lineWidth = 1.1;
    g.stroke();
    g.beginPath();
    g.arc(50, 50, 17, 0, TAU);
    g.setLineDash([2, 4]);
    g.strokeStyle = "rgba(120, 247, 255, .34)";
    g.lineWidth = 1;
    g.stroke();
    g.setLineDash([]);

    g.beginPath();
    g.moveTo(50, 36);
    g.lineTo(59, 50);
    g.lineTo(50, 64);
    g.lineTo(41, 50);
    g.closePath();
    g.fillStyle = "rgba(56, 246, 255, .10)";
    g.strokeStyle = "#a4fbff";
    g.lineWidth = 1.5;
    g.shadowColor = "#38f6ff";
    g.shadowBlur = 8;
    g.fill();
    g.stroke();
    g.shadowBlur = 0;

    g.font = `700 8px ${MONO}`;
    g.fillStyle = "#c8feff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("NV", 50, 51);
    g.restore();
  }

  function drawDice(g) {
    halo(g, "#ff2fb3");
    g.save();
    g.translate(50, 50);
    g.rotate(-0.12);
    g.translate(-50, -50);

    const body = g.createLinearGradient(22, 22, 78, 78);
    body.addColorStop(0, "#31132d");
    body.addColorStop(0.55, "#1a0b20");
    body.addColorStop(1, "#0d0713");
    roundRect(g, 21, 21, 58, 58, 12);
    g.fillStyle = body;
    g.fill();
    glowStroke(g, "#ff5bc6", 2.4, 12);
    g.stroke();
    g.shadowBlur = 0;

    roundRect(g, 28, 28, 44, 44, 7);
    g.strokeStyle = "rgba(255, 121, 211, .22)";
    g.lineWidth = 1;
    g.stroke();

    const pips = [
      [35, 35], [65, 35], [50, 50], [35, 65], [65, 65]
    ];
    pips.forEach(([x, y], index) => {
      dot(g, x, y, index === 2 ? 4.3 : 3.4, index === 2 ? "#ffd1ed" : "#ff66c9", 10);
    });

    line(g, 21, 30, 12, 30, "rgba(255, 91, 198, .6)", 1.4);
    line(g, 12, 30, 12, 42, "rgba(255, 91, 198, .6)", 1.4);
    line(g, 79, 70, 88, 70, "rgba(255, 91, 198, .42)", 1);
    dot(g, 12, 42, 1.5, "#ff86d7", 5);
    g.restore();
  }

  function drawMask(g) {
    halo(g, "#ffb344");
    g.save();

    const body = g.createLinearGradient(24, 22, 76, 80);
    body.addColorStop(0, "#4a2b0d");
    body.addColorStop(0.48, "#241306");
    body.addColorStop(1, "#100905");
    g.beginPath();
    g.moveTo(50, 16);
    g.bezierCurveTo(43, 22, 36, 24, 27, 24);
    g.lineTo(19, 32);
    g.lineTo(21, 54);
    g.bezierCurveTo(23, 70, 35, 79, 50, 86);
    g.bezierCurveTo(65, 79, 77, 70, 79, 54);
    g.lineTo(81, 32);
    g.lineTo(73, 24);
    g.bezierCurveTo(64, 24, 57, 22, 50, 16);
    g.closePath();
    g.fillStyle = body;
    g.fill();
    glowStroke(g, "#ffbf55", 2.2, 13);
    g.stroke();
    g.shadowBlur = 0;

    g.beginPath();
    g.moveTo(28, 24);
    g.lineTo(17, 11);
    g.lineTo(36, 19);
    g.moveTo(72, 24);
    g.lineTo(83, 11);
    g.lineTo(64, 19);
    g.strokeStyle = "#ff9e2f";
    g.lineWidth = 2.4;
    g.lineCap = "round";
    g.stroke();

    const eyeLeft = g.createLinearGradient(28, 40, 45, 51);
    eyeLeft.addColorStop(0, "#fff5c2");
    eyeLeft.addColorStop(1, "#ff9f26");
    g.beginPath();
    g.moveTo(28, 43);
    g.lineTo(45, 39);
    g.lineTo(42, 51);
    g.lineTo(28, 48);
    g.closePath();
    g.fillStyle = eyeLeft;
    g.shadowColor = "#ffb344";
    g.shadowBlur = 12;
    g.fill();
    g.shadowBlur = 0;

    g.beginPath();
    g.moveTo(72, 43);
    g.lineTo(55, 39);
    g.lineTo(58, 51);
    g.lineTo(72, 48);
    g.closePath();
    g.fillStyle = eyeLeft;
    g.shadowColor = "#ffb344";
    g.shadowBlur = 12;
    g.fill();
    g.shadowBlur = 0;

    g.beginPath();
    g.moveTo(33, 59);
    g.lineTo(67, 59);
    g.lineTo(62, 74);
    g.lineTo(50, 79);
    g.lineTo(38, 74);
    g.closePath();
    g.strokeStyle = "rgba(255, 200, 95, .48)";
    g.lineWidth = 1;
    g.stroke();

    for (let x = 40; x <= 60; x += 5) {
      line(g, x, 61, x, 73, "rgba(255, 196, 82, .45)", 1.2);
    }
    line(g, 33, 59, 67, 59, "rgba(255, 196, 82, .68)", 1.2);
    line(g, 38, 74, 62, 74, "rgba(255, 196, 82, .46)", 1);

    dot(g, 50, 28, 2.1, "#ffcf75", 7);
    line(g, 23, 58, 15, 58, "rgba(255, 179, 68, .48)", 1.2);
    line(g, 15, 58, 15, 66, "rgba(255, 179, 68, .48)", 1.2);
    line(g, 77, 63, 86, 63, "rgba(255, 179, 68, .38)", 1);
    g.restore();
  }

  function drawKatana(g) {
    halo(g, "#38f6ff");
    g.save();
    g.lineCap = "round";

    g.beginPath();
    g.moveTo(24, 79);
    g.lineTo(80, 17);
    g.strokeStyle = "rgba(56, 246, 255, .20)";
    g.lineWidth = 12;
    g.stroke();

    g.beginPath();
    g.moveTo(24, 79);
    g.lineTo(80, 17);
    const blade = g.createLinearGradient(24, 79, 80, 17);
    blade.addColorStop(0, "#a9f9ff");
    blade.addColorStop(0.55, "#f0ffff");
    blade.addColorStop(1, "#42eaff");
    g.strokeStyle = blade;
    g.lineWidth = 5.5;
    g.shadowColor = "#38f6ff";
    g.shadowBlur = 10;
    g.stroke();

    g.beginPath();
    g.moveTo(27, 75);
    g.lineTo(77, 20);
    g.strokeStyle = "rgba(255, 255, 255, .9)";
    g.lineWidth = 1.4;
    g.shadowBlur = 0;
    g.stroke();

    g.beginPath();
    g.moveTo(78, 17);
    g.lineTo(82, 23);
    g.lineTo(73, 20);
    g.closePath();
    g.fillStyle = "#efffff";
    g.shadowColor = "#38f6ff";
    g.shadowBlur = 12;
    g.fill();
    g.shadowBlur = 0;

    line(g, 31, 70, 38, 62, "#ff2fb3", 5.4, 8);
    line(g, 24, 82, 33, 73, "#ff2fb3", 7, 8);
    for (let i = 0; i < 4; i += 1) {
      line(g, 24 + i * 3, 81 - i * 3, 29 + i * 3, 84 - i * 3, "rgba(255, 210, 242, .8)", 1);
    }
    g.save();
    g.translate(32, 68);
    g.rotate(-0.8);
    g.beginPath();
    g.ellipse(0, 0, 11, 3.4, 0, 0, TAU);
    g.fillStyle = "#1a101a";
    g.strokeStyle = "#ff5bc6";
    g.lineWidth = 1.6;
    g.shadowColor = "#ff2fb3";
    g.shadowBlur = 8;
    g.fill();
    g.stroke();
    g.restore();

    line(g, 36, 65, 67, 30, "rgba(7, 27, 34, .85)", 1, 0);
    line(g, 42, 57, 70, 27, "rgba(56, 246, 255, .55)", 1, 0);
    for (let i = 0; i < 4; i += 1) {
      dot(g, 47 + i * 5, 52 - i * 5, 0.9, "rgba(56, 246, 255, .8)", 3);
    }
    g.restore();
  }

  function drawSkull(g) {
    halo(g, "#8cffb7");
    g.save();

    const cranium = g.createLinearGradient(27, 15, 73, 83);
    cranium.addColorStop(0, "#19362a");
    cranium.addColorStop(0.55, "#0d1c17");
    cranium.addColorStop(1, "#07100d");
    g.beginPath();
    g.moveTo(50, 13);
    g.bezierCurveTo(34, 13, 24, 24, 24, 40);
    g.bezierCurveTo(24, 49, 28, 55, 35, 59);
    g.lineTo(35, 71);
    g.bezierCurveTo(35, 78, 41, 82, 47, 84);
    g.lineTo(50, 87);
    g.lineTo(53, 84);
    g.bezierCurveTo(59, 82, 65, 78, 65, 71);
    g.lineTo(65, 59);
    g.bezierCurveTo(72, 55, 76, 49, 76, 40);
    g.bezierCurveTo(76, 24, 66, 13, 50, 13);
    g.closePath();
    g.fillStyle = cranium;
    g.fill();
    glowStroke(g, "#93ffbe", 2.1, 12);
    g.stroke();
    g.shadowBlur = 0;

    g.fillStyle = "#02100b";
    g.beginPath();
    g.ellipse(38, 43, 8, 7.2, -0.2, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(62, 43, 8, 7.2, 0.2, 0, TAU);
    g.fill();
    dot(g, 39, 44, 2.8, "#ff2fb3", 12);
    dot(g, 61, 44, 2.8, "#ff2fb3", 12);

    g.beginPath();
    g.moveTo(50, 53);
    g.lineTo(45, 62);
    g.lineTo(55, 62);
    g.closePath();
    g.fillStyle = "#03130d";
    g.fill();

    line(g, 31, 40, 27, 34, "rgba(140, 255, 183, .4)", 1, 0);
    line(g, 27, 34, 21, 34, "rgba(140, 255, 183, .4)", 1, 0);
    line(g, 69, 40, 73, 34, "rgba(140, 255, 183, .4)", 1, 0);
    dot(g, 73, 34, 1.4, "#8cffb7", 4);

    line(g, 36, 66, 64, 66, "rgba(140, 255, 183, .44)", 1.2);
    for (let x = 41; x <= 59; x += 4.5) {
      line(g, x, 66, x, 76, "rgba(140, 255, 183, .42)", 1);
    }
    line(g, 36, 76, 64, 76, "rgba(140, 255, 183, .28)", 1);
    g.restore();
  }

  function wildPath(g) {
    g.beginPath();
    g.moveTo(16, 24);
    g.lineTo(29, 78);
    g.lineTo(50, 47);
    g.lineTo(71, 78);
    g.lineTo(84, 24);
  }

  function drawWild(g) {
    halo(g, "#dcff32", 0.18);
    g.save();
    g.lineCap = "round";
    g.lineJoin = "round";

    g.save();
    g.translate(-3, 0);
    wildPath(g);
    g.strokeStyle = "rgba(56, 246, 255, .72)";
    g.lineWidth = 9;
    g.shadowColor = "#38f6ff";
    g.shadowBlur = 10;
    g.stroke();
    g.restore();

    g.save();
    g.translate(3, 1);
    wildPath(g);
    g.strokeStyle = "rgba(255, 47, 179, .68)";
    g.lineWidth = 9;
    g.shadowColor = "#ff2fb3";
    g.shadowBlur = 10;
    g.stroke();
    g.restore();

    wildPath(g);
    const mainGradient = g.createLinearGradient(18, 25, 82, 74);
    mainGradient.addColorStop(0, "#efff80");
    mainGradient.addColorStop(0.52, "#dcff32");
    mainGradient.addColorStop(1, "#95ffb2");
    g.strokeStyle = mainGradient;
    g.lineWidth = 8;
    g.shadowColor = "#dcff32";
    g.shadowBlur = 15;
    g.stroke();

    g.shadowBlur = 0;
    wildPath(g);
    g.strokeStyle = "rgba(255, 255, 255, .8)";
    g.lineWidth = 1.2;
    g.stroke();

    g.save();
    g.beginPath();
    g.rect(0, 39, 100, 5);
    g.clip();
    g.translate(5, 0);
    wildPath(g);
    g.strokeStyle = "rgba(5, 5, 10, .8)";
    g.lineWidth = 9;
    g.stroke();
    g.restore();

    g.fillStyle = "rgba(56, 246, 255, .7)";
    g.fillRect(13, 15, 9, 2);
    g.fillStyle = "rgba(255, 47, 179, .76)";
    g.fillRect(74, 84, 13, 2);
    g.fillRect(8, 58, 3, 6);
    g.fillStyle = "rgba(220, 255, 50, .72)";
    g.fillRect(87, 48, 5, 1);
    g.restore();
  }

  function drawScatter(g) {
    halo(g, "#ffd76d");
    g.save();
    g.translate(50, 50);

    const body = g.createRadialGradient(-10, -13, 3, 0, 0, 40);
    body.addColorStop(0, "#5b3c0b");
    body.addColorStop(0.58, "#231705");
    body.addColorStop(1, "#0d0904");
    g.beginPath();
    g.arc(0, 0, 34, 0, TAU);
    g.fillStyle = body;
    g.fill();
    glowStroke(g, "#ffd76d", 2.4, 14);
    g.stroke();
    g.shadowBlur = 0;

    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * TAU;
      line(
        g,
        Math.cos(angle) * 34,
        Math.sin(angle) * 34,
        Math.cos(angle) * 41,
        Math.sin(angle) * 41,
        i % 3 === 0 ? "#fff1b6" : "rgba(255, 215, 109, .58)",
        i % 3 === 0 ? 2.2 : 1.2
      );
    }

    g.beginPath();
    g.arc(0, 0, 24, 0, TAU);
    g.strokeStyle = "rgba(255, 221, 131, .55)";
    g.lineWidth = 1.3;
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 16, 0, TAU);
    g.strokeStyle = "rgba(255, 221, 131, .36)";
    g.lineWidth = 1;
    g.stroke();

    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * TAU + Math.PI / 8;
      line(
        g,
        Math.cos(angle) * 19,
        Math.sin(angle) * 19,
        Math.cos(angle) * 27,
        Math.sin(angle) * 27,
        "rgba(255, 215, 109, .58)",
        1.1
      );
      dot(g, Math.cos(angle) * 29.5, Math.sin(angle) * 29.5, 1.2, "#ffe49b", 4);
    }

    g.beginPath();
    g.arc(0, -3, 4.2, 0, TAU);
    g.fillStyle = "#ffe9a7";
    g.shadowColor = "#ffd76d";
    g.shadowBlur = 12;
    g.fill();
    g.beginPath();
    g.moveTo(-3.3, 0);
    g.lineTo(3.3, 0);
    g.lineTo(1.2, 7);
    g.lineTo(-1.2, 7);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;

    g.font = `700 7px ${MONO}`;
    g.fillStyle = "rgba(255, 236, 173, .92)";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("88", 10, 27);
    g.fillStyle = "rgba(255, 236, 173, .48)";
    g.fillText("VAULT", 0, -28);
    g.restore();
  }

  const painters = {
    chip: drawChip,
    dice: drawDice,
    mask: drawMask,
    katana: drawKatana,
    skull: drawSkull,
    wild: drawWild,
    scatter: drawScatter
  };

  function drawSymbolArt(g, id) {
    if (!painters[id] || !COLORS[id]) return;
    g.save();
    g.lineCap = "round";
    g.lineJoin = "round";
    painters[id](g);
    g.restore();
  }

  function createCache(getDpr) {
    const entries = new Map();

    function get(id, size) {
      const dpr = Math.max(1, Math.min(2, Number(getDpr()) || 1));
      const rounded = Math.max(18, Math.round(size));
      const key = `${id}:${rounded}:${dpr.toFixed(2)}`;
      const existing = entries.get(key);
      if (existing) return existing;

      const padding = Math.ceil(rounded * 0.17);
      const cssSize = rounded + padding * 2;
      const bitmap = document.createElement("canvas");
      bitmap.width = Math.ceil(cssSize * dpr);
      bitmap.height = Math.ceil(cssSize * dpr);
      const brush = bitmap.getContext("2d");
      brush.setTransform(dpr, 0, 0, dpr, 0, 0);
      brush.translate(cssSize / 2, cssSize / 2);
      brush.scale(rounded / 100, rounded / 100);
      brush.translate(-50, -50);
      drawSymbolArt(brush, id);

      const entry = { bitmap, cssSize };
      entries.set(key, entry);
      return entry;
    }

    return {
      get,
      clear() {
        entries.clear();
      }
    };
  }

  NV.art = {
    draw: drawSymbolArt,
    createCache,
    roundRect,
    line,
    dot,
    colors: COLORS
  };
})();
