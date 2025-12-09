'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Upload,
  RotateCcw,
  Video,
  Disc,
  Download,
  Image as ImageIcon,
  Layers,
} from 'lucide-react';

/* ----------------------------- 1. CONFIG ----------------------------- */

const ALGORITHM_CATEGORIES = {
  'Error Diffusion': {
    'Floyd-Steinberg': { divisor: 16, offsets: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
    Atkinson: { divisor: 8, offsets: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
    'Jarvis-Judice-Ninke': {
      divisor: 48,
      offsets: [
        [1, 0, 7], [2, 0, 5],
        [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
        [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1],
      ],
    },
    Stucki: {
      divisor: 42,
      offsets: [
        [1, 0, 8], [2, 0, 4],
        [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
        [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1],
      ],
    },
    Burkes: {
      divisor: 32,
      offsets: [
        [1, 0, 8], [2, 0, 4],
        [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
      ],
    },
    Sierra: {
      divisor: 32,
      offsets: [
        [1, 0, 5], [2, 0, 3],
        [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2],
        [-1, 2, 2], [0, 2, 3], [1, 2, 2],
      ],
    },
    'Two-Row Sierra': {
      divisor: 16,
      offsets: [
        [1, 0, 4], [2, 0, 3],
        [-2, 1, 1], [-1, 1, 2], [0, 1, 3], [1, 1, 2], [2, 1, 1],
      ],
    },
    'Sierra Lite': { divisor: 4, offsets: [[1, 0, 2], [-1, 1, 1], [0, 1, 1]] },
    Ostromoukhov: { type: 'variable', table: true },
  },
  'Ordered (Bitmap)': {
    'Ordered 2x2': 2,
    'Ordered 4x4': 4,
    'Ordered 8x8': 8,
    'Ordered 16x16': 16,
    'Knoll (Clustered)': 'knoll',
    'Horizontal Lines': 'hlines',
    'Vertical Lines': 'vlines',
    'Diagonal Lines': 'dlines',
  },
  Organic: {
    'Blue Noise': 'bluenoise',
    'White Noise': 'whitenoise',
    'Voronoi Stippling': 'voronoi',
    'Stipple Pattern': 'stipple',
  },
  Modulation: {
    'Sine Wave X': { axis: 'x', wave: 'sine' },
    'Sine Wave Y': { axis: 'y', wave: 'sine' },
    'Circular Wave': { axis: 'radial', wave: 'sine' },
    'Square Wave': { axis: 'x', wave: 'square' },
    'Riemersma (Hilbert)': 'riemersma',
  },
  Pattern: {
    Checkerboard: 'checker',
    'Grid Pattern': 'grid',
    'Random Dots': 'random',
    'Interleaved Gradient': 'gradient',
  },
};

const PALETTE_PRESETS = {
  CyberGB: [
    ['#020a00', '#4c7f00', '#9bbc0f', '#e5ff8a'],
    ['#000000', '#9bbc0f', '#e5ff8a'],
  ],
  Print: [['#000000', '#00ffff', '#ff00ff', '#ffff00', '#ffffff']],

  /* 80s SUNSET / DISK STYLE */
  '80s Sunsets I': [
    ['#f5f9ff', '#8ad3ff', '#ffc56b', '#b4522f'],
    ['#fce9b1', '#ff9b3d', '#ff4b6c', '#432142'],
    ['#e2f2ff', '#8fd2ff', '#c38bff', '#412a6d'],
    ['#f5f4f0', '#c9c8d2', '#f3b36a', '#7b422d'],
    ['#e4f5ff', '#8fb9ff', '#3c5dd7', '#050923'],
    ['#e5fbff', '#8fd4ff', '#ffb86c', '#7f2a37'],
    ['#e5f2ff', '#9cd3ff', '#8d79ff', '#382666'],
    ['#f9f1de', '#f0c679', '#f26d3e', '#3b1416'],
    ['#f6f3ff', '#bd9cff', '#201733', '#05040c'],
    ['#fbe9d9', '#ffba62', '#ff5f7a', '#5c2a54'],
  ],

  /* NEON DISKS */
  'Neon Disks': [
    ['#0dd4ff', '#ff3b7f', '#ff7b3b'],
    ['#ff8765', '#ff3b46', '#a3147f'],
    ['#ff6fd5', '#ff3b7b', '#ffae3b'],
    ['#ff9c38', '#ff4338', '#ff007a'],
    ['#ff8ef7', '#ff4eb7', '#4a36ff'],
    ['#28ffc8', '#00b6ff', '#2739ff'],
    ['#00e2ff', '#007dfa', '#281b7f'],
    ['#c28dff', '#7d4cff', '#2f154f'],
    ['#00ffb2', '#00b4ff', '#7b3bff'],
    ['#ffb36b', '#ff6b4b', '#7b2bff'],
  ],

  /* HORIZON STRIPES */
  'Horizon Stripes': [
    ['#00191f', '#005f4d', '#ff8a3b', '#ffd849', '#f6f4f2'],
    ['#000424', '#001e5f', '#234aff', '#fdf5ff'],
    ['#0a0a24', '#0060a8', '#ffc14f', '#ffeedd'],
    ['#004451', '#00a5cb', '#fce386', '#ffffff'],
    ['#00091d', '#003d82', '#ff8c6d', '#fff7ea'],
    ['#000010', '#0c1f50', '#ee4038', '#ffaf4f'],
    ['#04051f', '#001a4d', '#003f96', '#ffdf6d'],
    ['#000000', '#1f0010', '#ff4333', '#ffc14f', '#fff8e6'],
    ['#05081f', '#001e3d', '#00629c', '#00ffd4'],
    ['#000013', '#201949', '#ff6a4f', '#f5f3ff'],
    ['#00020b', '#004475', '#ff831e', '#fff5e3'],
    ['#050812', '#00233d', '#004f7b', '#f2d770', '#ffffff'],
  ],

  /* CONSTELLATION-LIKE VERTICAL GRADIENT SET */
  'Constellation Bars': [
    ['#ff3700', '#ff8e00', '#ffe94a', '#f7f0ff'],
    ['#00f0ff', '#00c47b', '#006b52', '#001611'],
    ['#0039ff', '#2ac7ff', '#78ffeb', '#f5fff9'],
    ['#ff42c0', '#ff8fd7', '#ffe2ff', '#f7f7ff'],
    ['#f7a000', '#ffcf54', '#ffeab3', '#fffdf8'],
    ['#d2e5ff', '#88bfff', '#4a7dff', '#02081c'],
    ['#006bff', '#00a6ff', '#ffb347', '#ffe8c2'],
    ['#5c17ff', '#a64bff', '#ff5cd6', '#fff0ff'],
    ['#ff9934', '#ffcf4a', '#ffe7a8', '#ffffff'],
    ['#7f80ff', '#a49fff', '#e3e0ff', '#ffffff'],
    ['#004dff', '#00b3ff', '#00ffe6', '#f5ffff'],
    ['#00ffc8', '#00b6ff', '#5a64ff', '#100015'],
  ],
};

/* ---------------------------- 2. HELPERS ----------------------------- */

const getBayerMatrix = size => {
  if (size === 2) return [[0, 2], [3, 1]].map(r => r.map(v => v * 64));
  if (size === 4)
    return [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ].map(r => r.map(v => v * 16));
  if (size === 8) {
    const m = [
      [0, 32, 8, 40, 2, 34, 10, 42],
      [48, 16, 56, 24, 50, 18, 58, 26],
      [12, 44, 4, 36, 14, 46, 6, 38],
      [60, 28, 52, 20, 62, 30, 54, 22],
      [3, 35, 11, 43, 1, 33, 9, 41],
      [51, 19, 59, 27, 49, 17, 57, 25],
      [15, 47, 7, 39, 13, 45, 5, 37],
      [63, 31, 55, 23, 61, 29, 53, 21],
    ];
    return m.map(r => r.map(v => v * 4));
  }
  if (size === 16) {
    const m8 = getBayerMatrix(8);
    const m = new Array(16).fill(0).map(() => new Array(16).fill(0));
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        m[y][x] = m8[y % 8][x % 8] + m8[Math.floor(y / 8)][Math.floor(x / 8)] / 64;
      }
    }
    return m;
  }
  return [[0]];
};

const getKnollMatrix = () =>
  [
    [6, 12, 10, 16],
    [8, 4, 14, 2],
    [11, 15, 9, 13],
    [5, 7, 3, 1],
  ].map(r => r.map(v => v * 16));

const generateBlueNoise = (w, h) => {
  const noise = new Uint8ClampedArray(w * h);
  for (let i = 0; i < noise.length; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    noise[i] = (Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 255;
  }
  return noise;
};

const hexToRgb = hex => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
};

/* multilevel quantization helper */
const quantizeToLevels = (val, levels) => {
  const L = Math.max(2, levels | 0);
  const clamped = Math.max(0, Math.min(255, val));
  const scaled = (clamped / 255) * (L - 1);
  const idx = Math.round(scaled);
  return (idx / (L - 1)) * 255;
};

/* ------------------------ 3. IMAGE PROCESSING ------------------------ */

const processImage = (imageData, settings) => {
  const { width, height, data } = imageData;
  const {
    scale,
    style,
    palette,
    lineScale,
    bleed,
    contrast,
    midtones,
    highlights,
    depth,
    invert,
    threshold,
  } = settings;

  const s = Math.max(1, scale);
  const scaledW = Math.max(1, Math.floor(width / s));
  const scaledH = Math.max(1, Math.floor(height / s));
  const gray = new Uint8ClampedArray(scaledW * scaledH);

  for (let y = 0; y < scaledH; y++) {
    for (let x = 0; x < scaledW; x++) {
      const srcX = Math.floor(x * s);
      const srcY = Math.floor(y * s);
      const srcIdx = (srcY * width + srcX) * 4;
      gray[y * scaledW + x] = Math.floor(
        0.299 * data[srcIdx] + 0.587 * data[srcIdx + 1] + 0.114 * data[srcIdx + 2],
      );
    }
  }

  const adjusted = applyAdjustments(gray, { contrast, midtones, highlights, invert, threshold });

  const levels = Math.max(2, palette.length || 2);
  let dithered = applyDither(adjusted, scaledW, scaledH, style, lineScale, bleed, levels);

  if (depth > 0) dithered = applyDepth(dithered, scaledW, scaledH, depth);

  const colored = applyPalette(dithered, palette);

  const output = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = Math.floor(x / s);
      const srcY = Math.floor(y / s);
      const srcIdx = (srcY * scaledW + srcX) * 3;
      const dstIdx = (y * width + x) * 4;
      if (srcIdx < colored.length) {
        output.data[dstIdx] = colored[srcIdx];
        output.data[dstIdx + 1] = colored[srcIdx + 1];
        output.data[dstIdx + 2] = colored[srcIdx + 2];
        output.data[dstIdx + 3] = 255;
      }
    }
  }
  return output;
};

const applyAdjustments = (gray, { contrast, midtones, highlights, invert, threshold }) => {
  const adjusted = new Uint8ClampedArray(gray);
  const lut = new Uint8ClampedArray(256);
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const bias = 128 - threshold;

  for (let i = 0; i < 256; i++) {
    let v = i + bias;
    if (contrast !== 45) v = contrastFactor * (v - 128) + 128;
    v = Math.max(0, Math.min(255, v));

    let norm = v / 255;
    if (norm < 0.5) norm = norm * (midtones / 50);
    else norm = 0.5 + (norm - 0.5) * (highlights / 50);
    v = norm * 255;

    if (invert) v = 255 - v;
    lut[i] = v;
  }

  for (let i = 0; i < gray.length; i++) adjusted[i] = lut[gray[i]];
  return adjusted;
};

const applyDither = (gray, w, h, style, lineScale, bleed, levels) => {
  let algo = null;
  let category = null;

  for (const [cat, algos] of Object.entries(ALGORITHM_CATEGORIES)) {
    if (algos[style]) {
      algo = algos[style];
      category = cat;
      break;
    }
  }
  if (!algo || !category) return gray;

  const L = Math.max(2, levels | 0);

  if (category === 'Error Diffusion') {
    if (algo.type === 'variable') return applyOstromoukhov(gray, w, h, L);
    const pixels = new Float32Array(gray);
    const { divisor, offsets } = algo;
    const bleedFactor = 0.5 + bleed / 100;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const oldVal = pixels[idx];
        const newVal = quantizeToLevels(oldVal, L);
        pixels[idx] = newVal;
        const err = (oldVal - newVal) * bleedFactor;
        for (const [dx, dy, weight] of offsets) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            pixels[ny * w + nx] += (err * weight) / divisor;
          }
        }
      }
    }
    return Uint8ClampedArray.from(pixels.map(v => Math.max(0, Math.min(255, v))));
  }

  if (category === 'Ordered (Bitmap)') {
    const output = new Uint8ClampedArray(w * h);
    const isMatrix = typeof algo === 'number' || algo === 'knoll';
    const matrix = isMatrix ? (typeof algo === 'number' ? getBayerMatrix(algo) : getKnollMatrix()) : null;
    const size = matrix ? matrix.length : 0;

    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      const y = Math.floor(i / w);
      let jitter = 0;
      if (isMatrix && matrix) {
        const t = matrix[y % size][x % size]; // 0–255
        jitter = (t - 127) * 0.6;
      } else {
        if (algo === 'hlines') jitter = y % lineScale < lineScale / 2 ? -60 : 60;
        else if (algo === 'vlines') jitter = x % lineScale < lineScale / 2 ? -60 : 60;
        else if (algo === 'dlines') jitter = (x + y) % lineScale < lineScale / 2 ? -60 : 60;
      }
      const g = Math.max(0, Math.min(255, gray[i] + jitter));
      output[i] = quantizeToLevels(g, L);
    }
    return output;
  }

  if (category === 'Organic') {
    const output = new Uint8ClampedArray(w * h);
    if (algo === 'bluenoise') {
      const noise = generateBlueNoise(w, h);
      for (let i = 0; i < gray.length; i++) {
        const jitter = (noise[i] - 127) * 0.7;
        const g = Math.max(0, Math.min(255, gray[i] + jitter));
        output[i] = quantizeToLevels(g, L);
      }
    } else if (algo === 'whitenoise') {
      for (let i = 0; i < gray.length; i++) {
        const jitter = (Math.random() * 255 - 127) * 0.7;
        const g = Math.max(0, Math.min(255, gray[i] + jitter));
        output[i] = quantizeToLevels(g, L);
      }
    } else {
      for (let i = 0; i < gray.length; i++) {
        const jitter = (Math.random() - 0.5) * 120;
        const g = Math.max(0, Math.min(255, gray[i] + jitter));
        output[i] = quantizeToLevels(g, L);
      }
    }
    return output;
  }

  if (category === 'Modulation') {
    if (algo === 'riemersma') return applyRiemersma(gray, w, h, lineScale, L);
    const output = new Uint8ClampedArray(w * h);
    const { axis, wave } = algo;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let t = 127;
        const val = lineScale < 1 ? 1 : lineScale;
        if (axis === 'x') {
          t = wave === 'sine'
            ? 127.5 + 127.5 * Math.sin((x * val) / 10)
            : (Math.floor(x / val) % 2) * 255;
        } else if (axis === 'y') {
          t = 127.5 + 127.5 * Math.sin((y * val) / 10);
        } else if (axis === 'radial') {
          const dist = Math.sqrt((x - w / 2) ** 2 + (y - h / 2) ** 2);
          t = 127.5 + 127.5 * Math.sin((dist * val) / 10);
        }
        const jitter = (t - 127) * 0.8;
        const g = Math.max(0, Math.min(255, gray[y * w + x] + jitter));
        output[y * w + x] = quantizeToLevels(g, L);
      }
    }
    return output;
  }

  if (category === 'Pattern') {
    const output = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      const y = Math.floor(i / w);
      let factor = 1;
      if (algo === 'checker') factor = (x + y) % 2 === 0 ? 1.1 : 0.9;
      else if (algo === 'grid') factor = x % lineScale === 0 || y % lineScale === 0 ? 1.2 : 0.9;
      else if (algo === 'random') factor = Math.random() > 0.5 ? 1.2 : 0.8;
      else if (algo === 'gradient') factor = gray[i] > ((x * y) % 255) ? 1.1 : 0.9;

      const g = Math.max(0, Math.min(255, gray[i] * factor));
      output[i] = quantizeToLevels(g, L);
    }
    return output;
  }

  return gray;
};

const applyOstromoukhov = (gray, w, h, levels) => {
  const pixels = new Float32Array(gray);
  const L = Math.max(2, levels | 0);

  const getCoefficients = val => {
    const v = val / 255;
    if (v < 0.25) return [13, 0, 5];
    if (v < 0.5) return [6, 13, 0];
    if (v < 0.75) return [0, 7, 13];
    return [3, 5, 13];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const oldVal = pixels[idx];
      const newVal = quantizeToLevels(oldVal, L);
      pixels[idx] = newVal;
      const err = oldVal - newVal;
      const [c1, c2, c3] = getCoefficients(oldVal);
      const sum = c1 + c2 + c3;
      if (x + 1 < w) pixels[y * w + (x + 1)] += (err * c1) / sum;
      if (y + 1 < h && x - 1 >= 0) pixels[(y + 1) * w + (x - 1)] += (err * c2) / sum;
      if (y + 1 < h) pixels[(y + 1) * w + x] += (err * c3) / sum;
    }
  }
  return Uint8ClampedArray.from(pixels.map(v => Math.max(0, Math.min(255, v))));
};

const applyRiemersma = (gray, w, h, intensity, levels) => {
  const output = new Uint8ClampedArray(gray);
  const pixels = new Float32Array(gray);
  let error = 0;
  const damping = Math.max(0.1, Math.min(0.9, intensity / 20));
  const L = Math.max(2, levels | 0);

  for (let y = 0; y < h; y++) {
    const isEven = y % 2 === 0;
    for (let x = 0; x < w; x++) {
      const realX = isEven ? x : w - 1 - x;
      const idx = y * w + realX;
      const val = pixels[idx] + error;
      const out = quantizeToLevels(val, L);
      output[idx] = out;
      error = (val - out) * damping;
    }
  }
  return output;
};

const applyDepth = (dithered, w, h, depth) => {
  const output = new Uint8ClampedArray(dithered);
  const offset = Math.floor(depth);
  if (offset === 0) return dithered;
  for (let y = 0; y < h; y++) {
    for (let x = offset; x < w; x++) {
      if (dithered[y * w + x] < 255) output[y * w + (x - offset)] = dithered[y * w + x];
    }
  }
  return output;
};

const applyPalette = (gray, colors) => {
  const output = new Uint8ClampedArray(gray.length * 3);
  const stops = Math.max(1, colors.length - 1);
  for (let i = 0; i < gray.length; i++) {
    const pos = (gray[i] / 255) * stops;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const c1 = colors[Math.min(idx, stops)] || [0, 0, 0];
    const c2 = colors[Math.min(idx + 1, stops)] || [0, 0, 0];
    output[i * 3] = c1[0] + (c2[0] - c1[0]) * frac;
    output[i * 3 + 1] = c1[1] + (c2[1] - c1[1]) * frac;
    output[i * 3 + 2] = c1[2] + (c2[2] - c1[2]) * frac;
  }
  return output;
};

/* --------------------------- 4. MAIN APP ----------------------------- */

export default function App() {
  const [mediaType, setMediaType] = useState(null);
  const [sourceUrl, setSourceUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const [mediaDims, setMediaDims] = useState(null);

  const [scale, setScale] = useState(4);
  const [style, setStyle] = useState('Atkinson');
  const [selectedCategory, setSelectedCategory] = useState('Error Diffusion');

  const [paletteCategory, setPaletteCategory] = useState('CyberGB');
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [customStops, setCustomStops] = useState([
    '#ff9a3c',
    '#ff4b6c',
    '#4a36ff',
  ]);

  const [contrast, setContrast] = useState(45);
  const [midtones, setMidtones] = useState(50);
  const [highlights, setHighlights] = useState(50);
  const [threshold, setThreshold] = useState(128);
  const [blur, setBlur] = useState(0);

  const [lineScale, setLineScale] = useState(4);
  const [bleed, setBleed] = useState(50);
  const [depth, setDepth] = useState(0);
  const [invert, setInvert] = useState(false);

  const canvasRef = useRef(null);
  const hiddenVideoRef = useRef(null);
  const hiddenImageRef = useRef(null);
  const fileInputRef = useRef(null);
  const workspaceRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const availableStyles = useMemo(
    () => Object.keys(ALGORITHM_CATEGORIES[selectedCategory] || {}),
    [selectedCategory],
  );

  const currentPalette = useMemo(() => {
    if (paletteCategory === 'Custom') {
      const raw = customStops.length ? customStops : ['#ffffff', '#000000'];
      return raw.map(hexToRgb);
    }
    const cat = PALETTE_PRESETS[paletteCategory] || PALETTE_PRESETS.CyberGB;
    const raw = cat[paletteIdx] || cat[0];
    return raw.map(hexToRgb);
  }, [paletteCategory, paletteIdx, customStops]);

  useEffect(() => {
    if (availableStyles.length > 0 && !availableStyles.includes(style)) {
      setStyle(availableStyles[0]);
    }
  }, [availableStyles, style]);

  const handleFileUpload = file => {
    if (!file) return;
    setIsPlaying(false);
    setIsRecording(false);
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    setMediaDims(null);
    if (file.type.startsWith('video')) {
      setMediaType('video');
      setIsPlaying(true);
    } else {
      setMediaType('image');
      setIsPlaying(false);
    }
  };

  const onFileInputChange = e => {
    handleFileUpload(e.target.files?.[0] || null);
  };

  const computeRenderSize = useCallback(
    (intrinsicW, intrinsicH) => {
      const workspace = workspaceRef.current;
      if (!workspace) return { w: intrinsicW, h: intrinsicH };
      const padding = 96;
      const maxW = Math.max(260, workspace.clientWidth - padding);
      const maxH = Math.max(260, workspace.clientHeight - padding);
      const s = Math.min(maxW / intrinsicW, maxH / intrinsicH, 1);
      return {
        w: Math.max(1, Math.floor(intrinsicW * s)),
        h: Math.max(1, Math.floor(intrinsicH * s)),
      };
    },
    [],
  );

  const processFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let srcW, srcH;
    let source;

    if (mediaType === 'video') {
      const video = hiddenVideoRef.current;
      if (!video || video.readyState < 2) return;
      srcW = video.videoWidth;
      srcH = video.videoHeight;
      source = video;
    } else {
      const img = hiddenImageRef.current;
      if (!img) return;
      srcW = img.naturalWidth || img.width;
      srcH = img.naturalHeight || img.height;
      source = img;
    }

    if (!srcW || !srcH || !source) return;

    if (!mediaDims || mediaDims.w !== srcW || mediaDims.h !== srcH) {
      setMediaDims({ w: srcW, h: srcH });
    }

    const { w, h } = computeRenderSize(srcW, srcH);

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, w, h);
    ctx.filter = 'none';

    const imageData = ctx.getImageData(0, 0, w, h);

    const result = processImage(imageData, {
      scale,
      style,
      palette: currentPalette,
      lineScale,
      bleed,
      contrast,
      midtones,
      highlights,
      depth,
      invert,
      threshold,
    });

    ctx.putImageData(result, 0, 0);
  }, [
    mediaType,
    mediaDims,
    scale,
    style,
    currentPalette,
    lineScale,
    bleed,
    contrast,
    midtones,
    highlights,
    depth,
    invert,
    threshold,
    blur,
    computeRenderSize,
  ]);

  useEffect(() => {
    if (!mediaType || !sourceUrl) return;

    if (mediaType === 'image') {
      processFrame();
      return;
    }

    const video = hiddenVideoRef.current;
    if (!video) return;

    if (isPlaying) {
      let id;
      const loop = () => {
        processFrame();
        id = requestAnimationFrame(loop);
      };
      video
        .play()
        .catch(() => {})
        .finally(() => {
          loop();
        });
      return () => {
        if (id) cancelAnimationFrame(id);
      };
    } else {
      video.pause();
      processFrame();
    }
  }, [mediaType, sourceUrl, isPlaying, processFrame]);

  useEffect(() => {
    const onResize = () => {
      if (sourceUrl) processFrame();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [sourceUrl, processFrame]);

  const handleDrop = e => {
    e.preventDefault();
    handleFileUpload(e.dataTransfer.files?.[0] || null);
  };

  const toggleRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
      alert('Recording is not supported in this browser.');
      return;
    }

    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    const stream = canvas.captureStream(30);
    let options = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType || '')) {
      options = { mimeType: 'video/webm' };
    }

    const mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = mediaRecorder;
    recordedChunksRef.current = [];

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ex-dithera-session.webm';
      a.click();
      URL.revokeObjectURL(url);
    };
    mediaRecorder.start();
    setIsRecording(true);
    if (mediaType === 'video' && !isPlaying) setIsPlaying(true);
  };

  const handleStaticExport = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'ex-dithera-frame.png';
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const handleReset = () => {
    setScale(4);
    setContrast(45);
    setThreshold(128);
    setBlur(0);
    setBleed(50);
    setDepth(0);
    setInvert(false);
    setSelectedCategory('Error Diffusion');
    setStyle('Atkinson');
    setPaletteCategory('CyberGB');
    setPaletteIdx(0);
    setCustomStops(['#ff9a3c', '#ff4b6c', '#4a36ff']);
    setMidtones(50);
    setHighlights(50);
    setLineScale(4);
  };

  const togglePlayback = () => {
    if (mediaType === 'video') setIsPlaying(p => !p);
  };

  const ControlGroup = ({
    label,
    value,
    min,
    max,
    onChange,
  }) => (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-[9px] uppercase tracking-[0.22em]">
        <span className="text-orange-400">{label}</span>
        <span className="font-mono text-orange-500">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded bg-orange-900/30 accent-orange-400"
      />
    </div>
  );

  const paletteNames = [...Object.keys(PALETTE_PRESETS), 'Custom'];

  const updateCustomStop = (index, color) => {
    setCustomStops(stops => stops.map((c, i) => (i === index ? color : c)));
  };

  const addCustomStop = () => {
    setCustomStops(stops => [...stops, '#ffffff']);
  };

  const removeCustomStop = index => {
    setCustomStops(stops => {
      if (stops.length <= 2) return stops;
      return stops.filter((_, i) => i !== index);
    });
  };

  return (
    <div className="h-screen bg-black text-orange-300 font-mono">
      {/* hidden media */}
      <img
        ref={hiddenImageRef}
        src={mediaType === 'image' ? sourceUrl ?? '' : ''}
        className="hidden"
        onLoad={e => {
          const img = e.currentTarget;
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          setMediaDims({ w, h });
          processFrame();
        }}
        alt="source"
      />
      <video
        ref={hiddenVideoRef}
        src={mediaType === 'video' ? sourceUrl ?? '' : ''}
        className="hidden"
        loop
        muted
        playsInline
        onLoadedMetadata={e => {
          const video = e.currentTarget;
          const w = video.videoWidth;
          const h = video.videoHeight;
          setMediaDims({ w, h });
          if (isPlaying) processFrame();
        }}
      />

      <div className="flex h-full flex-col">
        {/* TOP BAR */}
        <header className="flex flex-none items-center justify-between border-b border-orange-500 px-8 py-3 text-[9px] uppercase tracking-[0.35em]">
          <div className="flex items-center gap-4">
            <div className="flex h-8 w-8 items-center justify-center border border-orange-500">
              <span className="text-[9px] font-black tracking-[0.4em] text-orange-400">EX</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-orange-400">Editing Current Parameter</span>
              <span className="text-[9px] text-orange-600">
                No. Dead Pixels: {mediaDims ? `${mediaDims.w}×${mediaDims.h}` : '—'}
              </span>
            </div>
          </div>
          <div className="flex items-end gap-2 text-[9px]">
            <div className="flex flex-col items-end gap-1">
              <span className="text-orange-500">DITHER MACHINE 96</span>
              <span className="text-orange-700">DITHERING ENGINE</span>
            </div>
          </div>
        </header>

        {/* MIDDLE AREA */}
        <div className="flex min-h-0 flex-1">
          {/* CENTRAL VIEWPORT */}
          <section
            ref={workspaceRef}
            className="relative flex min-w-0 flex-1 items-center justify-center px-8 py-6"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            {sourceUrl ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between border border-orange-500 px-4 py-1 text-[8px] uppercase tracking-[0.3em]">
                  <span>Cityscape Heightmap</span>
                  <span>{mediaType === 'video' ? 'Live Stream' : 'Static Frame'}</span>
                </div>

                <div className="relative border border-orange-500 p-3">
                  <div className="pointer-events-none absolute inset-3 border border-orange-700" />
                  <div className="pointer-events-none absolute inset-3">
                    <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(255,153,0,0.18),_transparent_70%)]" />
                  </div>
                  <canvas
                    ref={canvasRef}
                    className="relative block bg-black"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>

                <div className="flex items-center justify-between border border-orange-500 px-4 py-1 text-[8px] uppercase tracking-[0.3em]">
                  <span>Scale {scale} • Depth {depth}</span>
                  <span>Engine {selectedCategory}</span>
                </div>
              </div>
            ) : (
              <div className="max-w-lg border border-dashed border-orange-500 px-12 py-14 text-center text-[10px]">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-orange-500">
                  <Upload size={30} />
                </div>
                <p className="uppercase tracking-[0.4em] text-orange-400">
                  Drop Media Into Workspace
                </p>
                <p className="mt-3 text-orange-600">
                  Drag an image or video here, or use the{' '}
                  <span className="text-orange-300">IMPORT</span> control on the right.
                </p>
                <p className="mt-1 text-[9px] text-orange-700">
                  PNG · JPG · GIF · MP4 · WEBM
                </p>
              </div>
            )}
          </section>

          {/* RIGHT CONTROL COLUMN */}
          <aside className="flex w-80 flex-shrink-0 flex-col border-l border-orange-500 text-[9px] uppercase tracking-[0.3em]">
            <div className="border-b border-orange-500 px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span>TOOLS AREA</span>
                <Layers size={12} />
              </div>
              <div className="flex items-center justify-between text-[8px] text-orange-600">
                <span>User: EX_9022X</span>
                <span>Session: 86-01</span>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
              {/* Import / export / playback row */}
              <div className="grid grid-cols-2 gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/mp4,video/webm"
                  onChange={onFileInputChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-9 items-center justify-center gap-2 border border-orange-500 bg-black text-orange-300"
                >
                  <ImageIcon size={12} /> Import
                </button>

                <button
                  onClick={mediaType === 'video' ? togglePlayback : handleStaticExport}
                  disabled={!sourceUrl}
                  className={`flex h-9 items-center justify-center gap-2 border ${
                    !sourceUrl
                      ? 'border-orange-900 text-orange-900'
                      : 'border-orange-500 text-orange-300'
                  }`}
                >
                  {mediaType === 'video' ? (
                    <>
                      <Video size={11} /> {isPlaying ? 'Pause' : 'Play'}
                    </>
                  ) : (
                    <>
                      <Download size={11} /> Export
                    </>
                  )}
                </button>
              </div>

              {mediaType === 'video' && (
                <button
                  onClick={toggleRecording}
                  disabled={!sourceUrl}
                  className={`flex w-full items-center justify-center gap-2 border px-3 py-2 ${
                    !sourceUrl
                      ? 'border-orange-900 text-orange-900'
                      : isRecording
                      ? 'border-red-500 bg-red-600 text-black'
                      : 'border-orange-500 text-orange-300'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <Disc size={11} /> Stop Capture
                    </>
                  ) : (
                    <>
                      <Video size={11} /> Record Stream
                    </>
                  )}
                </button>
              )}

              <button
                onClick={handleReset}
                className="flex w-full items-center justify-center gap-2 border border-orange-600 px-3 py-2 text-orange-300"
              >
                <RotateCcw size={11} /> Reset Parameters
              </button>

              {/* Algorithm categories */}
              <div className="border border-orange-600 p-3">
                <div className="mb-2 text-orange-400">DITHERING ALGORITHMS</div>
                <div className="space-y-1">
                  {Object.keys(ALGORITHM_CATEGORIES).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`flex w-full items-center justify-between border px-3 py-1 ${
                        selectedCategory === cat
                          ? 'border-orange-400 bg-orange-900/30'
                          : 'border-orange-700'
                      }`}
                    >
                      <span>{cat}</span>
                      <span className="text-[8px] text-orange-500">
                        {selectedCategory === cat ? 'ACTIVE' : ''}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-3 text-[8px] text-orange-500">Algorithm</div>
                <select
                  value={style}
                  onChange={e => setStyle(e.target.value)}
                  className="mt-1 w-full border border-orange-700 bg-black px-2 py-1 text-[9px] text-orange-200 outline-none"
                >
                  {availableStyles.map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Basic dials */}
              <div className="border border-orange-600 p-3">
                <div className="mb-2 text-orange-400">Basic Dials</div>
                <ControlGroup label="Pixel Scale" value={scale} min={1} max={20} onChange={setScale} />
                <ControlGroup
                  label="Pattern Scale"
                  value={lineScale}
                  min={1}
                  max={50}
                  onChange={setLineScale}
                />
                <ControlGroup
                  label="Depth Offset"
                  value={depth}
                  min={0}
                  max={20}
                  onChange={setDepth}
                />
                <ControlGroup
                  label="Threshold"
                  value={threshold}
                  min={0}
                  max={255}
                  onChange={setThreshold}
                />
              </div>

              {/* Color + Tone */}
              <div className="border border-orange-600 p-3">
                <div className="mb-2 text-orange-400">Color & Tone</div>

                <div className="mb-2 text-[8px] text-orange-500">Palette Bank</div>
                <select
                  value={paletteCategory}
                  onChange={e => {
                    const value = e.target.value;
                    setPaletteCategory(value);
                    setPaletteIdx(0);
                  }}
                  className="mb-2 w-full border border-orange-700 bg-black px-2 py-1 text-[9px] text-orange-200 outline-none"
                >
                  {paletteNames.map(p => (
                    <option key={p}>{p}</option>
                  ))}
                </select>

                {/* Preset palettes */}
                {paletteCategory !== 'Custom' && (
                  <div className="mb-3 space-y-2">
                    {(PALETTE_PRESETS[paletteCategory] || []).map((pal, idx) => (
                      <button
                        key={idx}
                        onClick={() => setPaletteIdx(idx)}
                        className={`relative flex h-7 w-full overflow-hidden border ${
                          paletteIdx === idx
                            ? 'border-orange-400'
                            : 'border-orange-700'
                        }`}
                      >
                        <div className="absolute inset-0 flex">
                          {pal.map((c, i) => (
                            <div key={i} style={{ background: c }} className="flex-1" />
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Custom palette editor */}
                {paletteCategory === 'Custom' && (
                  <div className="mb-3 space-y-2">
                    {customStops.map((color, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 border border-orange-700 px-2 py-1"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[8px]">Stop {idx + 1}</span>
                          <input
                            type="color"
                            value={color}
                            onChange={e => updateCustomStop(idx, e.target.value)}
                            className="h-6 w-10 cursor-pointer border border-orange-500 bg-transparent"
                          />
                        </div>
                        {customStops.length > 2 && (
                          <button
                            onClick={() => removeCustomStop(idx)}
                            className="text-[8px] text-orange-500"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={addCustomStop}
                      className="mt-1 w-full border border-orange-600 px-2 py-1 text-[8px]"
                    >
                      + Add Stop
                    </button>
                  </div>
                )}

                <ControlGroup
                  label="Contrast"
                  value={contrast}
                  min={0}
                  max={100}
                  onChange={setContrast}
                />
                <ControlGroup
                  label="Midtones"
                  value={midtones}
                  min={0}
                  max={100}
                  onChange={setMidtones}
                />
                <ControlGroup
                  label="Highlights"
                  value={highlights}
                  min={0}
                  max={100}
                  onChange={setHighlights}
                />
                <ControlGroup label="Bleed" value={bleed} min={0} max={100} onChange={setBleed} />
                <ControlGroup label="Pre-Blur" value={blur} min={0} max={20} onChange={setBlur} />

                <div className="mt-2 flex items-center justify-between">
                  <span>Invert</span>
                  <button
                    onClick={() => setInvert(i => !i)}
                    className={`px-2 py-0.5 text-[8px] ${
                      invert
                        ? 'bg-orange-400 text-black'
                        : 'border border-orange-700 text-orange-300'
                    }`}
                  >
                    {invert ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* BOTTOM BAR */}
        <footer className="flex flex-none items-center justify-between border-t border-orange-500 px-8 py-3 text-[8px] uppercase tracking-[0.3em]">
          <div className="flex gap-3">
            {['A', 'B', 'C', 'D'].map((slot, i) => (
              <div
                key={slot}
                className="flex items-center gap-2 border border-orange-600 px-3 py-2"
              >
                <div className="h-4 w-6 border border-orange-500" />
                <div className="flex flex-col">
                  <span>{slot} Slot</span>
                  <span className="text-[7px] text-orange-600">
                    {i === 0 ? 'Active' : 'Empty'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="ml-4 flex flex-col border border-orange-600 px-4 py-2 text-[7px] leading-tight text-orange-500">
            <span>// DITHER SCRIPT</span>
            <span>var ALGORITHM = dither.chooseAlgorithm('glitch');</span>
            <span>for (var i = 0; i &lt; pixels; i++) {'{'} diffuseError(); {'}'}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
