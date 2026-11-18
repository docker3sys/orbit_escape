// Printable flight chart. Positions use the same arrangement as the orbital receiver.
const W = 1080;
const H = 1350;
const TAU = 2 * Math.PI;
const INK = "#122b32";
const PAPER = "#eeeadd";
const MINT = "#a3e2ce";
const AMBER = "#f2b979";

function text(ctx, label, x, y, font, color, align = "left") {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillText(label, x, y);
}

function stroke(ctx, points, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
}

function circle(ctx, x, y, radius, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.stroke();
}

function station(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-.24);
  ctx.fillStyle = "#172e38";
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, TAU);
  ctx.fill();
  circle(ctx, 0, 0, 50, "#90a9ab", 2);
  circle(ctx, 0, 0, 39, "#6c9299", 5);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(TAU / 8);
    ctx.fillStyle = i % 2 ? "#87afa9" : "#ced9c3";
    ctx.fillRect(26, -3, 19, 6);
    ctx.fillStyle = "#385359";
    ctx.fillRect(9, -5, 18, 10);
  }
  for (const side of [-1, 1]) {
    ctx.fillStyle = "#5d7e84";
    ctx.fillRect(side * 56 - 11, -3, 22, 6);
    ctx.fillStyle = "#274752";
    ctx.fillRect(side * 75 - 13, -23, 26, 46);
    for (let i = 0; i < 4; i++) {
      stroke(ctx, [[side * 75 - 11, i * 11 - 19], [side * 75 + 11, i * 11 - 19]], "#7e9a96");
    }
    stroke(ctx, [[side * 75, -23], [side * 75, 23]], "#7e9a96");
  }
  circle(ctx, 0, 0, 12, "#e6dcb6", 3);
  ctx.restore();
}

function beacon(ctx, x, y, color, isPost, active) {
  ctx.save();
  ctx.translate(x, y);
  circle(ctx, 0, 0, 34, color, 1.3);
  ctx.fillStyle = "#182f38";
  ctx.fillRect(-13, -7, 26, 14);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(-13, -7, 26, 14);
  if (isPost) {
    ctx.fillRect(-26, -5, 10, 10);
    ctx.strokeRect(-26, -5, 10, 10);
    ctx.fillRect(16, -5, 10, 10);
    ctx.strokeRect(16, -5, 10, 10);
    ctx.fillStyle = active ? "#fbdf97" : "#44555a";
    for (let i = 0; i < 6; i++) ctx.fillRect(-9 + 6 * (i % 3), -5 + 6 * Math.floor(i / 3), 3, 3);
  } else {
    ctx.beginPath();
    ctx.arc(0, -8, 12, .18, Math.PI - .18);
    ctx.stroke();
    stroke(ctx, [[0, -8], [6, -19]], color, 2);
    if (active) {
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(4, -13, 11 + i * 6, -1.6, -.4);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawSky(ctx) {
  const sky = ctx.createLinearGradient(40, 960, 1034, 285);
  sky.addColorStop(0, "#142b34");
  sky.addColorStop(.56, "#14333c");
  sky.addColorStop(1, "#0d232f");
  ctx.fillStyle = sky;
  ctx.fillRect(42, 276, 996, 674);
  ctx.save();
  ctx.beginPath();
  ctx.rect(42, 276, 996, 674);
  ctx.clip();
  let seed = 94712;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let i = 0; i < 530; i++) {
    const x = 42 + random() * 996, y = 276 + random() * 674;
    const size = .55 + random() * 1.9;
    ctx.fillStyle = "rgba(217,229,210," + (.24 + random() * .62) + ")";
    ctx.fillRect(x, y, size, size);
    if (size > 2.37) {
      stroke(ctx, [[x - 3, y + 1], [x + 5, y + 1]], "#91a9a5");
      stroke(ctx, [[x + 1, y - 3], [x + 1, y + 5]], "#91a9a5");
    }
  }
  for (let r = 94; r < 700; r += 83) circle(ctx, 540, 673, r, "rgba(149,193,186,.15)");
  for (let i = 0; i < 12; i++) {
    const phi = TAU * i / 12;
    stroke(ctx, [[540, 673], [540 + 680 * Math.cos(phi), 673 + 680 * Math.sin(phi)]],
      "rgba(149,193,186,.10)");
  }
  ctx.restore();
}

function signal(ctx, x, y, kind, color) {
  const long = kind === "b";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let t = 0; t <= 125; t++) {
    const envelope = long ? Math.exp(-((t - 65) ** 2) / 550) :
      Math.exp(-((t - 37) ** 2) / 84) + Math.exp(-((t - 84) ** 2) / 85);
    const v = Math.sin(t * (long ? .38 : .58)) * 11 * envelope;
    if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x + t, y + v);
  }
  ctx.stroke();
}

function route(ctx) {
  ctx.save();
  ctx.setLineDash([5, 8]);
  stroke(ctx, [[239, 578], [526, 437], [841, 578]], "#77969b", 1.6);
  ctx.restore();

  ctx.strokeStyle = MINT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(565, 631);
  ctx.bezierCurveTo(675, 538, 649, 487, 554, 442);
  ctx.stroke();

  // The ship is tangent to the path, with engine trails pointing back to Kromka.
  ctx.save();
  ctx.translate(626, 528);
  ctx.rotate(-.16);
  ctx.fillStyle = "#f7ddaa";
  ctx.beginPath();
  ctx.moveTo(0, -18); ctx.lineTo(9, 12); ctx.lineTo(0, 8); ctx.lineTo(-9, 12); ctx.closePath();
  ctx.fill();
  stroke(ctx, [[-4, 15], [-4, 24]], MINT, 1.6);
  stroke(ctx, [[3, 14], [3, 28]], MINT, 1.6);
  ctx.restore();

  ctx.save();
  ctx.translate(526, 437);
  ctx.rotate(-.35);
  for (const radius of [11, 19, 29]) {
    ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * .64, 0, 0, TAU);
    ctx.strokeStyle = radius === 19 ? "#f4ddad" : "#8ba9a4";
    ctx.lineWidth = radius === 19 ? 3 : 1; ctx.stroke();
  }
  ctx.restore();
  stroke(ctx, [[544, 422], [562, 401], [581, 401]], "#c4c8b4");
  text(ctx, "Ворота", 590, 408, "25px sans-serif", "#e5ddc3");
}

export function drawRouteCard(choice) {
  const people = choice === "people";
  if (!people && choice !== "relay") throw new Error("Unknown route outcome");
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  text(ctx, "ORBIT ESCAPE", 47, 82, "bold 34px sans-serif", INK);
  text(ctx, "ЭКСПЕДИЦИЯ 02", 1034, 80, "23px monospace", INK, "right");
  stroke(ctx, [[44, 106], [1036, 106]], "#93a7a0", 1.5);
  text(ctx, "Два голоса", 42, 210, "bold 99px sans-serif", INK);
  text(ctx, "Карта открытого маршрута", 49, 251, "30px sans-serif", "#45615f");
  drawSky(ctx);
  text(ctx, "РАДИОКАРТА", 74, 326, "21px monospace", "#a0bdb9");
  route(ctx);
  station(ctx, 540, 673);
  beacon(ctx, 239, 578, MINT, true, people);
  beacon(ctx, 841, 578, AMBER, false, !people);
  text(ctx, "A  /  СТВОР", 239, 653, "bold 25px monospace", MINT, "center");
  text(ctx, "B  /  ДАЛЬНИЙ БУЙ", 841, 653, "bold 25px monospace", AMBER, "center");
  text(ctx, "КРОМКА", 540, 772, "bold 31px sans-serif", "#e7e8d7", "center");
  signal(ctx, 78, 884, "a", MINT);
  signal(ctx, 228, 884, "b", AMBER);
  text(ctx, "Оба сигнала записаны", 388, 893, "24px sans-serif", "#d4ded1");
  text(ctx, "ПЕРВЫЙ РЕГУЛЯРНЫЙ РЕЙС", 48, 1014, "24px monospace", "#47645f");
  const headline = people ? "«Створ» встречает челнок." : "Маяк ведёт первый рейс.";
  text(ctx, headline, 43, 1098, "bold 62px sans-serif", INK);
  const lines = people
    ? ["На «Кромке» остались двенадцать. Шестеро на посту", "слышат в эфире позывной первого челнока."]
    : ["На «Кромке» живут восемнадцать человек. Ретранслятор", "передаёт позывной первого челнока."];
  lines.forEach((label, i) => text(ctx, label, 48, 1162 + 43 * i, "33px sans-serif", "#33514f"));
  stroke(ctx, [[44, 1253], [1036, 1253]], "#93a7a0", 1.5);
  text(ctx, "КРОМКА  →  ВОРОТА", 48, 1302, "26px monospace", INK);
  text(ctx, people ? "СТВОР   06" : "МАЯК   В ЭФИРЕ", 1035, 1302, "24px monospace", "#42615d", "right");
  return canvas;
}
