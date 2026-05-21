/**
 * Ring Chart — 环形进度图组件
 * SVG 绘制，支持动画过渡
 */

interface RingChartOptions {
  size?: number;
  strokeWidth?: number;
  bgColor?: string;
  fgColor?: string;
  animated?: boolean;
}

export function createRingChart(
  container: HTMLElement,
  percent: number,
  options: RingChartOptions = {}
): void {
  const {
    size = 80,
    strokeWidth = 6,
    bgColor = 'rgba(255,255,255,0.1)',
    fgColor = '#6366f1',
    animated = true,
  } = options;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  container.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="ring-chart">
      <circle
        cx="${size / 2}" cy="${size / 2}" r="${radius}"
        fill="none" stroke="${bgColor}" stroke-width="${strokeWidth}"
      />
      <circle
        cx="${size / 2}" cy="${size / 2}" r="${radius}"
        fill="none" stroke="${fgColor}" stroke-width="${strokeWidth}"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${offset}"
        stroke-linecap="round"
        transform="rotate(-90 ${size / 2} ${size / 2})"
        ${animated ? 'class="ring-chart-progress"' : ''}
      />
      <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central"
        fill="currentColor" font-size="${size * 0.22}" font-weight="600">
        ${Math.round(percent)}%
      </text>
    </svg>
  `;
}

export function updateRingChart(container: HTMLElement, percent: number): void {
  const circle = container.querySelector('.ring-chart-progress') as SVGCircleElement;
  if (!circle) return;

  const radius = parseFloat(circle.getAttribute('r') || '0');
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  circle.style.transition = 'stroke-dashoffset 0.5s ease';
  circle.setAttribute('stroke-dashoffset', String(offset));

  const text = container.querySelector('text');
  if (text) text.textContent = Math.round(percent) + '%';
}