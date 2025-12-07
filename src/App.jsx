import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Upload, RotateCcw, ZoomIn, ZoomOut, Maximize, Play, Pause, Video, Disc } from 'lucide-react';

/* --- 1. CONFIGURATION CONSTANTS --- */

const ALGORITHM_CATEGORIES = {
  "Error Diffusion": {
    "Floyd-Steinberg": { divisor: 16, offsets: [[1,0,7], [-1,1,3], [0,1,5], [1,1,1]] },
    "Atkinson": { divisor: 8, offsets: [[1,0,1], [2,0,1], [-1,1,1], [0,1,1], [1,1,1], [0,2,1]] },
    "Jarvis-Judice-Ninke": { divisor: 48, offsets: [[1,0,7], [2,0,5], [-2,1,3], [-1,1,5], [0,1,7], [1,1,5], [2,1,3], [-2,2,1], [-1,2,3], [0,2,5], [1,2,3], [2,2,1]] },
    "Stucki": { divisor: 42, offsets: [[1,0,8], [2,0,4], [-2,1,2], [-1,1,4], [0,1,8], [1,1,4], [2,1,2], [-2,2,1], [-1,2,2], [0,2,4], [1,2,2], [2,2,1]] },
    "Burkes": { divisor: 32, offsets: [[1,0,8], [2,0,4], [-2,1,2], [-1,1,4], [0,1,8], [1,1,4], [2,1,2]] },
    "Sierra": { divisor: 32, offsets: [[1,0,5], [2,0,3], [-2,1,2], [-1,1,4], [0,1,5], [1,1,4], [2,1,2], [-1,2,2], [0,2,3], [1,2,2]] },
    "Ostromoukhov": { type: "variable", table: true }
  },
  "Ordered (Bitmap)": {
    "Ordered 2x2": 2,
    "Ordered 4x4": 4,
    "Ordered 8x8": 8,
    "Knoll (Clustered)": "knoll",
    "Horizontal Lines": "hlines",
    "Vertical Lines": "vlines"
  },
  "Organic": {
    "Blue Noise": "bluenoise",
    "Voronoi Stippling": "voronoi",
    "White Noise": "whitenoise",
    "Stipple Pattern": "stipple"
  },
  "Modulation": {
    "Sine Wave X": { axis: 'x', wave: 'sine' },
    "Sine Wave Y": { axis: 'y', wave: 'sine' },
    "Circular Wave": { axis: 'radial', wave: 'sine' },
    "Square Wave": { axis: 'x', wave: 'square' },
    "Riemersma (Hilbert)": "riemersma"
  },
  "Pattern": {
    "Checkerboard": "checker",
    "Grid Pattern": "grid",
    "Random Dots": "random",
    "Interleaved Gradient": "gradient"
  }
};

const PALETTE_PRESETS = {
  "Bubblegum": ["#000000", "#ff0066", "#00ccff", "#ffffff"],
  "Retro": ["#000000", "#ff0000", "#ffff00", "#ffffff"],
  "Vaporwave": ["#01cdfe", "#ff71ce", "#05ffa1", "#b967ff"],
  "Cyberpunk": ["#00ff41", "#ff00ff", "#00ffff", "#ff0080"],
  "Monochrome": ["#000000", "#ffffff"],
  "Gameboy": ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
  "Sepia": ["#2b1b0e", "#704214", "#b5651d", "#e8c5a5"],
  "CGA": ["#000000", "#00aaaa", "#aa00aa", "#aaaaaa"],
  "Neon": ["#000000", "#ff006e", "#8338ec", "#3a86ff"]
};

/* --- 2. MATH & MATRIX HELPERS --- */

const getBayerMatrix = (size) => {
  if (size === 2) return [[0, 2], [3, 1]].map(r => r.map(v => v * 64));
  if (size === 4) return [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]].map(r => r.map(v => v * 16));
  if (size === 8) {
    const m = [[0,32,8,40,2,34,10,42],[48,16,56,24,50,18,58,26],[12,44,4,36,14,46,6,38],
               [60,28,52,20,62,30,54,22],[3,35,11,43,1,33,9,41],[51,19,59,27,49,17,57,25],
               [15,47,7,39,13,45,5,37],[63,31,55,23,61,29,53,21]];
    return m.map(r => r.map(v => v * 4));
  }
  return [[0]]; // Fallback
};

const getKnollMatrix = () => {
  return [[6,12,10,16],[8,4,14,2],[11,15,9,13],[5,7,3,1]].map(r => r.map(v => v * 16));
};

const generateBlueNoise = (w, h) => {
  const noise = new Uint8ClampedArray(w * h);
  for (let i = 0; i < noise.length; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    noise[i] = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 256;
  }
  return noise;
};

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1],16), parseInt(result[2],16), parseInt(result[3],16)] : [0,0,0];
};

/* --- 3. CORE PROCESSING LOGIC --- */

const processImage = (imageData, settings) => {
  const { width, height, data } = imageData;
  const { scale, style, palette, lineScale, bleed, contrast, midtones, highlights, depth, invert } = settings;
  
  // Ensure scale is at least 1 to prevent division by zero or negative sizing
  const s = Math.max(1, scale);
  const scaledW = Math.max(1, Math.floor(width / s));
  const scaledH = Math.max(1, Math.floor(height / s));
  
  const gray = new Uint8ClampedArray(scaledW * scaledH);
  
  // 1. Convert to Grayscale & Downscale
  for (let y = 0; y < scaledH; y++) {
    for (let x = 0; x < scaledW; x++) {
      const srcX = Math.floor(x * s);
      const srcY = Math.floor(y * s);
      const srcIdx = (srcY * width + srcX) * 4;
      gray[y * scaledW + x] = Math.floor(0.299 * data[srcIdx] + 0.587 * data[srcIdx+1] + 0.114 * data[srcIdx+2]);
    }
  }
  
  // 2. Apply Pipeline
  let adjusted = applyAdjustments(gray, { contrast, midtones, highlights, invert });
  let dithered = applyDither(adjusted, scaledW, scaledH, style, lineScale, bleed);
  
  if (depth > 0) {
    dithered = applyDepth(dithered, scaledW, scaledH, depth);
  }
  
  const colored = applyPalette(dithered, palette);
  
  // 3. Upscale to Original Resolution
  const output = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = Math.floor(x / s);
      const srcY = Math.floor(y / s);
      const srcIdx = (srcY * scaledW + srcX) * 3;
      const dstIdx = (y * width + x) * 4;
      
      if (srcIdx < colored.length) {
        output.data[dstIdx] = colored[srcIdx];
        output.data[dstIdx+1] = colored[srcIdx+1];
        output.data[dstIdx+2] = colored[srcIdx+2];
        output.data[dstIdx+3] = 255;
      }
    }
  }
  
  return output;
};

const applyAdjustments = (gray, { contrast, midtones, highlights, invert }) => {
  let adjusted = new Uint8ClampedArray(gray);
  
  // Contrast
  if (contrast !== 45) {
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    adjusted = adjusted.map(v => Math.max(0, Math.min(255, factor * (v - 128) + 128)));
  }
  
  // Curves (Midtones/Highlights)
  adjusted = adjusted.map(v => {
    let val = v / 255;
    if (val < 0.5) val = val * (midtones / 50);
    else val = 0.5 + (val - 0.5) * (highlights / 50);
    return Math.max(0, Math.min(255, val * 255));
  });
  
  // Invert
  if (invert) adjusted = adjusted.map(v => 255 - v);
  return adjusted;
};

/* --- 4. DITHERING ALGORITHMS --- */

const applyDither = (gray, w, h, style, lineScale, bleed) => {
  let algo = null, category = null;
  
  for (const [cat, algos] of Object.entries(ALGORITHM_CATEGORIES)) {
    if (algos[style]) { algo = algos[style]; category = cat; break; }
  }
  
  if (!algo) return gray; // Fallback
  
  if (category === "Error Diffusion") {
    if (algo.type === "variable") {
      return applyOstromoukhov(gray, w, h);
    }
    
    const pixels = new Float32Array(gray);
    const { divisor, offsets } = algo;
    const bleedFactor = bleed / 100;
    
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const oldVal = pixels[idx];
        const newVal = oldVal > 127 ? 255 : 0;
        pixels[idx] = newVal;
        const err = (oldVal - newVal) * bleedFactor;
        
        for (const [dx, dy, weight] of offsets) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            pixels[ny * w + nx] += err * (weight / divisor);
          }
        }
      }
    }
    return Uint8ClampedArray.from(pixels.map(v => Math.max(0, Math.min(255, v))));

  } else if (category === "Ordered (Bitmap)") {
    const output = new Uint8ClampedArray(w * h);
    
    if (typeof algo === 'number') {
      const matrix = getBayerMatrix(algo);
      const size = matrix.length;
      for (let i = 0; i < w * h; i++) {
        const x = i % w;
        const y = Math.floor(i / w);
        output[i] = gray[i] > matrix[y % size][x % size] ? 255 : 0;
      }
    } else if (algo === 'knoll') {
      const matrix = getKnollMatrix();
      const size = matrix.length;
      for (let i = 0; i < w * h; i++) {
        const x = i % w;
        const y = Math.floor(i / w);
        output[i] = gray[i] > matrix[y % size][x % size] ? 255 : 0;
      }
    } else if (algo === 'hlines') {
      for (let i = 0; i < w * h; i++) {
        output[i] = (Math.floor(i/w) % lineScale < lineScale/2) ? (gray[i] > 127 ? 255 : 0) : (gray[i] > 200 ? 255 : 0);
      }
    } else if (algo === 'vlines') {
      for (let i = 0; i < w * h; i++) {
        output[i] = ((i%w) % lineScale < lineScale/2) ? (gray[i] > 127 ? 255 : 0) : (gray[i] > 200 ? 255 : 0);
      }
    }
    return output;

  } else if (category === "Organic") {
    const output = new Uint8ClampedArray(w * h);
    
    if (algo === 'bluenoise') {
      const noise = generateBlueNoise(w, h);
      for (let i = 0; i < gray.length; i++) {
        output[i] = gray[i] > noise[i] ? 255 : 0;
      }
    } else if (algo === 'whitenoise') {
      for (let i = 0; i < gray.length; i++) {
        output[i] = gray[i] > Math.random() * 255 ? 255 : 0;
      }
    } else if (algo === 'voronoi') {
      // Optimized Grid Voronoi for Real-time Video
      const step = Math.max(4, lineScale * 3);
      const points = [];
      // Generate jittered grid points
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          points.push({
            x: Math.min(w-1, x + Math.random() * step),
            y: Math.min(h-1, y + Math.random() * step)
          });
        }
      }
      
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          // Optimization: only check nearby grid cells
          const gridX = Math.floor(x / step) * step;
          const gridY = Math.floor(y / step) * step;
          let minDist = Infinity;
          
          // Check local points only
          for (const p of points) {
             if (Math.abs(p.x - x) < step * 1.5 && Math.abs(p.y - y) < step * 1.5) {
                const d = (x - p.x) ** 2 + (y - p.y) ** 2;
                if (d < minDist) minDist = d;
             }
          }
          const threshold = Math.sqrt(minDist) * (255 / step);
          output[y * w + x] = gray[y * w + x] > threshold ? 255 : 0;
        }
      }

    } else if (algo === 'stipple') {
      for (let i = 0; i < gray.length; i++) {
        output[i] = Math.random() > (gray[i] / 255) ? 255 : 0;
      }
    }
    return output;

  } else if (category === "Modulation") {
    const output = new Uint8ClampedArray(w * h);
    
    if (algo === 'riemersma') {
      return applyRiemersma(gray, w, h, lineScale);
    }
    
    const { axis, wave } = algo;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let t = 127;
        if (axis === 'x') {
          t = wave === 'sine' ? 127.5 + 127.5 * Math.sin(x * (lineScale / 50)) : (Math.floor(x / lineScale) % 2) * 255;
        } else if (axis === 'y') {
          t = 127.5 + 127.5 * Math.sin(y * (lineScale / 50));
        } else if (axis === 'radial') {
          const dist = Math.sqrt((x-w/2)**2 + (y-h/2)**2);
          t = 127.5 + 127.5 * Math.sin(dist * (lineScale / 50));
        }
        output[y * w + x] = gray[y * w + x] > t ? 255 : 0;
      }
    }
    return output;

  } else if (category === "Pattern") {
    const output = new Uint8ClampedArray(w * h);
    
    if (algo === 'gradient') {
      for (let i = 0; i < w * h; i++) {
        const x = i % w;
        const y = Math.floor(i / w);
        const p = ((x * 52.9829 + y * 11.4521) % 1.0) * 255;
        output[i] = gray[i] > p ? 255 : 0;
      }
    } else {
      for (let i = 0; i < w * h; i++) {
        const x = i % w;
        const y = Math.floor(i / w);
        let k = true;
        if (algo === 'checker') k = (x + y) % 2 === 0;
        else if (algo === 'grid') k = x % lineScale === 0 || y % lineScale === 0;
        else if (algo === 'random') k = Math.random() > 0.5;
        output[i] = k ? (gray[i] > 127 ? 255 : 0) : (gray[i] > 200 ? 255 : 0);
      }
    }
    return output;
  }
  
  return gray;
};

/* --- 5. SPECIALIZED ALGORITHMS (Ostromoukhov & Riemersma) --- */

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
      
      if (x + 1 < w) pixels[y * w + (x + 1)] += err * (c1 / sum);
      if (y + 1 < h && x - 1 >= 0) pixels[(y + 1) * w + (x - 1)] += err * (c2 / sum);
      if (y + 1 < h) pixels[(y + 1) * w + x] += err * (c3 / sum);
    }
  }
  
  return Uint8ClampedArray.from(pixels.map(v => Math.max(0, Math.min(255, v))));
};

const applyRiemersma = (gray, w, h, intensity) => {
  const output = new Uint8ClampedArray(gray);
  const pixels = new Float32Array(gray);
  
  // Recursive Hilbert Curve Generator
  const hilbertCurve = (x, y, size, rotate, index, path) => {
    if (size === 1) {
      if (x < w && y < h) path.push({x, y});
      return;
    }
    
    size /= 2;
    if (rotate) {
      hilbertCurve(x, y, size, !rotate, index, path);
      hilbertCurve(x + size, y, size, rotate, index, path);
      hilbertCurve(x + size, y + size, size, rotate, index, path);
      hilbertCurve(x, y + size, size, !rotate, index, path);
    } else {
      hilbertCurve(x, y, size, rotate, index, path);
      hilbertCurve(x, y + size, size, rotate, index, path);
      hilbertCurve(x + size, y + size, size, rotate, index, path);
      hilbertCurve(x + size, y, size, !rotate, index, path);
    }
  };

  // Generate path
  const size = Math.pow(2, Math.ceil(Math.log2(Math.max(w, h))));
  const path = [];
  
  // Simplified Hilbert iterative approach for speed would be better here, 
  // but for "completeness" we use a standard approach.
  // Note: For large videos, Riemersma is slow.
  
  const generatePath = (n) => {
      const points = [];
      for (let d = 0; d < n * n; d++) {
          let t = d;
          let x = 0, y = 0;
          for (let s = 1; s < n; s *= 2) {
              const rx = 1 & (t / 2);
              const ry = 1 & (t ^ rx);
              if (ry === 0) {
                  if (rx === 1) {
                      x = s - 1 - x;
                      y = s - 1 - y;
                  }
                  const temp = x; x = y; y = temp;
              }
              x += s * rx;
              y += s * ry;
              t /= 4;
          }
          if(x < w && y < h) points.push({x, y});
      }
      return points;
  };

  const fullPath = generatePath(Math.pow(2, Math.ceil(Math.log2(Math.max(w,h)))));
  
  let error = 0;
  for (const p of fullPath) {
    const idx = p.y * w + p.x;
    const val = pixels[idx] + error;
    const outputVal = val > 127 ? 255 : 0;
    output[idx] = outputVal;
    error = (val - outputVal) * (intensity / 10);
  }
  
  return output;
};

/* --- 6. DEPTH & PALETTE --- */

const applyDepth = (dithered, w, h, depth) => {
  const output = new Uint8ClampedArray(dithered);
  const offset = Math.floor(depth);
  
  for (let y = 0; y < h; y++) {
    for (let x = offset; x < w; x++) {
      if (dithered[y*w+x] === 0) {
        output[y*w+(x-offset)] = Math.max(0, output[y*w+(x-offset)] - 30);
      }
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
    
    // Safety check for color array bounds
    const c1 = colors[Math.min(idx, stops)] || [0,0,0];
    const c2 = colors[Math.min(idx + 1, stops)] || [0,0,0];
    
    output[i*3] = c1[0] + (c2[0] - c1[0]) * frac;
    output[i*3+1] = c1[1] + (c2[1] - c1[1]) * frac;
    output[i*3+2] = c1[2] + (c2[2] - c1[2]) * frac;
  }
  return output;
};

/* --- 7. REACT COMPONENT --- */

export default function DitherBoyPro() {
  const [mediaType, setMediaType] = useState(null); // 'image' or 'video'
  const [sourceUrl, setSourceUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // Settings
  const [scale, setScale] = useState(6);
  const [lineScale, setLineScale] = useState(4);
  const [bleed, setBleed] = useState(0);
  const [style, setStyle] = useState("Sine Wave Y");
  const [selectedCategory, setSelectedCategory] = useState("Modulation");
  const [paletteCategory, setPaletteCategory] = useState("Retro");
  const [palette, setPalette] = useState(PALETTE_PRESETS["Retro"].map(hexToRgb));
  const [contrast, setContrast] = useState(45);
  const [midtones, setMidtones] = useState(50);
  const [highlights, setHighlights] = useState(50);
  const [depth, setDepth] = useState(0);
  const [invert, setInvert] = useState(false);
  const [zoom, setZoom] = useState(1);
  
  // Refs
  const canvasRef = useRef(null);
  const hiddenVideoRef = useRef(null);
  const hiddenImageRef = useRef(null);
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const availableStyles = useMemo(() => {
    return Object.keys(ALGORITHM_CATEGORIES[selectedCategory] || {});
  }, [selectedCategory]);
  
  // Auto-select style when category changes
  useEffect(() => {
    if (availableStyles.length > 0 && !availableStyles.includes(style)) {
      setStyle(availableStyles[0]);
    }
  }, [selectedCategory, availableStyles, style]);

  // Handle File Upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset states
    setIsPlaying(false);
    setIsRecording(false);
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    
    const url = URL.createObjectURL(file);
    setSourceUrl(url);

    if (file.type.startsWith('video')) {
      setMediaType('video');
      setIsPlaying(true);
      setTimeout(fitToScreen, 500); // Wait for metadata
    } else {
      setMediaType('image');
      setIsPlaying(false);
      setTimeout(fitToScreen, 100);
    }
  };

  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    
    let w = 800, h = 600;
    if (mediaType === 'image' && hiddenImageRef.current) {
        w = hiddenImageRef.current.width;
        h = hiddenImageRef.current.height;
    } else if (mediaType === 'video' && hiddenVideoRef.current) {
        w = hiddenVideoRef.current.videoWidth;
        h = hiddenVideoRef.current.videoHeight;
    }
    
    // Safety check if w/h are 0
    if (w === 0 || h === 0) return;

    const { clientWidth, clientHeight } = containerRef.current;
    const scaleX = (clientWidth - 40) / w;
    const scaleY = (clientHeight - 40) / h;
    
    setZoom(Math.min(scaleX, scaleY));
  }, [mediaType]);

  // Main Processing Loop
  const processFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    let w, h, source;

    if (mediaType === 'video') {
        const video = hiddenVideoRef.current;
        if (!video || video.paused || video.ended) return; 
        w = video.videoWidth;
        h = video.videoHeight;
        source = video;
    } else {
        const img = hiddenImageRef.current;
        if (!img) return;
        w = img.width;
        h = img.height;
        source = img;
    }

    if (w === 0 || h === 0) return;

    // Resize canvas if needed
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }

    // 1. Draw Source
    ctx.drawImage(source, 0, 0, w, h);
    
    // 2. Get Data
    const imageData = ctx.getImageData(0, 0, w, h);
    
    // 3. Process
    const result = processImage(imageData, {
        scale, style, palette, lineScale, bleed, contrast, midtones, highlights, depth, invert
    });

    // 4. Put Data
    ctx.putImageData(result, 0, 0);

    // Loop
    if (mediaType === 'video' && isPlaying) {
        animationFrameRef.current = requestAnimationFrame(processFrame);
    }
  }, [mediaType, isPlaying, scale, style, palette, lineScale, bleed, contrast, midtones, highlights, depth, invert]);

  // Effect triggers
  useEffect(() => {
    if (mediaType === 'image' && sourceUrl) {
       const timer = setTimeout(processFrame, 50);
       return () => clearTimeout(timer);
    } else if (mediaType === 'video' && isPlaying) {
       if (hiddenVideoRef.current) hiddenVideoRef.current.play().catch(e => console.log("Autoplay blocked", e));
       processFrame();
       return () => cancelAnimationFrame(animationFrameRef.current);
    } else if (mediaType === 'video' && !isPlaying) {
       if (hiddenVideoRef.current) hiddenVideoRef.current.pause();
       cancelAnimationFrame(animationFrameRef.current);
    }
  }, [mediaType, sourceUrl, isPlaying, processFrame]);


  // Recording Logic
  const toggleRecording = () => {
    if (isRecording) {
      // Stop
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      // Start
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const stream = canvas.captureStream(30); 
      // Try multiple mime types for browser compatibility
      let options = { mimeType: 'video/webm;codecs=vp9' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/webm' };
      }
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      recordedChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dither-boy-recording.webm';
        a.click();
        URL.revokeObjectURL(url);
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      
      // Ensure video is playing
      if (mediaType === 'video' && !isPlaying) {
          setIsPlaying(true);
      }
    }
  };

  const handleStaticExport = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'dither-boy-frame.png';
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  const changePaletteCategory = (cat) => {
      setPaletteCategory(cat);
      if(cat !== 'Custom') setPalette(PALETTE_PRESETS[cat].map(hexToRgb));
  };

  return (
    <div className="flex h-screen bg-black text-gray-300 font-sans">
      {/* Hidden Source Elements */}
      <img ref={hiddenImageRef} src={mediaType === 'image' ? sourceUrl : ''} className="hidden" onLoad={processFrame} alt="src" />
      <video 
        ref={hiddenVideoRef} 
        src={mediaType === 'video' ? sourceUrl : ''} 
        className="hidden" 
        loop 
        muted 
        playsInline 
        onLoadedMetadata={fitToScreen}
      />

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 h-10 bg-neutral-900 border-b border-neutral-800 flex items-center px-4 justify-between z-20">
        <div className="flex gap-4 text-xs font-medium text-gray-400">
           <span className="hover:text-white cursor-pointer font-bold tracking-wider">DITHER BOY PRO II</span>
           <span className="text-gray-600">|</span>
           <span>{mediaType === 'video' ? 'Video Mode' : 'Image Mode'}</span>
        </div>
        
        {/* Playback Controls (Video Only) */}
        {mediaType === 'video' && (
            <div className="flex items-center gap-2">
                <button onClick={() => setIsPlaying(!isPlaying)} className={`p-1.5 rounded ${isPlaying ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
                    {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                </button>
                <div className="text-xs font-mono w-16 text-center text-gray-500">
                    {isRecording ? <span className="text-red-500 animate-pulse font-bold">REC</span> : "READY"}
                </div>
            </div>
        )}
      </div>
      
      {/* Main Viewport */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center bg-[#050505] mt-10 relative overflow-hidden">
        {sourceUrl ? (
          <div style={{ transform: `scale(${zoom})`, transition: 'transform 0.1s' }} className="shadow-2xl border border-neutral-800 origin-center">
            <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', display: 'block' }} />
          </div>
        ) : (
          <div className="text-center text-neutral-600 select-none">
            <Video size={64} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm font-medium">Drop Image, GIF, or MP4</p>
          </div>
        )}
      </div>
      
      {/* Sidebar */}
      <div className="w-80 bg-neutral-900 border-l border-neutral-800 flex flex-col mt-10 z-30">
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          
          {/* Import / Export */}
          <div className="grid grid-cols-2 gap-2">
            <input ref={fileInputRef} type="file" accept="image/*,video/mp4,video/webm" onChange={handleFileUpload} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} 
              className="bg-neutral-800 hover:bg-neutral-700 py-3 rounded text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2">
              <Upload size={14} /> Import
            </button>
            
            {mediaType === 'video' ? (
                <button onClick={toggleRecording} 
                  className={`py-3 rounded text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${isRecording ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-neutral-800 hover:bg-neutral-700'}`}>
                  <Disc size={14} className={isRecording ? "animate-spin" : ""} /> {isRecording ? "Stop & Save" : "Record"}
                </button>
            ) : (
                <button onClick={handleStaticExport} disabled={!sourceUrl}
                  className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 py-3 rounded text-xs font-bold uppercase tracking-wider transition-colors">
                  Save Image
                </button>
            )}
          </div>

          <div className="h-px bg-neutral-800" />
          
          {/* Controls */}
          <div className="space-y-4">
             <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Dither Style</label>
                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full bg-black border border-neutral-700 rounded px-2 py-2 text-xs mb-2 text-gray-300 focus:outline-none focus:border-neutral-500">
                  {Object.keys(ALGORITHM_CATEGORIES).map(cat => <option key={cat}>{cat}</option>)}
                </select>
                <select value={style} onChange={(e) => setStyle(e.target.value)}
                  className="w-full bg-black border border-neutral-700 rounded px-2 py-2 text-xs text-gray-300 focus:outline-none focus:border-neutral-500">
                  {availableStyles.map(s => <option key={s}>{s}</option>)}
                </select>
             </div>

             <div>
               <div className="flex justify-between text-xs mb-1"><label>Pixel Scale</label> <span className="font-mono text-gray-500">{scale}</span></div>
               <input type="range" min="1" max="20" value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-full accent-white" />
             </div>

             <div>
               <div className="flex justify-between text-xs mb-1"><label>Modulation Scale</label> <span className="font-mono text-gray-500">{lineScale}</span></div>
               <input type="range" min="1" max="50" value={lineScale} onChange={(e) => setLineScale(Number(e.target.value))} className="w-full accent-white" />
             </div>

             <div className="h-px bg-neutral-800" />

             <div>
               <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Color Palette</label>
               <select value={paletteCategory} onChange={(e) => changePaletteCategory(e.target.value)}
                  className="w-full bg-black border border-neutral-700 rounded px-2 py-2 text-xs mb-2 text-gray-300 focus:outline-none focus:border-neutral-500">
                  {Object.keys(PALETTE_PRESETS).map(p => <option key={p}>{p}</option>)}
                  <option>Custom</option>
               </select>
               <div className="h-4 w-full rounded mb-2 border border-neutral-800" style={{ background: `linear-gradient(to right, ${palette.map(c => `rgb(${c[0]},${c[1]},${c[2]})`).join(', ')})` }} />
             </div>

             <div className="h-px bg-neutral-800" />
             
             <div className="grid grid-cols-2 gap-4">
                 <div>
                    <div className="flex justify-between text-xs mb-1"><label>Contrast</label></div>
                    <input type="range" min="0" max="100" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full accent-white" />
                 </div>
                 <div>
                    <div className="flex justify-between text-xs mb-1"><label>Depth</label></div>
                    <input type="range" min="0" max="20" value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="w-full accent-white" />
                 </div>
             </div>

             <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-500 uppercase">Invert Colors</label>
                <button onClick={() => setInvert(!invert)} className={`w-8 h-4 rounded-full relative transition-colors ${invert ? 'bg-white' : 'bg-neutral-700'}`}>
                    <div className={`w-2 h-2 bg-black rounded-full absolute top-1 transition-all ${invert ? 'left-5' : 'left-1'}`} />
                </button>
             </div>
          </div>

          <div className="h-px bg-neutral-800" />
          
          <div className="flex gap-2">
            <button onClick={() => setZoom(Math.max(0.1, zoom - 0.1))} className="flex-1 bg-neutral-800 hover:bg-neutral-700 py-2 rounded text-gray-400 flex justify-center"><ZoomOut size={14}/></button>
            <button onClick={() => setZoom(1)} className="flex-1 bg-neutral-800 hover:bg-neutral-700 py-2 rounded text-gray-400 flex justify-center"><Maximize size={14}/></button>
            <button onClick={() => setZoom(zoom + 0.1)} className="flex-1 bg-neutral-800 hover:bg-neutral-700 py-2 rounded text-gray-400 flex justify-center"><ZoomIn size={14}/></button>
          </div>
          
          <button onClick={() => {
              setScale(6); setLineScale(4); setBleed(0); setContrast(45); setDepth(0); setInvert(false);
          }} className="w-full py-2 text-xs text-gray-500 hover:text-white transition-colors flex items-center justify-center gap-2">
            <RotateCcw size={12} /> Reset Settings
          </button>
        </div>
      </div>
    </div>
  );
}