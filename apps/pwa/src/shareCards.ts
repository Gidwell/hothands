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
  subtitle: string;
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
    "Every call is on-chain. Streaks don't lie.",
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
  roundedRect(context, 68, 58, 86, 86, 20);
  context.fillStyle = "#7c5cff";
  context.fill();

  context.save();
  context.translate(111, 101);
  context.rotate(-0.35);
  context.transform(1, 0, -0.24, 1, 0, 0);
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(0, 0, 24, 0, Math.PI * 2);
  context.fill();
  context.restore();

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

  context.fillStyle = "#c4cad6";
  context.font = "800 30px Inter, ui-sans-serif, system-ui";
  fillFittedText(context, input.subtitle, 104, 292, 992);

  context.fillStyle = "#8ea0b8";
  context.font = "800 24px Inter, ui-sans-serif, system-ui";
  fillFittedText(context, input.walletAddress, 104, 330, 992);
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
    input.copiedLabel ?? "Every call is on-chain. Streaks don't lie.",
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
  context.fillStyle = "#ffffff";
  context.font = "950 24px Inter, ui-sans-serif, system-ui";
  context.fillText("hothands", width - 238, height - 75);
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
