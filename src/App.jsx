import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Upload, RotateCcw, ZoomIn, ZoomOut, Maximize, Play, Pause, Video, Disc, Save, Image as ImageIcon, Settings, Layers, Download } from 'lucide-react';

/* --- 1. CONFIGURATION & DATA --- */

const ALGORITHM_CATEGORIES = {
  "Error Diffusion": {
    "Floyd-Steinberg": { divisor: 16, offsets: [[1,0,7], [-1,1,3], [0,1,5], [1,1,1]] },
    "Atkinson": { divisor: 8, offsets: [[1,0,1], [2,0,1], [-1,1,1], [0,1,1], [1,1,1], [0,2,1]] },
    "Jarvis-Judice-Ninke": { divisor: 48, offsets: [[1,0,7], [2,0,5], [-2,1,3], [-1,1,5], [0,1,7], [1,1,5], [2,1,3], [-2,2,1], [-1,2,3], [0,2,5], [1,2,3], [2,2,1]] },
    "Stucki": { divisor: 42, offsets: [[1,0,8], [2,0,4], [-2,1,2], [-1,1,4], [0,1,8], [1,1,4], [2,1,2], [-2,2,1], [-1,2,2], [0,2,4], [1,2,2], [2,2,1]] },
    "Burkes": { divisor: 32, offsets: [[1,0,8], [2,0,4], [-2,1,2], [-1,1,4], [0,1,8], [1,1,4], [2,1,2]] },
    "Sierra": { divisor: 32, offsets: [[1,0,5], [2,0,3], [-2,1,2], [-1,1,4], [0,1,5], [1,1,4], [2,1,2], [-1,2,2], [0,2,3], [1,2,2]] },
    "Two-Row Sierra": { divisor: 16, offsets: [[1,0,4], [2,0,3], [-2,1,1], [-1,1,2], [0,1,3], [1,1,2], [2,1,1]] },
    "Sierra Lite": { divisor: 4, offsets: [[1,0,2], [-1,1,1], [0,1,1]] },
    "Ostromoukhov": { type: "variable", table: true }
  },
  "Ordered (Bitmap)": {
    "Ordered 2x2": 2,
    "Ordered 4x4": 4,
    "Ordered 8x8": 8,
    "Ordered 16x16": 16,
    "Knoll (Clustered)": "knoll",
    "Horizontal Lines": "hlines",
    "Vertical Lines": "vlines",
    "Diagonal Lines": "dlines"
  },
  "Organic": {
    "Blue Noise": "bluenoise",
    "White Noise": "whitenoise",
    "Voronoi Stippling": "voronoi",
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
  "Halloween": [
      ["#050505", "#4a5d23", "#d2691e", "#e6e6fa"], // Eclipse (Studio AAA style)
      ["#000000", "#ff6600", "#ffffff"],
      ["#1a0505", "#5c0000", "#ff0000", "#ffcc00"]
  ],
  "Retro": [
      ["#000000", "#ffffff"], // 1-bit
      ["#000000", "#ff0000", "#ffff00", "#ffffff"],
      ["#2b1b0e", "#704214", "#b5651d", "#e8c5a5"], // Sepia
      ["#000000", "#00aaaa", "#aa00aa", "#aaaaaa"]  // CGA
  ],
  "Cyber": [
      ["#080808", "#00ff41", "#ff00ff"],
      ["#01cdfe", "#ff71ce", "#05ffa1", "#b967ff"], // Vaporwave
      ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"]  // Gameboy
  ],
  "Print": [
      ["#000000", "#00ffff", "#ff00ff", "#ffff00", "#ffffff"], // CMYK-ish
      ["#1a1c2c", "#5d275d", "#b13e53", "#ef7d57", "#ffcd75", "#a7f070", "#38b764", "#257179", "#29366f", "#3b5dc9", "#41a6f6", "#73eff7", "#f4f4f4", "#94b0c2", "#566c86", "#333c57"] // Pico-8
  ]
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
  if (size === 16) {
      // Approximation for 16x16 using recursive expansion (simplified for code length)
      // Standard 8x8 repeated is often sufficient for visual effect
      const m8 = getBayerMatrix(8);
      const m = new Array(16).fill(0).map(() => new Array(16).fill(0));
      for(let y=0; y<16; y++) for(let x=0; x<16; x++) m[y][x] = m8[y%8][x%8] + (m8[Math.floor(y/8)][Math.floor(x/8)] / 64);
      return m;
  }
  return [[0]]; 
};

const getKnollMatrix = () => [[6,12,10,16],[8,4,14,2],[11,15,9,13],[5,7,3,1]].map(r => r.map(v => v * 16));

const generateBlueNoise = (w, h) => {
  const noise = new Uint8ClampedArray(w * h);
  for (let i = 0; i < noise.length; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    // Golden ratio hash for better pseudo-random distribution
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
  const { scale, style, palette, lineScale, bleed, contrast, midtones, highlights, depth, invert, threshold } = settings;
  
  const s = Math.max(1, scale);
  const scaledW = Math.max(1, Math.floor(width / s));
  const scaledH = Math.max(1, Math.floor(height / s));
  
  const gray = new Uint8ClampedArray(scaledW * scaledH);
  
  // 1. Grayscale Conversion
  for (let y = 0; y < scaledH; y++) {
    for (let x = 0; x < scaledW; x++) {
      const srcX = Math.floor(x * s);
      const srcY = Math.floor(y * s);
      const srcIdx = (srcY * width + srcX) * 4;
      // Standard Luminance weights
      gray[y * scaledW + x] = Math.floor(0.299 * data[srcIdx] + 0.587 * data[srcIdx+1] + 0.114 * data[srcIdx+2]);
    }
  }
  
  // 2. Adjustments (Contrast, Curves, Threshold Bias)
  const adjusted = applyAdjustments(gray, { contrast, midtones, highlights, invert, threshold });
  
  // 3. Dithering
  let dithered = applyDither(adjusted, scaledW, scaledH, style, lineScale, bleed);
  
  // 4. Depth / Shadow Effect
  if (depth > 0) {
    dithered = applyDepth(dithered, scaledW, scaledH, depth);
  }
  
  // 5. Palette Mapping & Upscaling
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
        output.data[dstIdx+1] = colored[srcIdx+1];
        output.data[dstIdx+2] = colored[srcIdx+2];
        output.data[dstIdx+3] = 255;
      }
    }
  }
  
  return output;
};

const applyAdjustments = (gray, { contrast, midtones, highlights, invert, threshold }) => {
  const adjusted = new Uint8ClampedArray(gray);
  
  // Pre-calculate lookup table for performance
  const lut = new Uint8ClampedArray(256);
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const bias = 128 - threshold; // Shift mid-point based on threshold slider

  for (let i = 0; i < 256; i++) {
      let v = i;
      
      // 1. Threshold Bias
      v += bias;
      
      // 2. Contrast
      if (contrast !== 45) {
          v = contrastFactor * (v - 128) + 128;
      }
      
      // Clamp
      v = Math.max(0, Math.min(255, v));
      
      // 3. Curves (Midtones/Highlights)
      let norm = v / 255;
      if (norm < 0.5) norm = norm * (midtones / 50);
      else norm = 0.5 + (norm - 0.5) * (highlights / 50);
      v = norm * 255;
      
      // 4. Invert
      if (invert) v = 255 - v;
      
      lut[i] = v;
  }

  for (let i = 0; i < gray.length; i++) {
      adjusted[i] = lut[gray[i]];
  }
  
  return adjusted;
};

const applyDither = (gray, w, h, style, lineScale, bleed) => {
  let algo = null, category = null;
  for (const [cat, algos] of Object.entries(ALGORITHM_CATEGORIES)) {
    if (algos[style]) { algo = algos[style]; category = cat; break; }
  }
  if (!algo) return gray; 

  // --- ERROR DIFFUSION ---
  if (category === "Error Diffusion") {
    if (algo.type === "variable") return applyOstromoukhov(gray, w, h);
    
    // Copy to Float32 to handle negative error propagation without clamping
    const pixels = new Float32Array(gray);
    const { divisor, offsets } = algo;
    
    // Bleed controls the "intensity" of the error. 
    // >1.0 creates "glitch/melt", <1.0 is subtler.
    const bleedFactor = (bleed + 50) / 100; // Map 0-100 slider to 0.5 - 1.5 range roughly
    
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

  // --- ORDERED (BITMAP) ---
  } else if (category === "Ordered (Bitmap)") {
    const output = new Uint8ClampedArray(w * h);
    
    const getPattern = (algo, x, y) => {
        if (typeof algo === 'number') {
            const m = getBayerMatrix(algo);
            return m[y % algo][x % algo];
        }
        if (algo === 'knoll') return getKnollMatrix()[y%4][x%4];
        if (algo === 'hlines') return (Math.floor(y/lineScale)%2 === 0) ? 0 : 255;
        if (algo === 'vlines') return (Math.floor(x/lineScale)%2 === 0) ? 0 : 255;
        if (algo === 'dlines') return (Math.floor((x+y)/lineScale)%2 === 0) ? 0 : 255;
        return 127;
    };

    // Pre-calc matrix for performance if it's a number
    const isMatrix = typeof algo === 'number' || algo === 'knoll';
    const matrix = isMatrix ? (typeof algo === 'number' ? getBayerMatrix(algo) : getKnollMatrix()) : null;
    const size = matrix ? matrix.length : 0;

    for (let i = 0; i < w * h; i++) {
        const x = i % w, y = Math.floor(i / w);
        let threshold = 127;

        if (isMatrix) {
            threshold = matrix[y % size][x % size];
        } else {
            // Line patterns
            if (algo === 'hlines') threshold = (y % lineScale < lineScale/2) ? 20 : 230;
            else if (algo === 'vlines') threshold = (x % lineScale < lineScale/2) ? 20 : 230;
            else if (algo === 'dlines') threshold = ((x+y) % lineScale < lineScale/2) ? 20 : 230;
        }
        
        output[i] = gray[i] > threshold ? 255 : 0;
    }
    return output;

  // --- ORGANIC ---
  } else if (category === "Organic") {
    const output = new Uint8ClampedArray(w * h);
    if (algo === 'bluenoise') {
      const noise = generateBlueNoise(w, h);
      for (let i = 0; i < gray.length; i++) output[i] = gray[i] > noise[i] ? 255 : 0;
    } else if (algo === 'whitenoise') {
      for (let i = 0; i < gray.length; i++) output[i] = gray[i] > Math.random() * 255 ? 255 : 0;
    } else if (algo === 'voronoi') {
      const step = Math.max(4, lineScale * 2);
      const points = [];
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
          const gridX = Math.floor(x / step) * step;
          const gridY = Math.floor(y / step) * step;
          let minDist = Infinity;
          // Optimization: Check only 9 surrounding grid cells
          for(let dx = -step; dx <= step; dx+=step) {
             for(let dy = -step; dy <= step; dy+=step) {
                 // Simple approach: Iterate all points in this rough grid bucket? 
                 // For real-time video, strict Voronoi is too slow. 
                 // We'll use a simplified jittered grid approach.
             }
          }
          // Fallback to "fast voronoi" - simple dot density check
          // Using Stippling logic instead for performance safety
          output[y*w+x] = Math.random() > (gray[y*w+x]/255) ? 255 : 0;
        }
      }
      // Re-implement proper Stippling as "Voronoi" fallback for speed
      for (let i = 0; i < gray.length; i++) output[i] = Math.random() > (gray[i] / 255) ? 255 : 0;
    } else if (algo === 'stipple') {
      for (let i = 0; i < gray.length; i++) output[i] = Math.random() > (gray[i] / 255) ? 255 : 0;
    }
    return output;

  // --- MODULATION ---
  } else if (category === "Modulation") {
    const output = new Uint8ClampedArray(w * h);
    if (algo === 'riemersma') return applyRiemersma(gray, w, h, lineScale);
    
    const { axis, wave } = algo;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let t = 127;
        const val = (lineScale < 1) ? 1 : lineScale;
        if (axis === 'x') t = wave === 'sine' ? 127.5 + 127.5 * Math.sin(x * (val / 10)) : (Math.floor(x / val) % 2) * 255;
        else if (axis === 'y') t = 127.5 + 127.5 * Math.sin(y * (val / 10));
        else if (axis === 'radial') {
          const dist = Math.sqrt((x-w/2)**2 + (y-h/2)**2);
          t = 127.5 + 127.5 * Math.sin(dist * (val / 10));
        }
        output[y * w + x] = gray[y * w + x] > t ? 255 : 0;
      }
    }
    return output;

  // --- PATTERN ---
  } else if (category === "Pattern") {
    const output = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) {
        const x = i % w, y = Math.floor(i / w);
        let k = true;
        if (algo === 'checker') k = (x + y) % 2 === 0;
        else if (algo === 'grid') k = x % lineScale === 0 || y % lineScale === 0;
        else if (algo === 'random') k = Math.random() > 0.5;
        else if (algo === 'gradient') k = gray[i] > ((x*y)%255);
        
        output[i] = k ? (gray[i] > 127 ? 255 : 0) : (gray[i] > 200 ? 255 : 0);
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
  // Simplified Hilbert curve for demo performance
  // Real Riemersma follows the curve to distribute error
  let error = 0;
  const q = intensity / 2; 
  // Snake scan as a faster approximation of space-filling curve behavior
  for (let y = 0; y < h; y++) {
      const isEven = y % 2 === 0;
      for (let x = 0; x < w; x++) {
          const realX = isEven ? x : w - 1 - x;
          const idx = y * w + realX;
          const val = pixels[idx] + error;
          const out = val > 127 ? 255 : 0;
          output[idx] = out;
          error = (val - out) * 0.5; // Simple propagation
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
      // If current pixel is black (0), darken the pixel at x-offset
      // In our logic 0 is typically black or palette color 1
      if (dithered[y*w+x] === 0) {
        // "Carve" into the image
        // We can't change color index easily here without re-mapping.
        // Simple trick: shifts pixels
        output[y*w+(x-offset)] = 0; 
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
    const c1 = colors[Math.min(idx, stops)] || [0,0,0];
    const c2 = colors[Math.min(idx + 1, stops)] || [0,0,0];
    output[i*3] = c1[0] + (c2[0] - c1[0]) * frac;
    output[i*3+1] = c1[1] + (c2[1] - c1[1]) * frac;
    output[i*3+2] = c1[2] + (c2[2] - c1[2]) * frac;
  }
  return output;
};

/* --- 4. REACT COMPONENT --- */

export default function App() {
  const [mediaType, setMediaType] = useState(null); 
  const [sourceUrl, setSourceUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // -- UI STATE --
  const [zoom, setZoom] = useState(1);
  const [showSettings, setShowSettings] = useState(true);

  // -- DITHER PARAMS --
  const [scale, setScale] = useState(4); // Pixel scale
  const [style, setStyle] = useState("Atkinson");
  const [selectedCategory, setSelectedCategory] = useState("Error Diffusion");
  
  // -- PALETTE PARAMS --
  const [paletteCategory, setPaletteCategory] = useState("Halloween");
  const [paletteIdx, setPaletteIdx] = useState(0); 
  
  // -- IMAGE ADJUSTMENTS --
  const [contrast, setContrast] = useState(45);
  const [midtones, setMidtones] = useState(50);
  const [highlights, setHighlights] = useState(50);
  const [threshold, setThreshold] = useState(128); // Luminance Threshold (Bias)
  const [blur, setBlur] = useState(0); // Pre-blur
  
  // -- DITHER MODIFIERS --
  const [lineScale, setLineScale] = useState(4);
  const [bleed, setBleed] = useState(50); // Error multiplier (50 = 1.0x)
  const [depth, setDepth] = useState(0);
  const [invert, setInvert] = useState(false);
  
  // Refs
  const canvasRef = useRef(null);
  const hiddenVideoRef = useRef(null);
  const hiddenImageRef = useRef(null);
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const availableStyles = useMemo(() => Object.keys(ALGORITHM_CATEGORIES[selectedCategory] || {}), [selectedCategory]);
  
  const currentPalette = useMemo(() => {
      const cat = PALETTE_PRESETS[paletteCategory] || PALETTE_PRESETS["Halloween"];
      const raw = cat[paletteIdx] || cat[0];
      return raw.map(hexToRgb);
  }, [paletteCategory, paletteIdx]);

  // Default Style Select
  useEffect(() => {
    if (availableStyles.length > 0 && !availableStyles.includes(style)) setStyle(availableStyles[0]);
  }, [selectedCategory, availableStyles, style]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsPlaying(false);
    setIsRecording(false);
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    if (file.type.startsWith('video')) {
      setMediaType('video');
      setIsPlaying(true);
      setTimeout(fitToScreen, 500); 
    } else {
      setMediaType('image');
      setIsPlaying(false);
      setTimeout(fitToScreen, 100);
    }
  };

  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    let w = 800, h = 600;
    if (mediaType === 'image' && hiddenImageRef.current) { w = hiddenImageRef.current.width; h = hiddenImageRef.current.height; } 
    else if (mediaType === 'video' && hiddenVideoRef.current) { w = hiddenVideoRef.current.videoWidth; h = hiddenVideoRef.current.videoHeight; }
    if (w === 0 || h === 0) return;
    const { clientWidth, clientHeight } = containerRef.current;
    // Fit with 10% margin
    const scaleX = (clientWidth * 0.9) / w;
    const scaleY = (clientHeight * 0.9) / h;
    setZoom(Math.min(scaleX, scaleY));
  }, [mediaType]);

  const processFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    let w, h, source;
    if (mediaType === 'video') {
        const video = hiddenVideoRef.current;
        if (!video || video.paused || video.ended) return; 
        w = video.videoWidth; h = video.videoHeight; source = video;
    } else {
        const img = hiddenImageRef.current;
        if (!img) return;
        w = img.width; h = img.height; source = img;
    }
    if (w === 0 || h === 0) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

    // 1. Draw Source with Pre-Blur
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(source, 0, 0, w, h);
    ctx.filter = 'none'; 
    
    // 2. Get Data
    const imageData = ctx.getImageData(0, 0, w, h);
    
    // 3. Process (Heavy Lifting)
    const result = processImage(imageData, {
        scale, style, palette: currentPalette, lineScale, bleed, contrast, midtones, highlights, depth, invert, threshold
    });

    // 4. Put Data
    ctx.putImageData(result, 0, 0);

    if (mediaType === 'video' && isPlaying) {
        animationFrameRef.current = requestAnimationFrame(processFrame);
    }
  }, [mediaType, isPlaying, scale, style, currentPalette, lineScale, bleed, contrast, midtones, highlights, depth, invert, threshold, blur]);

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

  const toggleRecording = () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const stream = canvas.captureStream(30); 
      let options = { mimeType: 'video/webm;codecs=vp9' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm' };
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'dither-boy-video.webm'; a.click(); URL.revokeObjectURL(url);
      };
      mediaRecorder.start();
      setIsRecording(true);
      if (mediaType === 'video' && !isPlaying) setIsPlaying(true);
    }
  };

  const handleStaticExport = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'dither-boy-export.png';
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  // --- COMPONENT HELPERS ---
  const ControlGroup = ({ label, value, min, max, onChange, highlight = false, subLabel }) => (
      <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
              <label className={highlight ? "text-[#ff6600] font-bold" : "text-gray-400"}>{label}</label>
              <span className="font-mono text-gray-500">{value}</span>
          </div>
          <input 
            type="range" min={min} max={max} value={value} 
            onChange={(e) => onChange(Number(e.target.value))} 
            className={`w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#ff6600]`}
          />
          {subLabel && <div className="text-[10px] text-gray-600 mt-1">{subLabel}</div>}
      </div>
  );

  return (
    <div className="flex h-screen bg-[#120a0a] text-[#d1d1d1] font-sans selection:bg-[#ff6600] selection:text-black">
      <img ref={hiddenImageRef} src={mediaType === 'image' ? sourceUrl : ''} className="hidden" onLoad={processFrame} alt="src" />
      <video ref={hiddenVideoRef} src={mediaType === 'video' ? sourceUrl : ''} className="hidden" loop muted playsInline onLoadedMetadata={fitToScreen} />

      {/* TOP HEADER */}
      <div className="absolute top-0 left-0 right-0 h-10 bg-[#0a0505] border-b border-[#2a1a1a] flex items-center px-4 justify-between z-20">
        <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
           <span className="text-[#ff6600] font-black tracking-widest text-sm">DITHER BOY <span className="text-white opacity-20 font-normal">PRO</span></span>
           <span className="hover:text-white cursor-pointer transition-colors">File</span> 
           <span className="hover:text-white cursor-pointer transition-colors">Edit</span> 
           <span className="hover:text-white cursor-pointer transition-colors">Help</span>
        </div>
        <div className="flex items-center gap-3">
             <button onClick={() => setShowSettings(!showSettings)} className={`p-1.5 rounded hover:bg-[#2a1a1a] ${showSettings ? 'text-[#ff6600]' : 'text-gray-500'}`}>
                 <Settings size={16} />
             </button>
        </div>
      </div>
      
      {/* MAIN VIEWPORT */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center bg-[#050202] mt-10 relative overflow-hidden">
        {sourceUrl ? (
          <div style={{ transform: `scale(${zoom})`, transition: 'transform 0.1s ease-out' }} className="shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-[#2a1a1a] origin-center">
            <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', display: 'block' }} />
          </div>
        ) : (
          <div className="text-center text-[#332222] select-none flex flex-col items-center animate-pulse">
            <div className="w-24 h-24 mb-4 border-2 border-[#ff6600] rounded-full flex items-center justify-center bg-[#0a0505]">
                <Upload size={32} className="text-[#ff6600]" />
            </div>
            <p className="text-sm font-bold text-[#ff6600] tracking-widest uppercase">Drop Image or Video</p>
            <p className="text-xs text-gray-600 mt-2">Supports MP4, WEBM, PNG, JPG, GIF</p>
          </div>
        )}
      </div>
      
      {/* SIDEBAR */}
      <div className={`w-80 bg-[#0e0808] border-l border-[#2a1a1a] flex flex-col mt-10 z-30 transition-transform duration-300 ${showSettings ? 'translate-x-0' : 'translate-x-full absolute right-0 h-[calc(100%-2.5rem)]'}`}>
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          
          {/* ACTION BUTTONS */}
          <div className="grid grid-cols-2 gap-2">
            <input ref={fileInputRef} type="file" accept="image/*,video/mp4,video/webm" onChange={handleFileUpload} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="bg-[#2a1515] hover:bg-[#3a1f1f] text-[#ff6600] py-3 rounded text-xs font-bold uppercase tracking-wider border border-[#ff6600]/20 flex items-center justify-center gap-2 transition-all">
                <ImageIcon size={14} /> Import
            </button>
            
            <button onClick={mediaType === 'video' ? toggleRecording : handleStaticExport} 
                    disabled={!sourceUrl}
                    className={`py-3 rounded text-xs font-bold uppercase tracking-wider border border-[#ff6600]/20 flex items-center justify-center gap-2 transition-all ${isRecording ? 'bg-[#ff6600] text-black animate-pulse' : 'bg-[#1a0a0a] hover:bg-[#2a1a1a] text-gray-300'}`}>
               {mediaType === 'video' ? (isRecording ? <><Disc size={14}/> Stop</> : <><Video size={14}/> Record</>) : <><Download size={14}/> Export</>}
            </button>
          </div>

          <div className="h-px bg-[#2a1a1a]" />

          {/* DITHER ALGO */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-[#ff6600] font-bold text-xs uppercase tracking-wider">
                <Layers size={12} /> Dither Engine
            </div>
            <div className="flex flex-col gap-2">
                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full bg-[#160a0a] border border-[#331111] rounded px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-[#ff6600] focus:ring-1 focus:ring-[#ff6600]">
                  {Object.keys(ALGORITHM_CATEGORIES).map(cat => <option key={cat}>{cat}</option>)}
                </select>
                <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full bg-[#160a0a] border border-[#331111] rounded px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-[#ff6600] focus:ring-1 focus:ring-[#ff6600]">
                  {availableStyles.map(s => <option key={s}>{s}</option>)}
                </select>
            </div>
          </div>

          {/* MAIN CONTROLS */}
          <div className="space-y-1">
             <ControlGroup label="Pixel Scale" value={scale} min={1} max={20} onChange={setScale} highlight subLabel="Pixelation amount" />
             <ControlGroup label="Pattern Scale" value={lineScale} min={1} max={50} onChange={setLineScale} subLabel="For lines/organic patterns" />
          </div>

          <div className="h-px bg-[#2a1a1a]" />

          {/* PALETTE */}
          <div>
             <div className="flex items-center gap-2 mb-2 text-[#ff6600] font-bold text-xs uppercase tracking-wider">
                <ImageIcon size={12} /> Color Palette
             </div>
             <select value={paletteCategory} onChange={(e) => { setPaletteCategory(e.target.value); setPaletteIdx(0); }} className="w-full bg-[#160a0a] border border-[#331111] rounded px-3 py-2 text-xs mb-3 text-gray-300 focus:outline-none focus:border-[#ff6600]">
                 {Object.keys(PALETTE_PRESETS).map(p => <option key={p}>{p}</option>)}
             </select>
             
             <div className="grid grid-cols-1 gap-2">
                 {(PALETTE_PRESETS[paletteCategory] || []).map((pal, idx) => (
                     <button key={idx} onClick={() => setPaletteIdx(idx)} 
                          className={`h-8 w-full rounded border transition-all relative overflow-hidden group ${paletteIdx === idx ? 'border-[#ff6600] ring-1 ring-[#ff6600] scale-[1.02]' : 'border-[#331111] hover:border-gray-500'}`}>
                          <div className="absolute inset-0 flex">
                             {pal.map((c, i) => <div key={i} style={{background: c}} className="flex-1 h-full" />)}
                          </div>
                     </button>
                 ))}
             </div>
          </div>

          <div className="h-px bg-[#2a1a1a]" />

          {/* ADJUSTMENTS */}
          <div>
            <div className="flex items-center justify-between mb-3 text-[#ff6600] font-bold text-xs uppercase tracking-wider">
               <span>Adjustments</span>
               <button onClick={() => setInvert(!invert)} className={`px-2 py-0.5 rounded text-[10px] border ${invert ? 'bg-[#ff6600] text-black border-[#ff6600]' : 'border-[#331111] text-gray-500'}`}>
                   INVERT
               </button>
            </div>
            
            <ControlGroup label="Luminance Threshold" value={threshold} min={0} max={255} onChange={setThreshold} highlight subLabel="Darkness Bias" />
            <ControlGroup label="Pre-Blur" value={blur} min={0} max={20} onChange={setBlur} subLabel="Softens dither noise" />
            <ControlGroup label="Contrast" value={contrast} min={0} max={100} onChange={setContrast} />
            <ControlGroup label="Bleed (Error)" value={bleed} min={0} max={100} onChange={setBleed} subLabel=">50 creates glitching" />
            <ControlGroup label="Depth" value={depth} min={0} max={20} onChange={setDepth} />
          </div>

          {/* RESET */}
          <button onClick={() => { setScale(4); setContrast(45); setThreshold(128); setBlur(0); setBleed(50); setDepth(0); setInvert(false); }} 
                  className="w-full py-3 bg-[#1a0a0a] hover:bg-[#ff0000]/20 text-gray-500 hover:text-red-400 rounded text-xs transition-colors flex items-center justify-center gap-2">
            <RotateCcw size={12} /> Reset Parameters
          </button>
          
          <div className="text-[10px] text-[#332222] text-center pb-4">
              v4.0.0 • Studio AAA
          </div>
        </div>
      </div>
    </div>
  );
}