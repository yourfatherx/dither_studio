import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Upload, RotateCcw, ZoomIn, ZoomOut, Plus, Trash2, Maximize } from 'lucide-react';

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

const getBayerMatrix = (size) => {
  if (size === 2) return [[0, 2], [3, 1]].map(r => r.map(v => v * 64));
  if (size === 4) return [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]].map(r => r.map(v => v * 16));
  if (size === 8) {
    const m = [[0,32,8,40,2,34,10,42],[48,16,56,24,50,18,58,26],[12,44,4,36,14,46,6,38],
               [60,28,52,20,62,30,54,22],[3,35,11,43,1,33,9,41],[51,19,59,27,49,17,57,25],
               [15,47,7,39,13,45,5,37],[63,31,55,23,61,29,53,21]];
    return m.map(r => r.map(v => v * 4));
  }
  return null;
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

const rgbToHex = (r, g, b) => {
  const componentToHex = (c) => {
    const hex = c.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
};

const processImage = (imageData, settings) => {
  const { width, height, data } = imageData;
  const { scale, style, palette, lineScale, bleed, contrast, midtones, highlights, depth, invert } = settings;
  
  const scaledW = Math.max(1, Math.floor(width / scale));
  const scaledH = Math.max(1, Math.floor(height / scale));
  const gray = new Uint8ClampedArray(scaledW * scaledH);
  
  for (let y = 0; y < scaledH; y++) {
    for (let x = 0; x < scaledW; x++) {
      const srcX = Math.floor(x * scale);
      const srcY = Math.floor(y * scale);
      const srcIdx = (srcY * width + srcX) * 4;
      gray[y * scaledW + x] = Math.floor(0.299 * data[srcIdx] + 0.587 * data[srcIdx+1] + 0.114 * data[srcIdx+2]);
    }
  }
  
  let adjusted = applyAdjustments(gray, { contrast, midtones, highlights, invert });
  let dithered = applyDither(adjusted, scaledW, scaledH, style, lineScale, bleed);
  if (depth > 0) dithered = applyDepth(dithered, scaledW, scaledH, depth);
  const colored = applyPalette(dithered, palette);
  
  const output = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = Math.floor(x / scale);
      const srcY = Math.floor(y / scale);
      const srcIdx = (srcY * scaledW + srcX) * 3;
      const dstIdx = (y * width + x) * 4;
      output.data[dstIdx] = colored[srcIdx];
      output.data[dstIdx+1] = colored[srcIdx+1];
      output.data[dstIdx+2] = colored[srcIdx+2];
      output.data[dstIdx+3] = 255;
    }
  }
  
  return output;
};

const applyAdjustments = (gray, { contrast, midtones, highlights, invert }) => {
  let adjusted = new Uint8ClampedArray(gray);
  
  if (contrast !== 45) {
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    adjusted = adjusted.map(v => Math.max(0, Math.min(255, factor * (v - 128) + 128)));
  }
  
  adjusted = adjusted.map(v => {
    let val = v / 255;
    if (val < 0.5) val = val * (midtones / 50);
    else val = 0.5 + (val - 0.5) * (highlights / 50);
    return Math.max(0, Math.min(255, val * 255));
  });
  
  if (invert) adjusted = adjusted.map(v => 255 - v);
  return adjusted;
};

const applyDither = (gray, w, h, style, lineScale, bleed) => {
  let algo = null, category = null;
  
  for (const [cat, algos] of Object.entries(ALGORITHM_CATEGORIES)) {
    if (algos[style]) { algo = algos[style]; category = cat; break; }
  }
  
  if (!algo) return gray.map(v => v > 127 ? 255 : 0);
  
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
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          output[y * w + x] = gray[y * w + x] > matrix[y % size][x % size] ? 255 : 0;
        }
      }
    } else if (algo === 'knoll') {
      const matrix = getKnollMatrix();
      const size = matrix.length;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          output[y * w + x] = gray[y * w + x] > matrix[y % size][x % size] ? 255 : 0;
        }
      }
    } else if (algo === 'hlines') {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          output[y * w + x] = (y % lineScale < lineScale/2) ? (gray[y*w+x] > 127 ? 255 : 0) : gray[y*w+x] > 200 ? 255 : 0;
        }
      }
    } else if (algo === 'vlines') {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          output[y * w + x] = (x % lineScale < lineScale/2) ? (gray[y*w+x] > 127 ? 255 : 0) : gray[y*w+x] > 200 ? 255 : 0;
        }
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
        const threshold = Math.random() * 255;
        output[i] = gray[i] > threshold ? 255 : 0;
      }
    } else if (algo === 'voronoi') {
      const points = [];
      const numPoints = Math.floor(w * h / (lineScale * lineScale));
      for (let i = 0; i < numPoints; i++) {
        points.push({
          x: Math.random() * w,
          y: Math.random() * h
        });
      }
      
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let minDist = Infinity;
          for (const p of points) {
            const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
            if (dist < minDist) minDist = dist;
          }
          const threshold = minDist * (255 / (lineScale * 2));
          output[y * w + x] = gray[y * w + x] > threshold ? 255 : 0;
        }
      }
    } else if (algo === 'stipple') {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const density = gray[y * w + x] / 255;
          output[y * w + x] = Math.random() > density ? 255 : 0;
        }
      }
    }
    return output;
  } else if (category === "Modulation") {
    const output = new Uint8ClampedArray(w * h);
    
    if (algo === 'riemersma') {
      return applyRiemersma(gray, w, h, lineScale);
    }
    
    if (typeof algo === 'object') {
      const { axis, wave } = algo;
      
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let threshold = 127;
          
          if (axis === 'x') {
            threshold = wave === 'sine' ? 127.5 + 127.5 * Math.sin(x * (lineScale / 50)) : (Math.floor(x / lineScale) % 2) * 255;
          } else if (axis === 'y') {
            threshold = 127.5 + 127.5 * Math.sin(y * (lineScale / 50));
          } else if (axis === 'radial') {
            const dist = Math.sqrt((x-w/2)**2 + (y-h/2)**2);
            threshold = 127.5 + 127.5 * Math.sin(dist * (lineScale / 50));
          }
          
          output[y * w + x] = gray[y * w + x] > threshold ? 255 : 0;
        }
      }
    }
    return output;
  } else if (category === "Pattern") {
    const output = new Uint8ClampedArray(w * h);
    
    if (algo === 'gradient') {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const pattern = ((x * 52.9829 + y * 11.4521) % 1.0) * 255;
          output[y * w + x] = gray[y * w + x] > pattern ? 255 : 0;
        }
      }
    } else {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let keep = true;
          if (algo === 'checker') keep = (x + y) % 2 === 0;
          else if (algo === 'grid') keep = x % lineScale === 0 || y % lineScale === 0;
          else if (algo === 'random') keep = Math.random() > 0.5;
          output[y * w + x] = keep ? (gray[y*w+x] > 127 ? 255 : 0) : gray[y*w+x] > 200 ? 255 : 0;
        }
      }
    }
    return output;
  }
  
  return gray.map(v => v > 127 ? 255 : 0);
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
  
  const hilbertCurve = (order) => {
    const path = [];
    const n = 1 << order;
    
    const rot = (n, rx, ry, point) => {
      if (ry === 0) {
        if (rx === 1) {
          point.x = n - 1 - point.x;
          point.y = n - 1 - point.y;
        }
        const t = point.x;
        point.x = point.y;
        point.y = t;
      }
    };
    
    for (let d = 0; d < n * n; d++) {
      let t = d;
      let point = { x: 0, y: 0 };
      for (let s = 1; s < n; s *= 2) {
        const rx = 1 & (t / 2);
        const ry = 1 & (t ^ rx);
        rot(s, rx, ry, point);
        point.x += s * rx;
        point.y += s * ry;
        t /= 4;
      }
      if (point.x < w && point.y < h) path.push(point);
    }
    return path;
  };
  
  const order = Math.ceil(Math.log2(Math.max(w, h)));
  const path = hilbertCurve(order);
  
  let error = 0;
  for (const p of path) {
    const idx = p.y * w + p.x;
    const val = pixels[idx] + error;
    output[idx] = val > 127 ? 255 : 0;
    error = (val - output[idx]) * (intensity / 10);
  }
  
  return output;
};

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
    const c1 = colors[Math.min(idx, stops)];
    const c2 = colors[Math.min(idx + 1, stops)];
    
    // Safety check if colors are undefined
    if (!c1 || !c2) {
        output[i*3] = 0;
        output[i*3+1] = 0;
        output[i*3+2] = 0;
        continue;
    }

    output[i*3] = c1[0] + (c2[0] - c1[0]) * frac;
    output[i*3+1] = c1[1] + (c2[1] - c1[1]) * frac;
    output[i*3+2] = c1[2] + (c2[2] - c1[2]) * frac;
  }
  return output;
};

export default function DitherBoyPro() {
  const [image, setImage] = useState(null);
  const [processed, setProcessed] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [scale, setScale] = useState(11);
  const [lineScale, setLineScale] = useState(1);
  const [bleed, setBleed] = useState(0);
  const [style, setStyle] = useState("Sine Wave Y");
  const [selectedCategory, setSelectedCategory] = useState("Modulation");
  
  // Palette State
  const [paletteCategory, setPaletteCategory] = useState("Retro");
  const [palette, setPalette] = useState(PALETTE_PRESETS["Retro"].map(hexToRgb));
  
  const [contrast, setContrast] = useState(45);
  const [midtones, setMidtones] = useState(50);
  const [highlights, setHighlights] = useState(50);
  const [depth, setDepth] = useState(6);
  const [invert, setInvert] = useState(false);
  
  // Viewport State
  const [zoom, setZoom] = useState(1);
  
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);
  
  const availableStyles = useMemo(() => {
    return Object.keys(ALGORITHM_CATEGORIES[selectedCategory] || {});
  }, [selectedCategory]);
  
  useEffect(() => {
    if (availableStyles.length > 0 && !availableStyles.includes(style)) {
      setStyle(availableStyles[0]);
    }
  }, [selectedCategory, availableStyles, style]);

  // Auto-fit Logic
  const fitImageToScreen = useCallback(() => {
    if (!image || !containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    
    // Add some padding (e.g. 40px)
    const availableWidth = clientWidth - 40;
    const availableHeight = clientHeight - 40;
    
    const scaleX = availableWidth / image.width;
    const scaleY = availableHeight / image.height;
    
    // Fit to whichever dimension is tighter
    const fitScale = Math.min(scaleX, scaleY);
    
    setZoom(fitScale);
  }, [image]);

  // Trigger auto-fit when new image loads
  useEffect(() => {
    if(image) {
      fitImageToScreen();
    }
  }, [image, fitImageToScreen]);
  
  const process = useCallback(() => {
    if (!image) return;
    
    setIsProcessing(true);
    requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, image.width, image.height);
      const result = processImage(imageData, {
        scale, style, palette, lineScale, bleed, contrast, midtones, highlights, depth, invert
      });
      
      ctx.putImageData(result, 0, 0);
      setProcessed(canvas.toDataURL());
      setIsProcessing(false);
    });
  }, [image, scale, style, palette, lineScale, bleed, contrast, midtones, highlights, depth, invert]);
  
  useEffect(() => {
    if (image) {
      const timer = setTimeout(process, 100);
      return () => clearTimeout(timer);
    }
  }, [image, scale, style, palette, lineScale, bleed, contrast, midtones, highlights, depth, invert, process]);
  
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        // Zoom reset happens in useEffect
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };
  
  const handleExport = () => {
    if (!processed) return;
    const link = document.createElement('a');
    link.download = 'ditherboy-export.png';
    link.href = processed;
    link.click();
  };
  
  const resetAll = () => {
    setScale(11);
    setLineScale(1);
    setBleed(0);
    setContrast(45);
    setMidtones(50);
    setHighlights(50);
    setDepth(6);
    setInvert(false);
    if(image) fitImageToScreen();
  };
  
  const changePaletteCategory = (presetName) => {
    setPaletteCategory(presetName);
    if (presetName !== "Custom") {
      setPalette(PALETTE_PRESETS[presetName].map(hexToRgb));
    }
  };

  // Custom Palette Handlers
  const handleColorChange = (index, newHex) => {
    const newRgb = hexToRgb(newHex);
    const newPalette = [...palette];
    newPalette[index] = newRgb;
    setPalette(newPalette);
    setPaletteCategory("Custom");
  };

  const addColorStop = () => {
    const newPalette = [...palette, [255, 255, 255]]; // Default to white
    setPalette(newPalette);
    setPaletteCategory("Custom");
  };

  const removeColorStop = (index) => {
    if (palette.length <= 2) return; // Prevent removing if only 2 colors left
    const newPalette = palette.filter((_, i) => i !== index);
    setPalette(newPalette);
    setPaletteCategory("Custom");
  };
  
  return (
    <div className="flex h-screen bg-black text-gray-300">
      <canvas ref={canvasRef} className="hidden" />
      
      <div className="absolute top-0 left-0 right-0 h-9 bg-neutral-900 border-b border-neutral-800 flex items-center px-3 text-xs z-20">
        <div className="px-3 py-1 hover:bg-neutral-800 cursor-pointer rounded">File</div>
        <div className="px-3 py-1 hover:bg-neutral-800 cursor-pointer rounded">Edit</div>
        <div className="px-3 py-1 hover:bg-neutral-800 cursor-pointer rounded">Batch</div>
        <div className="px-3 py-1 hover:bg-neutral-800 cursor-pointer rounded">Adjustments</div>
        <div className="px-3 py-1 hover:bg-neutral-800 cursor-pointer rounded">Themes</div>
        <div className="px-3 py-1 hover:bg-neutral-800 cursor-pointer rounded">Extras</div>
        <div className="px-3 py-1 hover:bg-neutral-800 cursor-pointer rounded">Help</div>
      </div>
      
      {/* Canvas Area - Ref attached here to calculate size */}
      <div 
        ref={containerRef}
        className="flex-1 flex items-center justify-center bg-gradient-to-br from-neutral-950 via-blue-950/10 to-purple-950/10 mt-9 relative overflow-hidden"
      >
        {processed ? (
          <div 
            className="origin-center transition-transform duration-200"
            style={{ 
              transform: `scale(${zoom})`,
              // Using flex allows the image to center within the scaled div
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center'
            }}
          >
            {/* removed max-w-none to allow proper sizing, used standard img behavior */}
            <img 
              src={processed} 
              alt="Processed" 
              className="shadow-2xl object-contain pointer-events-none select-none"
              style={{ 
                imageRendering: 'pixelated',
                maxWidth: 'unset', // Allow it to be its natural size, handled by transform scale
                maxHeight: 'unset' 
              }} 
            />
          </div>
        ) : (
          <div className="text-center text-gray-600">
            <Upload size={64} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">Load an image to begin</p>
          </div>
        )}
        
        {isProcessing && (
          <div className="absolute top-4 left-4 bg-blue-600 px-3 py-1.5 rounded text-xs font-medium z-50 shadow-lg">
            Processing...
          </div>
        )}
      </div>
      
      <div className="w-72 bg-neutral-900 border-l border-neutral-800 flex flex-col mt-9 overflow-hidden z-30">
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
          
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} 
              className="flex-1 bg-neutral-800 hover:bg-neutral-700 py-2.5 rounded font-medium transition-colors">
              Import
            </button>
            <button onClick={handleExport} disabled={!processed} 
              className="flex-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 py-2.5 rounded font-medium transition-colors">
              Export
            </button>
          </div>
          
          <div className="flex gap-2 items-center justify-between bg-neutral-800 p-2 rounded">
            <button onClick={() => setZoom(Math.max(0.05, zoom - 0.1))} 
              className="hover:bg-neutral-700 p-1.5 rounded transition-colors" title="Zoom Out">
              <ZoomOut size={14} />
            </button>
            <span className="text-xs font-medium w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(Math.min(10, zoom + 0.1))} 
              className="hover:bg-neutral-700 p-1.5 rounded transition-colors" title="Zoom In">
              <ZoomIn size={14} />
            </button>
            <button onClick={fitImageToScreen} 
              className="hover:bg-neutral-700 p-1.5 rounded transition-colors" title="Fit to Screen">
              <Maximize size={14} />
            </button>
          </div>
          
          <div className="h-px bg-neutral-800 my-2" />
          
          {/* Logo / Character */}
          <div className="flex justify-center my-3">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg border-4 border-neutral-800">
              <div className="text-4xl">😺</div>
            </div>
          </div>
          
          <div>
            <label className="text-gray-400 mb-1.5 block font-medium">Style</label>
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-xs focus:outline-none focus:border-blue-500 transition-colors">
              {Object.keys(ALGORITHM_CATEGORIES).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-gray-400 mb-1.5 block font-medium">Pattern/Algo</label>
            <select value={style} onChange={(e) => setStyle(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-xs focus:outline-none focus:border-blue-500 transition-colors">
              {availableStyles.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          
          <div className="h-px bg-neutral-800 my-3" />
          
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-gray-400 font-medium">Scale</label>
              <span className="text-white font-mono">{scale}</span>
            </div>
            <input type="range" min="1" max="30" value={scale} onChange={(e) => setScale(parseInt(e.target.value))}
              className="w-full accent-blue-500" />
          </div>
          
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-gray-400 font-medium">Line Scale</label>
              <span className="text-white font-mono">{lineScale}</span>
            </div>
            <input type="range" min="1" max="20" value={lineScale} onChange={(e) => setLineScale(parseInt(e.target.value))}
              className="w-full accent-blue-500" />
          </div>
          
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-gray-400 font-medium">Bleed Fraction</label>
              <span className="text-white font-mono">{bleed}</span>
            </div>
            <input type="range" min="0" max="100" value={bleed} onChange={(e) => setBleed(parseInt(e.target.value))}
              className="w-full accent-blue-500" />
          </div>
          
          <div className="h-px bg-neutral-800 my-3" />
          
          {/* Palette Section */}
          <div>
            <label className="text-gray-400 mb-1.5 block font-medium">Palette</label>
            <select value={paletteCategory} onChange={(e) => changePaletteCategory(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-xs focus:outline-none focus:border-blue-500 transition-colors mb-2">
              {Object.keys(PALETTE_PRESETS).map(preset => (
                <option key={preset} value={preset}>{preset}</option>
              ))}
              <option value="Custom">Custom</option>
            </select>

            {/* Palette Preview Bar */}
            <div className="h-4 rounded mb-2 w-full" style={{
              background: `linear-gradient(to right, ${palette.map(c => `rgb(${c[0]},${c[1]},${c[2]})`).join(', ')})`
            }} />

            {/* Custom Palette Editor */}
            <div className="grid grid-cols-4 gap-2">
              {palette.map((color, idx) => (
                 <div key={idx} className="relative group">
                    <input 
                      type="color" 
                      value={rgbToHex(color[0], color[1], color[2])}
                      onChange={(e) => handleColorChange(idx, e.target.value)}
                      className="w-full h-8 p-0 border-0 rounded cursor-pointer overflow-hidden"
                    />
                    {palette.length > 2 && (
                      <button 
                        onClick={() => removeColorStop(idx)}
                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                 </div>
              ))}
              <button 
                onClick={addColorStop}
                className="h-8 bg-neutral-800 border border-neutral-700 rounded flex items-center justify-center hover:bg-neutral-700 transition-colors"
                title="Add Color"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          
          <div className="h-px bg-neutral-800 my-3" />
          
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-gray-400 font-medium">Contrast</label>
              <span className="text-white font-mono">{contrast}</span>
            </div>
            <input type="range" min="0" max="100" value={contrast} onChange={(e) => setContrast(parseInt(e.target.value))}
              className="w-full accent-blue-500" />
          </div>
          
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-gray-400 font-medium">Midtones</label>
              <span className="text-white font-mono">{midtones}</span>
            </div>
            <input type="range" min="0" max="100" value={midtones} onChange={(e) => setMidtones(parseInt(e.target.value))}
              className="w-full accent-blue-500" />
          </div>
          
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-gray-400 font-medium">Highlights</label>
              <span className="text-white font-mono">{highlights}</span>
            </div>
            <input type="range" min="0" max="100" value={highlights} onChange={(e) => setHighlights(parseInt(e.target.value))}
              className="w-full accent-blue-500" />
          </div>
          
          <div className="h-px bg-neutral-800 my-3" />
          
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-gray-400 font-medium">Depth</label>
              <span className="text-white font-mono">{depth}</span>
            </div>
            <input type="range" min="0" max="20" value={depth} onChange={(e) => setDepth(parseInt(e.target.value))}
              className="w-full accent-blue-500" />
          </div>
          
          <div className="flex items-center justify-between bg-neutral-800 p-2.5 rounded">
            <label className="text-gray-400 font-medium">Invert</label>
            <button onClick={() => setInvert(!invert)} 
              className={`w-12 h-6 rounded-full transition-colors ${invert ? 'bg-blue-600' : 'bg-neutral-700'} relative`}>
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${invert ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>
          
          <div className="h-px bg-neutral-800 my-3" />
          
          <button onClick={resetAll} 
            className="w-full bg-neutral-800 hover:bg-neutral-700 py-2.5 rounded font-medium transition-colors flex items-center justify-center gap-2">
            <RotateCcw size={14} />
            Reset All
          </button>
        </div>
      </div>
    </div>
  );
}