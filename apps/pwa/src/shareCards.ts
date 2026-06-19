export type HotHandsShareCardKind = "profile" | "call";

export type HotHandsShareStat = {
  label: string;
  value: string;
};

export type HotHandsShareCall = {
  direction: "UP" | "DOWN";
  expiry: string;
  strike: string;
};

export type HotHandsShareCardInput = {
  kind: HotHandsShareCardKind;
  title: string;
  subtitle?: string | null;
  walletLabel: string;
  walletAddress: string;
  stats: HotHandsShareStat[];
  call?: HotHandsShareCall;
  copiedLabel?: string | null;
  url: string;
};

export function buildHotHandsShareText(input: HotHandsShareCardInput): string {
  const statLine = input.stats.map((stat) => `${stat.label}: ${stat.value}`).join(" | ");
  const callLine = input.call
    ? `${input.call.direction} ${input.call.strike} exp ${input.call.expiry}`
    : null;

  return [
    `${input.walletLabel} on Hot Hands`,
    callLine,
    statLine,
    input.copiedLabel,
    "Every call is onchain. Streaks don't lie.",
    input.url,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function buildShareToXUrl(input: HotHandsShareCardInput): string {
  const url = new URL("https://twitter.com/intent/tweet");
  url.searchParams.set("text", buildHotHandsShareText(input));
  return url.toString();
}

export function drawHotHandsShareCard(
  canvas: HTMLCanvasElement,
  input: HotHandsShareCardInput,
): void {
  const width = 1200;
  const height = 675;
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create share card canvas.");
  }

  context.scale(scale, scale);
  drawBackground(context, width, height);
  drawBrand(context);
  drawWallet(context, input);
  drawStats(context, input);
  drawFooter(context, input, width, height);
}

const HOT_HANDS_FLAME_PATH =
  "M 627.00,190.00 C 638.70,265.60 687.32,334.00 733.00,400.00 C 765.80,447.38 771.00,502.00 765.00,566.50 C 819.00,518.00 829.00,473.00 805.00,398.00 C 840.00,436.00 873.26,465.84 897.00,513.00 C 927.79,574.17 947.10,635.01 943.70,700.30 C 937.20,825.01 874.73,932.39 771.00,986.00 C 727.30,1008.59 689.00,1015.00 659.00,1019.00 C 705.00,993.00 763.06,940.89 768.00,852.00 C 770.51,806.89 758.97,777.81 748.00,756.00 C 742.31,744.70 738.00,738.00 733.00,729.00 C 728.00,752.00 711.29,779.84 692.00,792.00 C 688.22,794.38 655.41,810.78 650.00,808.00 C 644.97,805.41 639.87,794.98 664.00,750.00 C 679.27,721.53 694.50,668.79 675.00,630.00 C 669.57,619.20 655.00,582.00 620.50,558.50 C 626.50,627.00 564.44,680.24 519.00,738.00 C 482.50,784.40 486.75,814.00 487.00,862.00 C 487.34,927.50 540.00,986.00 595.00,1019.00 C 565.00,1015.00 526.70,1008.59 483.00,986.00 C 379.27,932.39 316.80,825.01 310.30,700.30 C 306.90,635.01 326.21,574.17 357.00,513.00 C 380.74,465.84 414.00,436.00 449.00,398.00 C 425.00,473.00 435.00,518.00 489.00,566.50 C 483.00,502.00 488.20,447.38 521.00,400.00 C 566.68,334.00 615.30,265.60 627.00,190.00 Z";

function drawFlameLogo(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  if (typeof Path2D === "undefined") {
    context.fillStyle = "#8b5cf6";
    context.beginPath();
    context.arc(x + size / 2, y + size / 2, size * 0.42, 0, Math.PI * 2);
    context.fill();
    return;
  }

  const viewBoxX = 295;
  const viewBoxY = 175;
  const viewBoxWidth = 665;
  const viewBoxHeight = 865;
  const scale = size / viewBoxHeight;
  const centeredX = x + (size - viewBoxWidth * scale) / 2;
  const path = new Path2D(HOT_HANDS_FLAME_PATH);

  context.save();
  context.translate(centeredX, y);
  context.scale(scale, scale);
  context.translate(-viewBoxX, -viewBoxY);
  const flame = context.createLinearGradient(0, 196, 0, 1017);
  flame.addColorStop(0, "#bd72fb");
  flame.addColorStop(0.48, "#9a52f9");
  flame.addColorStop(1, "#6c2bf3");
  context.fillStyle = flame;
  context.fill(path);
  context.restore();
}

function drawBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#101828");
  background.addColorStop(0.48, "#172033");
  background.addColorStop(1, "#271c52");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(124, 92, 255, 0.16)";
  context.beginPath();
  context.moveTo(740, 0);
  context.lineTo(width, 0);
  context.lineTo(width, 236);
  context.lineTo(900, 322);
  context.closePath();
  context.fill();

  context.fillStyle = "rgba(20, 184, 166, 0.12)";
  context.beginPath();
  context.moveTo(0, height);
  context.lineTo(0, 500);
  context.lineTo(304, height);
  context.closePath();
  context.fill();
}

function drawBrand(context: CanvasRenderingContext2D): void {
  drawFlameLogo(context, 64, 48, 104);

  context.fillStyle = "#ffffff";
  context.font = "900 58px Inter, ui-sans-serif, system-ui";
  context.fillText("Hot Hands", 178, 95);

  context.fillStyle = "#a7b0c0";
  context.font = "800 26px Inter, ui-sans-serif, system-ui";
  context.fillText("DeepBook Predict social alpha", 180, 132);
}

function drawWallet(context: CanvasRenderingContext2D, input: HotHandsShareCardInput): void {
  context.fillStyle = "rgba(255,255,255,0.08)";
  roundedRect(context, 68, 176, 1064, 182, 28);
  context.fill();

  context.fillStyle = "#ffffff";
  context.font = "950 68px Inter, ui-sans-serif, system-ui";
  fillFittedText(context, input.title, 104, 244, 992);

  context.fillStyle = "#8ea0b8";
  context.font = "800 24px Inter, ui-sans-serif, system-ui";
  fillFittedText(context, input.walletAddress, 104, input.subtitle ? 330 : 302, 992);

  if (input.subtitle) {
    context.fillStyle = "#c4cad6";
    context.font = "800 30px Inter, ui-sans-serif, system-ui";
    fillFittedText(context, input.subtitle, 104, 292, 992);
  }
}

function drawStats(context: CanvasRenderingContext2D, input: HotHandsShareCardInput): void {
  const statCount = input.call ? 4 : Math.min(4, input.stats.length);
  const stats = input.call
    ? [
        { label: "Direction", value: input.call.direction },
        { label: "Strike", value: input.call.strike },
        { label: "Expiry", value: input.call.expiry },
        input.stats[0] ?? { label: "Signal", value: "On-chain" },
      ]
    : input.stats.slice(0, statCount);
  const startX = 68;
  const gap = 18;
  const cardWidth = (1064 - gap * (stats.length - 1)) / stats.length;

  stats.forEach((stat, index) => {
    const x = startX + index * (cardWidth + gap);
    roundedRect(context, x, 398, cardWidth, 128, 22);
    context.fillStyle = "rgba(255,255,255,0.10)";
    context.fill();

    context.fillStyle = "#9aa5b8";
    context.font = "900 22px Inter, ui-sans-serif, system-ui";
    fillFittedText(context, stat.label.toUpperCase(), x + 24, 443, cardWidth - 48);

    context.fillStyle =
      stat.value.startsWith("+") || stat.value === "UP"
        ? "#3ee082"
        : stat.value.startsWith("-") || stat.value === "DOWN"
          ? "#ff6b6b"
          : "#ffffff";
    context.font = "950 36px Inter, ui-sans-serif, system-ui";
    fillFittedText(context, stat.value, x + 24, 491, cardWidth - 48);
  });
}

function drawFooter(
  context: CanvasRenderingContext2D,
  input: HotHandsShareCardInput,
  width: number,
  height: number,
): void {
  context.fillStyle = "#ffffff";
  context.font = "900 30px Inter, ui-sans-serif, system-ui";
  fillFittedText(
    context,
    input.copiedLabel ?? "Every call is onchain. Streaks don't lie.",
    68,
    590,
    730,
  );

  context.fillStyle = "#9aa5b8";
  context.font = "800 24px Inter, ui-sans-serif, system-ui";
  fillFittedText(context, input.url, 68, 630, 730);

  context.fillStyle = "#7c5cff";
  roundedRect(context, width - 274, height - 112, 206, 58, 18);
  context.fill();
  drawFlameLogo(context, width - 258, height - 104, 42);
  context.fillStyle = "#ffffff";
  context.font = "950 24px Inter, ui-sans-serif, system-ui";
  context.fillText("hothands", width - 210, height - 75);
}

function fillFittedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
): void {
  if (context.measureText(text).width <= maxWidth) {
    context.fillText(text, x, y);
    return;
  }

  let fitted = text;
  while (fitted.length > 3 && context.measureText(`${fitted}...`).width > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  context.fillText(`${fitted}...`, x, y);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const resolvedRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + resolvedRadius, y);
  context.lineTo(x + width - resolvedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + resolvedRadius);
  context.lineTo(x + width, y + height - resolvedRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - resolvedRadius, y + height);
  context.lineTo(x + resolvedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - resolvedRadius);
  context.lineTo(x, y + resolvedRadius);
  context.quadraticCurveTo(x, y, x + resolvedRadius, y);
  context.closePath();
}
