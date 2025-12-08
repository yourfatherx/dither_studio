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

const applyDither = (gray, w, h, style, lineScale, bleed) => {
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

const applyRiemersma = (gray, w, h, intensity) => {
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
  const [mediaType, setMediaType] = useState<null | 'image' | 'video'>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const [mediaDims, setMediaDims] = useState<{ w: number; h: number } | null>(null);

  const [scale, setScale] = useState(4);
  const [style, setStyle] = useState('Atkinson');
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof ALGORITHM_CATEGORIES>('Error Diffusion');

  const [paletteCategory, setPaletteCategory] = useState<keyof typeof PALETTE_PRESETS>('CyberGB');
  const [paletteIdx, setPaletteIdx] = useState(0);

  const [contrast, setContrast] = useState(45);
  const [midtones, setMidtones] = useState(50);
  const [highlights, setHighlights] = useState(50);
  const [threshold, setThreshold] = useState(128);
  const [blur, setBlur] = useState(0);

  const [lineScale, setLineScale] = useState(4);
  const [bleed, setBleed] = useState(50);
  const [depth, setDepth] = useState(0);
  const [invert, setInvert] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenImageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const availableStyles = useMemo(
    () => Object.keys(ALGORITHM_CATEGORIES[selectedCategory] || {}),
    [selectedCategory],
  );

  const currentPalette = useMemo(() => {
    const cat = PALETTE_PRESETS[paletteCategory] || PALETTE_PRESETS.CyberGB;
    const raw = cat[paletteIdx] || cat[0];
    return raw.map(hexToRgb);
  }, [paletteCategory, paletteIdx]);

  useEffect(() => {
    if (availableStyles.length > 0 && !availableStyles.includes(style)) {
      setStyle(availableStyles[0]);
    }
  }, [availableStyles, style]);

  const handleFileUpload = (file: File | null) => {
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

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileUpload(e.target.files?.[0] || null);
  };

  // auto-fit render size: no zoom scaling beyond workspace
  const computeRenderSize = useCallback(
    (intrinsicW: number, intrinsicH: number) => {
      const workspace = workspaceRef.current;
      if (!workspace) return { w: intrinsicW, h: intrinsicH };
      const padding = 64;
      const maxW = Math.max(240, workspace.clientWidth - padding);
      const maxH = Math.max(240, workspace.clientHeight - padding);
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

    let srcW: number, srcH: number, source: HTMLVideoElement | HTMLImageElement | null;

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

  // main render loop
  useEffect(() => {
    if (!mediaType || !sourceUrl) return;

    if (mediaType === 'image') {
      processFrame();
      return;
    }

    const video = hiddenVideoRef.current;
    if (!video) return;

    if (isPlaying) {
      let id: number;
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

  // re-fit on window resize
  useEffect(() => {
    const onResize = () => {
      if (sourceUrl) processFrame();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [sourceUrl, processFrame]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
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
    let options: MediaRecorderOptions = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
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
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (v: number) => void;
  }) => (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-[10px] tracking-[0.18em] uppercase">
        <span className="text-[#ffb347]">{label}</span>
        <span className="font-mono text-orange-500">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded bg-orange-900/40 accent-[#ffb347]"
      />
    </div>
  );

  const paletteNames = Object.keys(PALETTE_PRESETS);

  return (
    <div className="flex h-screen flex-col bg-black text-orange-300 font-mono selection:bg-orange-400 selection:text-black">
      {/* hidden media elements */}
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

      {/* TOP HUD BAR */}
      <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-orange-500/60 bg-gradient-to-r from-black via-zinc-950 to-black px-6">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded border border-orange-500 shadow-[0_0_30px_rgba(255,115,0,0.9)]">
            <span className="text-xs font-black tracking-[0.35em] text-orange-400">EX</span>
          </div>
          <div className="flex flex-col">
            <span className="bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-200 bg-clip-text text-[10px] font-black tracking-[0.6em] text-transparent uppercase">
              SUPER • TERRAIN 86
            </span>
            <span className="mt-1 text-[10px] tracking-[0.3em] text-orange-700 uppercase">
              Adaptive dithering cartography unit
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1 text-[9px] text-orange-500 tracking-[0.18em] uppercase">
          <div className="flex gap-6">
            <span>GRID: {mediaDims ? `${mediaDims.w}×${mediaDims.h}` : 'NO INPUT'}</span>
            <span>
              ENGINE: {selectedCategory} › {style}
            </span>
          </div>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-orange-500/70 to-transparent" />
        </div>
      </header>

      {/* MAIN BODY */}
      <main className="flex min-h-0 flex-1 overflow-hidden">
        {/* CENTRAL TERRAIN VIEWPORT */}
        <section className="flex min-w-0 flex-1 flex-col bg-gradient-to-b from-black via-zinc-950 to-black">
          <div
            ref={workspaceRef}
            className="relative flex flex-1 items-center justify-center overflow-auto px-8 py-6"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            {sourceUrl ? (
              <div className="relative inline-flex flex-col gap-2">
                {/* top caption bar */}
                <div className="flex items-center justify-between border border-orange-500/70 bg-black/80 px-4 py-1 text-[9px] uppercase tracking-[0.25em] text-orange-400">
                  <span>ACTIVE HEIGHTMAP</span>
                  <span>{mediaType === 'video' ? 'STREAM' : 'STILL'} INPUT</span>
                </div>

                {/* canvas frame */}
                <div className="relative border border-orange-500/80 bg-black/90 p-3 shadow-[0_0_45px_rgba(255,120,0,0.8)]">
                  {/* fake isometric grid overlay lines (purely visual) */}
                  <div className="pointer-events-none absolute inset-3 border border-orange-500/30" />
                  <div className="pointer-events-none absolute inset-3">
                    <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(255,150,0,0.15),_transparent_70%)]" />
                  </div>
                  <canvas
                    ref={canvasRef}
                    className="relative block bg-black"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>

                {/* tiny status bar under canvas */}
                <div className="flex items-center justify-between border border-orange-500/60 bg-black/80 px-4 py-1 text-[9px] uppercase tracking-[0.25em] text-orange-500">
                  <span>SESSION • {sourceUrl ? 'BOUND' : 'IDLE'}</span>
                  <span>
                    SCALE {scale} • DEPTH {depth}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex max-w-xl flex-col items-center rounded border border-dashed border-orange-500/70 bg-black/80 px-12 py-14 text-center text-[11px] text-orange-400 shadow-[0_0_40px_rgba(255,115,0,0.4)]">
                <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-orange-500/80 bg-black">
                  <Upload size={34} className="text-orange-400" />
                </div>
                <p className="text-[10px] uppercase tracking-[0.4em] text-orange-400">
                  Drop Media To Instantiate Terrain
                </p>
                <p className="mt-3 text-[10px] text-orange-600">
                  Drag an image or video into the grid, or use the{' '}
                  <span className="text-orange-300">IMPORT SLOT</span> at the right.
                </p>
                <p className="mt-1 text-[9px] text-orange-700">
                  PNG · JPG · GIF · MP4 · WEBM
                </p>
              </div>
            )}
          </div>

          {/* bottom file strip */}
          <div className="flex flex-shrink-0 items-stretch border-t border-orange-500/60 bg-black/95 px-8 py-3 text-[9px] uppercase tracking-[0.25em] text-orange-500">
            <div className="flex flex-1 items-center gap-6">
              {['A', 'B', 'C', 'D'].map((label, idx) => (
                <div
                  key={label}
                  className="flex items-center gap-2 border border-orange-700/70 bg-black/80 px-3 py-2"
                >
                  <div className="h-4 w-6 border border-orange-600/80" />
                  <div className="flex flex-col">
                    <span>{label} • SLOT</span>
                    <span className="text-[8px] text-orange-700">
                      {idx === 0 ? 'LIVE INPUT' : 'EMPTY'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="ml-6 flex w-64 flex-col border border-orange-700/80 bg-black/90 px-3 py-2 text-[8px] leading-tight text-orange-500">
              <span>// EX-DITHERA SCRIPT FRAGMENT</span>
              <span>var city = landscape.chooseTerrain('dither')</span>
              <span>for (var i = 0; i &lt; pixels; i++) {{'{'}} distributeError(); {{'}'}}</span>
            </div>
          </div>
        </section>

        {/* RIGHT CONTROL TOWER */}
        <aside className="flex w-80 flex-shrink-0 flex-col border-l border-orange-500/60 bg-gradient-to-b from-black via-zinc-950 to-black text-[11px]">
          {/* tower title */}
          <div className="border-b border-orange-500/60 px-4 py-3 text-[9px] uppercase tracking-[0.3em] text-orange-400">
            <div className="flex items-center gap-2">
              <Layers size={12} className="text-orange-400" />
              <span>Dither Control Tower</span>
            </div>
          </div>

          <div className="flex-1 overflow-auto px-4 py-4">
            {/* IMPORT / TRANSPORT ROW */}
            <div className="mb-5 grid grid-cols-3 gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/mp4,video/webm"
                onChange={onFileInputChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-10 items-center justify-center gap-2 border border-orange-500/80 bg-black/80 text-[9px] font-semibold uppercase tracking-[0.25em] text-orange-300 shadow-[0_0_20px_rgba(255,115,0,0.5)]"
              >
                <ImageIcon size={12} /> Import
              </button>
              <button
                onClick={mediaType === 'video' ? togglePlayback : handleStaticExport}
                disabled={!sourceUrl}
                className={`flex h-10 items-center justify-center gap-2 border text-[9px] font-semibold uppercase tracking-[0.25em] ${
                  !sourceUrl
                    ? 'border-orange-900/70 bg-black text-orange-900'
                    : 'border-orange-500/80 bg-black/80 text-orange-300'
                }`}
              >
                {mediaType === 'video' ? (
                  <>
                    <Video size={12} /> {isPlaying ? 'Pause' : 'Play'}
                  </>
                ) : (
                  <>
                    <Download size={12} /> Export
                  </>
                )}
              </button>
              <button
                onClick={handleReset}
                className="flex h-10 items-center justify-center gap-2 border border-orange-700/80 bg-black/80 text-[9px] font-semibold uppercase tracking-[0.25em] text-orange-300 hover:bg-orange-900/40"
              >
                <RotateCcw size={12} /> Reset
              </button>
            </div>

            {/* VIDEO RECORD ROW */}
            {mediaType === 'video' && (
              <div className="mb-5">
                <button
                  onClick={toggleRecording}
                  disabled={!sourceUrl}
                  className={`flex w-full items-center justify-center gap-2 border px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.3em] ${
                    !sourceUrl
                      ? 'border-orange-900/70 bg-black text-orange-900'
                      : isRecording
                      ? 'border-red-500 bg-red-600 text-black animate-pulse'
                      : 'border-orange-500/80 bg-black/80 text-orange-300'
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
              </div>
            )}

            {/* ENGINE SELECTION – mimics terrain menu */}
            <div className="mb-4 border border-orange-700/80 bg-black/80 p-3">
              <div className="mb-2 text-[9px] uppercase tracking-[0.3em] text-orange-400">
                Engine Bank
              </div>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value as keyof typeof ALGORITHM_CATEGORIES)}
                className="mb-2 w-full border border-orange-800 bg-black/80 px-2 py-1 text-[10px] text-orange-200 outline-none focus:border-orange-400"
              >
                {Object.keys(ALGORITHM_CATEGORIES).map(cat => (
                  <option key={cat}>{cat}</option>
                ))}
              </select>
              <select
                value={style}
                onChange={e => setStyle(e.target.value)}
                className="w-full border border-orange-800 bg-black/80 px-2 py-1 text-[10px] text-orange-200 outline-none focus:border-orange-400"
              >
                {availableStyles.map(s => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* SCALE / PATTERN */}
            <div className="mb-4 border border-orange-700/80 bg-black/80 p-3">
              <div className="mb-2 text-[9px] uppercase tracking-[0.3em] text-orange-400">
                Grid Geometry
              </div>
              <ControlGroup label="Pixel Scale" value={scale} min={1} max={20} onChange={setScale} />
              <ControlGroup
                label="Pattern Scale"
                value={lineScale}
                min={1}
                max={50}
                onChange={setLineScale}
              />
              <ControlGroup label="Depth Offset" value={depth} min={0} max={20} onChange={setDepth} />
            </div>

            {/* PALETTE */}
            <div className="mb-4 border border-orange-700/80 bg-black/80 p-3">
              <div className="mb-2 text-[9px] uppercase tracking-[0.3em] text-orange-400">
                Color Pipeline
              </div>
              <select
                value={paletteCategory}
                onChange={e => {
                  setPaletteCategory(e.target.value as keyof typeof PALETTE_PRESETS);
                  setPaletteIdx(0);
                }}
                className="mb-3 w-full border border-orange-800 bg-black/80 px-2 py-1 text-[10px] text-orange-200 outline-none focus:border-orange-400"
              >
                {paletteNames.map(p => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <div className="space-y-2">
                {(PALETTE_PRESETS[paletteCategory] || []).map((pal, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPaletteIdx(idx)}
                    className={`relative flex h-7 w-full overflow-hidden border ${
                      paletteIdx === idx
                        ? 'border-orange-400 shadow-[0_0_20px_rgba(255,120,0,0.8)]'
                        : 'border-orange-800'
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

            {/* TONE SHAPING */}
            <div className="mb-4 border border-orange-700/80 bg-black/80 p-3">
              <div className="mb-2 flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-orange-400">
                <span>Tone Shaping</span>
                <button
                  onClick={() => setInvert(i => !i)}
                  className={`px-2 py-0.5 text-[9px] ${
                    invert
                      ? 'bg-orange-400 text-black'
                      : 'border border-orange-700 text-orange-400'
                  }`}
                >
                  Invert
                </button>
              </div>
              <ControlGroup label="Threshold" value={threshold} min={0} max={255} onChange={setThreshold} />
              <ControlGroup label="Pre-Blur" value={blur} min={0} max={20} onChange={setBlur} />
              <ControlGroup label="Contrast" value={contrast} min={0} max={100} onChange={setContrast} />
              <ControlGroup label="Midtones" value={midtones} min={0} max={100} onChange={setMidtones} />
              <ControlGroup
                label="Highlights"
                value={highlights}
                min={0}
                max={100}
                onChange={setHighlights}
              />
              <ControlGroup label="Bleed" value={bleed} min={0} max={100} onChange={setBleed} />
            </div>

            <div className="pb-2 text-center text-[8px] uppercase tracking-[0.3em] text-orange-700">
              Super Terrain 86 • EX Dithera HUD
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

