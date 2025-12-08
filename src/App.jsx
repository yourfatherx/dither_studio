'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Upload,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize,
  Video,
  Disc,
  Download,
  Image as ImageIcon,
  Settings,
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
        [1, 0, 7],
        [2, 0, 5],
        [-2, 1, 3],
        [-1, 1, 5],
        [0, 1, 7],
        [1, 1, 5],
        [2, 1, 3],
        [-2, 2, 1],
        [-1, 2, 3],
        [0, 2, 5],
        [1, 2, 3],
        [2, 2, 1],
      ],
    },
    Stucki: {
      divisor: 42,
      offsets: [
        [1, 0, 8],
        [2, 0, 4],
        [-2, 1, 2],
        [-1, 1, 4],
        [0, 1, 8],
        [1, 1, 4],
        [2, 1, 2],
        [-2, 2, 1],
        [-1, 2, 2],
        [0, 2, 4],
        [1, 2, 2],
        [2, 2, 1],
      ],
    },
    Burkes: {
      divisor: 32,
      offsets: [
        [1, 0, 8],
        [2, 0, 4],
        [-2, 1, 2],
        [-1, 1, 4],
        [0, 1, 8],
        [1, 1, 4],
        [2, 1, 2],
      ],
    },
    Sierra: {
      divisor: 32,
      offsets: [
        [1, 0, 5],
        [2, 0, 3],
        [-2, 1, 2],
        [-1, 1, 4],
        [0, 1, 5],
        [1, 1, 4],
        [2, 1, 2],
        [-1, 2, 2],
        [0, 2, 3],
        [1, 2, 2],
      ],
    },
    'Two-Row Sierra': {
      divisor: 16,
      offsets: [
        [1, 0, 4],
        [2, 0, 3],
        [-2, 1, 1],
        [-1, 1, 2],
        [0, 1, 3],
        [1, 1, 2],
        [2, 1, 1],
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
  Halloween: [
    ['#050505', '#4a5d23', '#d2691e', '#e6e6fa'],
    ['#000000', '#ff6600', '#ffffff'],
    ['#1a0505', '#5c0000', '#ff0000', '#ffcc00'],
  ],
  Retro: [
    ['#000000', '#ffffff'],
    ['#000000', '#ff0000', '#ffff00', '#ffffff'],
    ['#2b1b0e', '#704214', '#b5651d', '#e8c5a5'],
    ['#000000', '#00aaaa', '#aa00aa', '#aaaaaa'],
  ],
  Cyber: [
    ['#020617', '#22c55e', '#bbf7d0'],
    ['#0f172a', '#22c55e', '#4ade80', '#a3e635'],
    ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  ],
  Print: [
    ['#000000', '#00ffff', '#ff00ff', '#ffff00', '#ffffff'],
    [
      '#1a1c2c',
      '#5d275d',
      '#b13e53',
      '#ef7d57',
      '#ffcd75',
      '#a7f070',
      '#38b764',
      '#257179',
      '#29366f',
      '#3b5dc9',
      '#41a6f6',
      '#73eff7',
      '#f4f4f4',
      '#94b0c2',
      '#566c86',
      '#333c57',
    ],
  ],
};

/* ---------------------------- 2. HELPERS ----------------------------- */

const getBayerMatrix = (size) => {
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

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0, 0, 0];
};

/* ------------------------ 3. IMAGE PROCESSING ------------------------ */

const processImage = (imageData, settings) => {
  const { width, height, data } = imageData;
  const { scale, style, palette, lineScale, bleed, contrast, midtones, highlights, depth, invert, threshold } =
    settings;

  const s = Math.max(1, scale);
  const scaledW = Math.max(1, Math.floor(width / s));
  const scaledH = Math.max(1, Math.floor(height / s));
  const gray = new Uint8ClampedArray(scaledW * scaledH);

  // grayscale + downscale
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
  let dithered = applyDither(adjusted, scaledW, scaledH, style, lineScale, bleed);
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

const applyAdjustments = (
  gray,
  {
    contrast,
    midtones,
    highlights,
    invert,
    threshold,
  },
) => {
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

const applyDither = (
  gray,
  w,
  h,
  style,
  lineScale,
  bleed,
) => {
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

  if (category === 'Error Diffusion') {
    if (algo.type === 'variable') return applyOstromoukhov(gray, w, h);
    const pixels = new Float32Array(gray);
    const { divisor, offsets } = algo;
    const bleedFactor = 0.5 + bleed / 100;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const oldVal = pixels[idx];
        const newVal = oldVal > 127 ? 255 : 0;
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
      let t = 127;
      if (isMatrix && matrix) t = matrix[y % size][x % size];
      else {
        if (algo === 'hlines') t = y % lineScale < lineScale / 2 ? 20 : 230;
        else if (algo === 'vlines') t = x % lineScale < lineScale / 2 ? 20 : 230;
        else if (algo === 'dlines') t = (x + y) % lineScale < lineScale / 2 ? 20 : 230;
      }
      output[i] = gray[i] > t ? 255 : 0;
    }
    return output;
  }

  if (category === 'Organic') {
    const output = new Uint8ClampedArray(w * h);
    if (algo === 'bluenoise') {
      const noise = generateBlueNoise(w, h);
      for (let i = 0; i < gray.length; i++) output[i] = gray[i] > noise[i] ? 255 : 0;
    } else if (algo === 'whitenoise') {
      for (let i = 0; i < gray.length; i++) output[i] = gray[i] > Math.random() * 255 ? 255 : 0;
    } else {
      for (let i = 0; i < gray.length; i++) output[i] = Math.random() > gray[i] / 255 ? 255 : 0;
    }
    return output;
  }

  if (category === 'Modulation') {
    if (algo === 'riemersma') return applyRiemersma(gray, w, h, lineScale);
    const output = new Uint8ClampedArray(w * h);
    const { axis, wave } = algo;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let t = 127;
        const val = lineScale < 1 ? 1 : lineScale;
        if (axis === 'x') {
          t = wave === 'sine' ? 127.5 + 127.5 * Math.sin((x * val) / 10) : (Math.floor(x / val) % 2) * 255;
        } else if (axis === 'y') {
          t = 127.5 + 127.5 * Math.sin((y * val) / 10);
        } else if (axis === 'radial') {
          const dist = Math.sqrt((x - w / 2) ** 2 + (y - h / 2) ** 2);
          t = 127.5 + 127.5 * Math.sin((dist * val) / 10);
        }
        const idx = y * w + x;
        output[idx] = gray[idx] > t ? 255 : 0;
      }
    }
    return output;
  }

  if (category === 'Pattern') {
    const output = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      const y = Math.floor(i / w);
      let k = true;
      if (algo === 'checker') k = (x + y) % 2 === 0;
      else if (algo === 'grid') k = x % lineScale === 0 || y % lineScale === 0;
      else if (algo === 'random') k = Math.random() > 0.5;
      else if (algo === 'gradient') k = gray[i] > ((x * y) % 255);
      output[i] = k ? (gray[i] > 127 ? 255 : 0) : gray[i] > 200 ? 255 : 0;
    }
    return output;
  }

  return gray;
};

const applyOstromoukhov = (gray, w, h) => {
  const pixels = new Float32Array(gray);
  const getCoefficients = (val) => {
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
      const newVal = oldVal > 127 ? 255 : 0;
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

const applyRiemersma = (
  gray,
  w,
  h,
  intensity,
) => {
  const output = new Uint8ClampedArray(gray);
  const pixels = new Float32Array(gray);
  let error = 0;
  const damping = Math.max(0.1, Math.min(0.9, intensity / 20));

  for (let y = 0; y < h; y++) {
    const isEven = y % 2 === 0;
    for (let x = 0; x < w; x++) {
      const realX = isEven ? x : w - 1 - x;
      const idx = y * w + realX;
      const val = pixels[idx] + error;
      const out = val > 127 ? 255 : 0;
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
      if (dithered[y * w + x] === 0) output[y * w + (x - offset)] = 0;
    }
  }
  return output;
};

const applyPalette = (
  gray,
  colors,
) => {
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

  const [zoom, setZoom] = useState(1);
  const [showSettings, setShowSettings] = useState(true);

  const [scale, setScale] = useState(4);
  const [style, setStyle] = useState('Atkinson');
  const [selectedCategory, setSelectedCategory] = useState('Error Diffusion');

  const [paletteCategory, setPaletteCategory] = useState('Cyber');
  const [paletteIdx, setPaletteIdx] = useState(1);

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
  const containerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const availableStyles = useMemo(
    () => Object.keys(ALGORITHM_CATEGORIES[selectedCategory] || {}),
    [selectedCategory],
  );

  const currentPalette = useMemo(() => {
    const cat = PALETTE_PRESETS[paletteCategory] || PALETTE_PRESETS.Cyber;
    const raw = cat[paletteIdx] || cat[0];
    return raw.map(hexToRgb);
  }, [paletteCategory, paletteIdx]);

  useEffect(() => {
    if (availableStyles.length > 0 && !availableStyles.includes(style)) {
      setStyle(availableStyles[0]);
    }
  }, [availableStyles, style]);

  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    let w = 800;
    let h = 600;

    if (mediaType === 'image' && hiddenImageRef.current) {
      w = hiddenImageRef.current.naturalWidth || hiddenImageRef.current.width;
      h = hiddenImageRef.current.naturalHeight || hiddenImageRef.current.height;
    } else if (mediaType === 'video' && hiddenVideoRef.current) {
      w = hiddenVideoRef.current.videoWidth;
      h = hiddenVideoRef.current.videoHeight;
    }

    if (!w || !h) return;

    const { clientWidth, clientHeight } = containerRef.current;
    const scaleX = (clientWidth * 0.9) / w;
    const scaleY = (clientHeight * 0.9) / h;
    setZoom(Math.min(scaleX, scaleY));
  }, [mediaType]);

  const handleFileUpload = (file) => {
    if (!file) return;
    setIsPlaying(false);
    setIsRecording(false);
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    if (file.type.startsWith('video')) {
      setMediaType('video');
      setIsPlaying(true);
    } else {
      setMediaType('image');
      setIsPlaying(false);
    }
  };

  const onFileInputChange = (e) => {
    const file = e.target.files?.[0] || null;
    handleFileUpload(file);
  };

  const processFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let w;
    let h;
    let source = null;

    if (mediaType === 'video') {
      const video = hiddenVideoRef.current;
      if (!video || video.paused || video.ended) return;
      w = video.videoWidth;
      h = video.videoHeight;
      source = video;
    } else {
      const img = hiddenImageRef.current;
      if (!img) return;

      // IMPORTANT FIX: use naturalWidth / naturalHeight for hidden image
      w = img.naturalWidth || img.width;
      h = img.naturalHeight || img.height;
      source = img;
    }

    if (!w || !h || !source) return;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(source, 0, 0, w, h);
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

    if (mediaType === 'video' && isPlaying) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
    }
  }, [
    mediaType,
    isPlaying,
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
  ]);

  useEffect(() => {
    if (!mediaType || !sourceUrl) return;

    if (mediaType === 'image') {
      const id = requestAnimationFrame(processFrame);
      return () => cancelAnimationFrame(id);
    }

    if (mediaType === 'video') {
      const video = hiddenVideoRef.current;
      if (video) {
        video.play().catch(() => undefined);
      }
      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(processFrame);
        return () => {
          if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
        };
      } else if (video) {
        video.pause();
      }
    }
  }, [mediaType, sourceUrl, isPlaying, processFrame]);

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0] || null;
    handleFileUpload(file);
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
    setPaletteCategory('Cyber');
    setPaletteIdx(1);
    setMidtones(50);
    setHighlights(50);
    setLineScale(4);
  };

  const zoomIn = () => setZoom(z => Math.min(z * 1.15, 4));
  const zoomOut = () => setZoom(z => Math.max(z / 1.15, 0.25));

  const ControlGroup = ({ label, value, min, max, onChange, highlight, subLabel }) => (
    <div className="mb-3">
      <div className="flex justify-between text-[11px] mb-1">
        <span className={highlight ? 'text-lime-400 font-semibold' : 'text-slate-400'}>{label}</span>
        <span className="font-mono text-slate-500">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-lime-400"
      />
      {subLabel && <div className="text-[10px] text-slate-500 mt-1">{subLabel}</div>}
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-black text-slate-200 selection:bg-lime-400 selection:text-black">
      {/* hidden media */}
      <img
        ref={hiddenImageRef}
        src={mediaType === 'image' ? sourceUrl ?? '' : ''}
        className="hidden"
        onLoad={() => {
          fitToScreen();
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
        onLoadedMetadata={() => {
          fitToScreen();
          if (isPlaying) processFrame();
        }}
      />

      {/* top bar */}
      <header className="relative z-20 flex h-14 items-center justify-between border-b border-lime-400/10 bg-gradient-to-r from-black via-slate-950/60 to-black px-6">
        <div className="flex items-center gap-4">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-md bg-lime-400/10 ring-1 ring-lime-300/40 shadow-[0_0_30px_rgba(190,242,100,0.6)]">
            <span className="text-xs font-black tracking-wider text-lime-300">EX</span>
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,#22c55e44,transparent_65%)]" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="bg-gradient-to-r from-lime-300 via-lime-400 to-emerald-300 bg-clip-text text-sm font-black tracking-[0.35em] text-transparent">
                EX DITHERA
              </span>
              <span className="rounded-full bg-lime-400/10 px-2 py-0.5 text-[10px] font-semibold text-lime-300">
                REALTIME
              </span>
            </div>
            <span className="mt-0.5 text-[11px] text-slate-500">
              Adaptive error–diffusion lab for video &amp; still frames.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">GPU STATUS</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full w-4/5 bg-gradient-to-r from-lime-300 via-lime-400 to-emerald-400" />
              </div>
              <span className="font-mono text-lime-300">80%</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSettings(s => !s)}
              className={`flex h-8 w-8 items-center justify-center rounded-md border border-lime-400/20 bg-black/60 text-slate-400 transition hover:border-lime-300/60 hover:text-lime-200 ${
                showSettings ? 'ring-1 ring-lime-300/60 text-lime-300' : ''
              }`}
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* layout */}
      <main className="flex flex-1 overflow-hidden">
        {/* left metrics */}
        <aside className="hidden w-64 flex-col border-r border-lime-400/10 bg-gradient-to-b from-black via-slate-950 to-black/90 px-4 py-4 lg:flex">
          <div className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Session Metrics
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-lime-400/20 bg-black/60 p-3 shadow-[0_0_20px_rgba(74,222,128,0.12)]">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Active Frames</span>
                <span className="text-lime-400">Live</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-lime-300">7</span>
                <span className="text-[10px] text-emerald-400/80">+2 new</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-lime-400/10 bg-black/70 p-2.5">
                <div className="text-[10px] text-slate-500">Error Glitching</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-semibold text-lime-300">{bleed}</span>
                  <span className="text-[10px] text-slate-500">%</span>
                </div>
              </div>
              <div className="rounded-xl border border-lime-400/10 bg-black/70 p-2.5">
                <div className="text-[10px] text-slate-500">Pixel Scale</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-semibold text-lime-300">{scale}</span>
                  <span className="text-[10px] text-slate-500">x</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-lime-400/10 bg-black/80 p-3">
              <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                <span>Histogram Balance</span>
                <span className="text-lime-300">Stable</span>
              </div>
              <div className="flex h-10 items-end gap-1">
                {[40, 65, 80, 60, 45, 30].map((hgt, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-full bg-gradient-to-t from-slate-900 via-lime-400/40 to-lime-300/90"
                    style={{ height: `${hgt}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* center viewport */}
        <section className="relative flex flex-1 flex-col bg-gradient-to-b from-black via-slate-950 to-black">
          {/* EX DITHERA glyph */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-4">
            <div className="flex flex-col items-center opacity-80">
              <span className="bg-gradient-to-r from-lime-300 via-lime-500 to-amber-300 bg-clip-text text-xs font-black tracking-[0.6em] text-transparent">
                EX
              </span>
              <span className="mt-0.5 bg-gradient-to-r from-lime-200 to-lime-400 bg-clip-text text-[10px] font-bold tracking-[0.4em] text-transparent">
                DITHERA
              </span>
              <div className="mt-1 h-8 w-px bg-gradient-to-b from-lime-300/80 via-lime-500/40 to-transparent" />
            </div>
          </div>

          <div
            ref={containerRef}
            className="relative flex flex-1 items-center justify-center px-6 pb-8 pt-10"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            {sourceUrl ? (
              <div
                style={{ transform: `scale(${zoom})` }}
                className="relative origin-center rounded-2xl border border-lime-400/20 bg-black/80 shadow-[0_0_45px_rgba(190,242,100,0.25)] transition-transform duration-150"
              >
                <canvas
                  ref={canvasRef}
                  style={{ imageRendering: 'pixelated', display: 'block' }}
                  className="rounded-2xl"
                />
                <div className="pointer-events-none absolute inset-0 rounded-2xl border border-lime-300/10 shadow-[inset_0_0_60px_rgba(15,23,42,0.8)]" />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-lime-400/30 bg-black/70 px-10 py-16 text-center text-slate-500 shadow-[0_0_40px_rgba(15,23,42,0.8)]">
                <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-lime-400/40 bg-gradient-to-b from-black via-slate-950 to-black shadow-[0_0_40px_rgba(190,242,100,0.3)]">
                  <Upload size={34} className="text-lime-300" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-lime-300">
                  Drop Media
                </p>
                <p className="mt-2 text-[11px] text-slate-500">
                  Drag an image or video here, or click <span className="text-lime-300">Import</span> in
                  the control rail.
                </p>
                <p className="mt-1 text-[10px] text-slate-600">
                  Supports PNG, JPG, GIF, MP4, WEBM
                </p>
              </div>
            )}

            {/* zoom bar */}
            <div className="pointer-events-auto absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-lime-400/20 bg-black/80 px-3 py-1.5 text-[11px] text-slate-300 shadow-[0_0_30px_rgba(15,23,42,0.9)]">
              <button
                onClick={zoomOut}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/70 text-slate-300 transition hover:bg-lime-400/20 hover:text-lime-300"
              >
                <ZoomOut size={14} />
              </button>
              <div className="mx-1 flex items-center gap-2">
                <span className="font-mono text-slate-400">{(zoom * 100).toFixed(0)}%</span>
                <span className="h-1 w-20 overflow-hidden rounded-full bg-slate-900">
                  <span
                    className="block h-full bg-gradient-to-r from-lime-300 via-lime-500 to-emerald-400"
                    style={{ width: `${Math.min(100, Math.max(zoom * 100, 5))}%` }}
                  />
                </span>
              </div>
              <button
                onClick={zoomIn}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/70 text-slate-300 transition hover:bg-lime-400/20 hover:text-lime-300"
              >
                <ZoomIn size={14} />
              </button>
              <button
                onClick={fitToScreen}
                className="ml-1 flex h-7 items-center gap-1 rounded-full bg-gradient-to-r from-lime-400/20 via-lime-500/20 to-emerald-400/20 px-2 text-[10px] font-semibold text-lime-200 ring-1 ring-lime-400/40 hover:from-lime-400/30 hover:via-lime-500/30 hover:to-emerald-400/30"
              >
                <Maximize size={12} />
                Fit
              </button>
            </div>
          </div>

          {/* bottom mobile actions */}
          <div className="flex border-t border-lime-400/10 bg-black/80 px-4 py-3 text-[11px] lg:hidden">
            <div className="flex flex-1 items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/mp4,video/webm"
                onChange={onFileInputChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 rounded-md bg-lime-500/10 px-3 py-1.5 font-semibold text-lime-300 ring-1 ring-lime-400/60"
              >
                <ImageIcon size={13} /> Import
              </button>
              <button
                onClick={mediaType === 'video' ? toggleRecording : handleStaticExport}
                disabled={!sourceUrl}
                className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-semibold ${
                  sourceUrl
                    ? 'bg-slate-900 text-slate-200 ring-1 ring-lime-300/40 hover:bg-lime-500/10 hover:text-lime-200'
                    : 'bg-slate-900 text-slate-600 ring-1 ring-slate-700'
                }`}
              >
                {mediaType === 'video' ? (
                  isRecording ? (
                    <>
                      <Disc size={12} className="text-red-400" /> Stop
                    </>
                  ) : (
                    <>
                      <Video size={12} /> Record
                    </>
                  )
                ) : (
                  <>
                    <Download size={12} /> Export
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* right control rail */}
        <aside
          className={`z-20 flex w-80 flex-col border-l border-lime-400/10 bg-gradient-to-b from-black via-slate-950 to-black/90 transition-transform duration-300 ${
            showSettings ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-lime-400/10 px-5 py-3 text-[11px] uppercase tracking-[0.2em] text-slate-500">
            <span>Control Rail</span>
            <span className="rounded-full bg-lime-500/10 px-2 py-0.5 text-[10px] font-semibold text-lime-300">
              EX Engine
            </span>
          </div>
          <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto px-5 py-4">
            {/* import/export */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/mp4,video/webm"
                onChange={onFileInputChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-lg border border-lime-400/40 bg-gradient-to-b from-black via-slate-950 to-black px-3 py-2 font-semibold text-lime-200 shadow-[0_0_25px_rgba(190,242,100,0.25)] hover:border-lime-200"
              >
                <ImageIcon size={14} /> Import
              </button>

              <button
                onClick={mediaType === 'video' ? toggleRecording : handleStaticExport}
                disabled={!sourceUrl}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 font-semibold shadow-sm ${
                  mediaType === 'video'
                    ? isRecording
                      ? 'border-red-500 bg-red-500 text-black animate-pulse'
                      : sourceUrl
                      ? 'border-lime-400/40 bg-black text-slate-200 hover:bg-lime-500/10'
                      : 'border-slate-700 bg-black text-slate-700'
                    : sourceUrl
                    ? 'border-lime-400/40 bg-black text-slate-200 hover:bg-lime-500/10'
                    : 'border-slate-700 bg-black text-slate-700'
                }`}
              >
                {mediaType === 'video' ? (
                  isRecording ? (
                    <>
                      <Disc size={13} /> Stop
                    </>
                  ) : (
                    <>
                      <Video size={13} /> Record
                    </>
                  )
                ) : (
                  <>
                    <Download size={13} /> Export
                  </>
                )}
              </button>
            </div>

            {/* dither engine */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-lime-300">
                <Layers size={12} /> Dither Engine
              </div>
              <div className="space-y-2 text-[11px]">
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-black/80 px-3 py-2 text-xs text-slate-200 outline-none ring-lime-400/40 focus:border-lime-300 focus:ring-1"
                >
                  {Object.keys(ALGORITHM_CATEGORIES).map(cat => (
                    <option key={cat}>{cat}</option>
                  ))}
                </select>
                <select
                  value={style}
                  onChange={e => setStyle(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-black/80 px-3 py-2 text-xs text-slate-200 outline-none ring-lime-400/40 focus:border-lime-300 focus:ring-1"
                >
                  {availableStyles.map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* main controls */}
            <div className="space-y-1">
              <ControlGroup
                label="Pixel Scale"
                value={scale}
                min={1}
                max={20}
                onChange={setScale}
                highlight
                subLabel="Controls pixelation intensity."
              />
              <ControlGroup
                label="Pattern Scale"
                value={lineScale}
                min={1}
                max={50}
                onChange={setLineScale}
                subLabel="Used by line / modulation patterns."
              />
            </div>

            {/* palette */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-lime-300">
                <ImageIcon size={12} /> Color Pipeline
              </div>
              <select
                value={paletteCategory}
                onChange={e => {
                  setPaletteCategory(e.target.value);
                  setPaletteIdx(0);
                }}
                className="mb-3 w-full rounded-lg border border-slate-800 bg-black/80 px-3 py-2 text-xs text-slate-200 outline-none ring-lime-400/40 focus:border-lime-300 focus:ring-1"
              >
                {Object.keys(PALETTE_PRESETS).map(p => (
                  <option key={p}>{p}</option>
                ))}
              </select>

              <div className="grid grid-cols-1 gap-2">
                {(PALETTE_PRESETS[paletteCategory] || []).map((pal, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPaletteIdx(idx)}
                    className={`relative flex h-8 w-full overflow-hidden rounded-lg border transition-transform ${
                      paletteIdx === idx
                        ? 'scale-[1.02] border-lime-300 ring-1 ring-lime-400/80 shadow-[0_0_25px_rgba(190,242,100,0.5)]'
                        : 'border-slate-800 hover:border-lime-300/60'
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
            </div>

            {/* tone shaping */}
            <div>
              <div className="mb-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-lime-300">
                <span>Tone Shaping</span>
                <button
                  onClick={() => setInvert(i => !i)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    invert
                      ? 'bg-lime-400 text-black shadow-[0_0_15px_rgba(190,242,100,0.6)]'
                      : 'border border-slate-800 bg-black text-slate-400'
                  }`}
                >
                  Invert
                </button>
              </div>

              <ControlGroup
                label="Luminance Threshold"
                value={threshold}
                min={0}
                max={255}
                onChange={setThreshold}
                highlight
                subLabel="Bias towards dark or bright."
              />
              <ControlGroup
                label="Pre-Blur"
                value={blur}
                min={0}
                max={20}
                onChange={setBlur}
                subLabel="Softens noise before dithering."
              />
              <ControlGroup label="Contrast" value={contrast} min={0} max={100} onChange={setContrast} />
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
              <ControlGroup
                label="Bleed (Error Push)"
                value={bleed}
                min={0}
                max={100}
                onChange={setBleed}
                subLabel="Above 50% introduces controlled glitch."
              />
              <ControlGroup
                label="Depth Offset"
                value={depth}
                min={0}
                max={20}
                onChange={setDepth}
                subLabel="Creates pseudo-3D echo."
              />
            </div>

            {/* reset */}
            <button
              onClick={handleReset}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-black/80 px-3 py-2 text-[11px] font-semibold text-red-300 transition hover:bg-red-500/10"
            >
              <RotateCcw size={12} /> Reset Parameters
            </button>

            <div className="pb-4 text-center text-[10px] text-slate-600">
              v4.1.0 • EX DITHERA LAB
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
