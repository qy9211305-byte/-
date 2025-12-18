
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, Pause, RotateCcw, Image as ImageIcon, Trash2, 
  Settings2, Activity, Zap, Crosshair, Send, Layers,
  MoveDown, X, Maximize2, HelpCircle, CircleDot, Save, FolderOpen, Download, Upload, Check
} from 'lucide-react';
import { FieldRegion, Particle, SimulationState, AISuggestion, Vector2D } from './types';
import { updatePhysics } from './PhysicsEngine';
import { parseProblem } from './geminiService';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

const DEFAULT_REGION: FieldRegion = {
  id: 'r1', x: -150, y: -150, width: 300, height: 300, ex: 0, ey: 0, bz: 5, color: 'rgba(59, 130, 246, 0.1)'
};

const App: React.FC = () => {
  const [state, setState] = useState<SimulationState>({
    regions: [],
    particles: [],
    isPlaying: false,
    time: 0,
    scale: 1,
    gravityEnabled: false
  });

  const [problemText, setProblemText] = useState('');
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewOffset, setViewOffset] = useState<Vector2D>({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState<Vector2D>({ x: 0, y: 0 });
  const [showFullProblem, setShowFullProblem] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const animationRef = useRef<number | undefined>(undefined);

  // Load initial state from LocalStorage if exists
  useEffect(() => {
    const saved = localStorage.getItem('physilab_save');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Basic validation
        if (parsed.regions && parsed.particles) {
          setState({ ...parsed, isPlaying: false, time: 0 });
        }
      } catch (e) {
        console.error("Failed to load local save", e);
      }
    }
  }, []);

  // Save to LocalStorage
  const handleSaveLocal = () => {
    localStorage.setItem('physilab_save', JSON.stringify({
      regions: state.regions,
      particles: state.particles,
      scale: state.scale,
      gravityEnabled: state.gravityEnabled
    }));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Export to JSON file
  const handleExportFile = () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `physilab_scene_${new Date().getTime()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import from JSON file
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        setState({ ...parsed, isPlaying: false, time: 0 });
      } catch (e) {
        alert("无效的存档文件");
      }
    };
    reader.readAsText(file);
  };

  // Simulation Loop
  useEffect(() => {
    if (state.isPlaying) {
      const step = () => {
        setState(prev => ({
          ...prev,
          particles: updatePhysics(prev.particles, prev.regions, prev.gravityEnabled),
          time: prev.time + 0.01
        }));
        animationRef.current = requestAnimationFrame(step);
      };
      animationRef.current = requestAnimationFrame(step);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [state.isPlaying]);

  // Canvas Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2 + viewOffset.x, height / 2 + viewOffset.y);
    ctx.scale(state.scale, -state.scale);

    // Draw Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5 / state.scale;
    const gridSize = 50;
    const limit = 5000 / state.scale;
    for (let x = -limit; x <= limit; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, -limit); ctx.lineTo(x, limit); ctx.stroke();
    }
    for (let y = -limit; y <= limit; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(-limit, y); ctx.lineTo(limit, y); ctx.stroke();
    }

    // Draw Axis
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1 / state.scale;
    ctx.beginPath(); ctx.moveTo(-limit, 0); ctx.lineTo(limit, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -limit); ctx.lineTo(0, limit); ctx.stroke();

    // Draw Regions
    state.regions.forEach(r => {
      ctx.fillStyle = r.color;
      ctx.fillRect(r.x, r.y, r.width, r.height);
      if (selectedId === r.id) {
        ctx.strokeStyle = '#fff'; 
        ctx.lineWidth = 2 / state.scale; 
        ctx.strokeRect(r.x, r.y, r.width, r.height);
      }
      
      if (Math.abs(r.ex) > 0 || Math.abs(r.ey) > 0) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.lineWidth = 1 / state.scale;
        const step = 40;
        for (let x = r.x + step/2; x < r.x + r.width; x += step) {
          for (let y = r.y + step/2; y < r.y + r.height; y += step) {
            const angle = Math.atan2(r.ey, r.ex);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.beginPath(); 
            ctx.moveTo(-5, 0); ctx.lineTo(5, 0); 
            ctx.lineTo(2, -2); ctx.moveTo(5, 0); ctx.lineTo(2, 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      if (Math.abs(r.bz) > 0) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.5)';
        ctx.font = `bold ${14 / state.scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const step = 40;
        for (let x = r.x + step/2; x < r.x + r.width; x += step) {
          for (let y = r.y + step/2; y < r.y + r.height; y += step) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(1, -1);
            ctx.fillText(r.bz > 0 ? '×' : '•', 0, 0);
            ctx.restore();
          }
        }
      }
    });

    // Draw Particles
    state.particles.forEach(p => {
      if (p.path.length > 1) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 / state.scale;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p.path[0].x, p.path[0].y);
        p.path.forEach(pt => ctx.lineTo(pt.x, pt.y));
        ctx.stroke();
      }

      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius / state.scale, 0, Math.PI * 2); ctx.fill();
      
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${(p.radius * 1.4) / state.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(1, -1);
      ctx.fillText(p.q > 0 ? '+' : (p.q < 0 ? '-' : 'n'), 0, 0);
      ctx.restore();

      if (selectedId === p.id) { 
        ctx.strokeStyle = '#fff'; 
        ctx.lineWidth = 2 / state.scale; 
        ctx.beginPath(); ctx.arc(p.x, p.y, (p.radius + 3) / state.scale, 0, Math.PI*2); ctx.stroke(); 
      }
    });

    ctx.restore();
  }, [state, selectedId, viewOffset]);

  const handleResize = useCallback(() => {
    if (canvasRef.current) {
      canvasRef.current.width = window.innerWidth - 320;
      canvasRef.current.height = window.innerHeight - 80;
    }
  }, []);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  const handleAIParse = async () => {
    if (!problemText && !originalImage) return;
    setIsLoading(true);
    const result = await parseProblem(problemText, originalImage || undefined);
    if (result) {
      setSummary(result.problemDescription);
      const newRegions: FieldRegion[] = result.suggestedRegions.map((r, i) => ({
        ...r, id: `ai-r-${i}`, color: `rgba(59, 130, 246, 0.1)`
      }));
      const newParticles: Particle[] = result.suggestedParticles.map((p, i) => ({
        ...p, id: `ai-p-${i}`, radius: 7, path: [{ x: p.x, y: p.y }], color: COLORS[i % COLORS.length]
      }));
      setState(prev => ({
        ...prev, regions: newRegions, particles: newParticles, isPlaying: false, time: 0
      }));
    }
    setIsLoading(false);
    setShowFullProblem(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setOriginalImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const resetParticles = () => {
    setState(prev => ({
      ...prev, time: 0, isPlaying: false,
      particles: prev.particles.map(p => ({
        ...p, x: p.path[0].x, y: p.path[0].y, vx: p.vx, vy: p.vy, path: [{ x: p.path[0].x, y: p.path[0].y }]
      }))
    }));
  };

  const selectedObject = state.regions.find(r => r.id === selectedId) || 
                         state.particles.find(p => p.id === selectedId);

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-200 overflow-hidden font-sans select-none">
      <div className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col h-full shadow-2xl z-20">
        <div className="p-5 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
          <h1 className="text-xl font-bold flex items-center gap-3">
            <Zap className="text-yellow-400 fill-yellow-400" size={24} /> 物理实验室
          </h1>
          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-black">PhysiLab Engine v2.5</p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* AI Import */}
          <div className="p-4 space-y-3 border-b border-slate-800">
            <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
              <Activity size={12} /> 题目录入
            </label>
            <textarea 
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-600 transition h-24 outline-none resize-none"
              placeholder="输入题目描述..."
              value={problemText}
              onChange={(e) => setProblemText(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 py-2.5 rounded-xl text-xs font-semibold transition border border-slate-700">
                <ImageIcon size={14} /> 上传题目
              </button>
              <button onClick={handleAIParse} disabled={isLoading} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-blue-900/40">
                {isLoading ? '建模中...' : <><Send size={14} /> 自动识别</>}
              </button>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
          </div>

          {/* Save & Load Management */}
          <div className="p-4 border-b border-slate-800 bg-slate-800/10">
            <label className="text-[10px] font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
              <FolderOpen size={12} /> 存档管理
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={handleSaveLocal}
                className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition ${saveSuccess ? 'bg-emerald-600' : 'bg-slate-800 hover:bg-slate-700'}`}
              >
                {saveSuccess ? <Check size={14} /> : <Save size={14} />} 浏览器保存
              </button>
              <button 
                onClick={handleExportFile}
                className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 py-2 rounded-xl text-xs font-bold transition"
              >
                <Download size={14} /> 导出文件
              </button>
              <button 
                onClick={() => importInputRef.current?.click()}
                className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 py-2 rounded-xl text-xs font-bold transition col-span-2"
              >
                <Upload size={14} /> 导入存档文件 (.json)
              </button>
              <input type="file" ref={importInputRef} onChange={handleImportFile} accept=".json" className="hidden" />
            </div>
          </div>

          <div className="p-4 border-b border-slate-800 bg-slate-800/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                <MoveDown size={14} /> 全局重力场 (g=9.8)
              </span>
              <button 
                onClick={() => setState(s => ({...s, gravityEnabled: !s.gravityEnabled}))}
                className={`w-12 h-6 rounded-full transition-colors relative ${state.gravityEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${state.gravityEnabled ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">场景组件</h2>
              <div className="flex gap-1.5">
                <button onClick={() => {
                  const id = `r-${Date.now()}`;
                  setState(s => ({...s, regions: [...s.regions, {...DEFAULT_REGION, id}]}));
                  setSelectedId(id);
                }} className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg text-blue-400 transition" title="添加场区域"><Layers size={16} /></button>
                <button onClick={() => {
                  const id = `p-${Date.now()}`;
                  setState(s => ({...s, particles: [...s.particles, {
                    id, x: 0, y: 0, vx: 100, vy: 0, m: 1, q: 1, radius: 7, path: [{x:0,y:0}], color: COLORS[s.particles.length % COLORS.length]
                  }]}));
                  setSelectedId(id);
                }} className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg text-emerald-400 transition" title="添加粒子"><Crosshair size={16} /></button>
                <button onClick={() => {
                  if(!selectedId) return;
                  setState(s => ({
                    ...s, regions: s.regions.filter(r => r.id !== selectedId), particles: s.particles.filter(p => p.id !== selectedId)
                  }));
                  setSelectedId(null);
                }} className="p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-500 transition" title="删除选中"><Trash2 size={16} /></button>
              </div>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
              {state.regions.map(r => (
                <div key={r.id} onClick={() => setSelectedId(r.id)} className={`p-3 rounded-xl text-[11px] cursor-pointer flex items-center gap-3 transition ${selectedId === r.id ? 'bg-blue-600 shadow-lg' : 'bg-slate-800/40 hover:bg-slate-800'}`}>
                   <Layers size={12} className="opacity-50" /> 场区域 {r.id.slice(-4)}
                </div>
              ))}
              {state.particles.map(p => (
                <div key={p.id} onClick={() => setSelectedId(p.id)} className={`p-3 rounded-xl text-[11px] cursor-pointer flex items-center gap-3 transition ${selectedId === p.id ? 'bg-emerald-600 shadow-lg' : 'bg-slate-800/40 hover:bg-slate-800'}`}>
                   <div className="w-2.5 h-2.5 rounded-full border border-white/20 shadow-sm" style={{backgroundColor: p.color}} /> 粒子 {p.id.slice(-4)}
                </div>
              ))}
            </div>
          </div>

          {selectedObject && (
            <div className="p-4 border-t border-slate-800 bg-slate-900/50 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2">
              <h2 className="text-[10px] font-bold text-slate-500 uppercase mb-4 flex items-center gap-2">
                <Settings2 size={14} /> 属性参数
              </h2>
              <div className="space-y-4">
                {'width' in selectedObject ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-[10px] text-slate-500 block mb-1">位置 X (px)</label><input type="number" value={selectedObject.x} onChange={e => setState(s => ({...s, regions: s.regions.map(r => r.id === selectedId ? {...r, x: Number(e.target.value)}:r)}))} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs outline-none focus:border-blue-500"/></div>
                      <div><label className="text-[10px] text-slate-500 block mb-1">位置 Y (px)</label><input type="number" value={selectedObject.y} onChange={e => setState(s => ({...s, regions: s.regions.map(r => r.id === selectedId ? {...r, y: Number(e.target.value)}:r)}))} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs outline-none focus:border-blue-500"/></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-[10px] text-slate-500 block mb-1">宽度 (px)</label><input type="number" value={selectedObject.width} onChange={e => setState(s => ({...s, regions: s.regions.map(r => r.id === selectedId ? {...r, width: Number(e.target.value)}:r)}))} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs outline-none focus:border-blue-500"/></div>
                      <div><label className="text-[10px] text-slate-500 block mb-1">高度 (px)</label><input type="number" value={selectedObject.height} onChange={e => setState(s => ({...s, regions: s.regions.map(r => r.id === selectedId ? {...r, height: Number(e.target.value)}:r)}))} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs outline-none focus:border-blue-500"/></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-[10px] text-red-400 block mb-1 font-bold">电场 Ex</label><input type="number" step="0.1" value={selectedObject.ex} onChange={e => setState(s => ({...s, regions: s.regions.map(r => r.id === selectedId ? {...r, ex: Number(e.target.value)}:r)}))} className="w-full bg-slate-950 border border-red-900/50 rounded-lg p-2 text-xs text-red-400 font-mono"/></div>
                      <div><label className="text-[10px] text-red-400 block mb-1 font-bold">电场 Ey</label><input type="number" step="0.1" value={selectedObject.ey} onChange={e => setState(s => ({...s, regions: s.regions.map(r => r.id === selectedId ? {...r, ey: Number(e.target.value)}:r)}))} className="w-full bg-slate-950 border border-red-900/50 rounded-lg p-2 text-xs text-red-400 font-mono"/></div>
                    </div>
                    <div>
                      <label className="text-[10px] text-emerald-400 block mb-1 font-bold">磁场 Bz (里+为× / 外-为•)</label>
                      <input type="number" step="0.1" value={selectedObject.bz} onChange={e => setState(s => ({...s, regions: s.regions.map(r => r.id === selectedId ? {...r, bz: Number(e.target.value)}:r)}))} className="w-full bg-slate-950 border border-emerald-900/50 rounded-lg p-2 text-xs text-emerald-400 font-mono"/>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-blue-400 block mb-1 font-bold">初始 X</label>
                        <input type="number" value={selectedObject.x} onChange={e => {
                          const val = Number(e.target.value);
                          setState(s => ({
                            ...s, 
                            particles: s.particles.map(p => p.id === selectedId ? {
                              ...p, x: val, path: [{x: val, y: p.path[0].y}]
                            } : p)
                          }));
                        }} className="w-full bg-slate-950 border border-blue-900/30 rounded-lg p-2 text-xs outline-none focus:border-blue-500"/>
                      </div>
                      <div>
                        <label className="text-[10px] text-blue-400 block mb-1 font-bold">初始 Y</label>
                        <input type="number" value={selectedObject.y} onChange={e => {
                          const val = Number(e.target.value);
                          setState(s => ({
                            ...s, 
                            particles: s.particles.map(p => p.id === selectedId ? {
                              ...p, y: val, path: [{x: p.path[0].x, y: val}]
                            } : p)
                          }));
                        }} className="w-full bg-slate-950 border border-blue-900/30 rounded-lg p-2 text-xs outline-none focus:border-blue-500"/>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-[10px] text-slate-500 block mb-1">质量 (kg)</label><input type="number" min="0.01" step="0.1" value={selectedObject.m} onChange={e => setState(s => ({...s, particles: s.particles.map(p => p.id === selectedId ? {...p, m: Math.max(0.01, Number(e.target.value))}:p)}))} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs"/></div>
                      <div><label className="text-[10px] text-slate-500 block mb-1">电荷 (C)</label><input type="number" step="0.1" value={selectedObject.q} onChange={e => setState(s => ({...s, particles: s.particles.map(p => p.id === selectedId ? {...p, q: Number(e.target.value)}:p)}))} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono"/></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-[10px] text-slate-500 block mb-1">初速 Vx</label><input type="number" value={selectedObject.vx} onChange={e => setState(s => ({...s, particles: s.particles.map(p => p.id === selectedId ? {...p, vx: Number(e.target.value)}:p)}))} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono"/></div>
                      <div><label className="text-[10px] text-slate-500 block mb-1">初速 Vy</label><input type="number" value={selectedObject.vy} onChange={e => setState(s => ({...s, particles: s.particles.map(p => p.id === selectedId ? {...p, vy: Number(e.target.value)}:p)}))} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono"/></div>
                    </div>
                    <div>
                      <label className="text-[10px] text-blue-400 block mb-1 font-bold flex items-center gap-1">
                        <CircleDot size={10} /> 粒子大小 (半径)
                      </label>
                      <div className="flex items-center gap-3">
                        <input 
                          type="range" min="2" max="30" step="1" 
                          value={selectedObject.radius} 
                          onChange={e => setState(s => ({...s, particles: s.particles.map(p => p.id === selectedId ? {...p, radius: Number(e.target.value)}:p)}))} 
                          className="flex-1 accent-blue-600 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer"
                        />
                        <span className="text-[10px] font-mono w-4">{selectedObject.radius}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col relative overflow-hidden bg-[radial-gradient(circle_at_center,_#111827_0%,_#020617_100%)]">
        <div className="h-20 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-8 z-10 shadow-2xl backdrop-blur-md bg-opacity-90">
          <div className="flex items-center gap-8">
            <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shadow-inner">
              <button 
                onClick={() => setState(s => ({ ...s, isPlaying: !s.isPlaying }))} 
                className={`p-3 rounded-xl transition-all duration-300 ${state.isPlaying ? 'bg-red-500/20 text-red-500' : 'bg-blue-600 text-white shadow-lg shadow-blue-900/40 hover:scale-105 active:scale-95'}`}
              >
                {state.isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
              </button>
              <button onClick={resetParticles} className="p-3 hover:bg-slate-800 rounded-xl transition-colors text-slate-500 ml-1">
                <RotateCcw size={22} />
              </button>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">计时 (Simulation Time)</span>
              <span className="fira-code text-blue-400 text-2xl font-semibold tabular-nums tracking-tighter">{state.time.toFixed(3)}s</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
             <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">视图比例 (Zoom)</span>
                <input 
                  type="range" min="0.1" max="4" step="0.1" 
                  value={state.scale} 
                  onChange={e => setState(s => ({ ...s, scale: Number(e.target.value) }))} 
                  className="w-40 accent-blue-600 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer mt-2" 
                />
             </div>
          </div>
        </div>

        <div className="flex-1 relative">
          <canvas 
            ref={canvasRef} 
            onMouseDown={(e) => { setIsDraggingCanvas(true); setDragStart({x: e.clientX, y: e.clientY}); }}
            onMouseMove={(e) => {
              if (isDraggingCanvas) {
                const dx = e.clientX - dragStart.x;
                const dy = e.clientY - dragStart.y;
                setViewOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
                setDragStart({ x: e.clientX, y: e.clientY });
              }
            }}
            onMouseUp={() => setIsDraggingCanvas(false)}
            onMouseLeave={() => setIsDraggingCanvas(false)}
            className="w-full h-full cursor-move" 
          />
          
          {(originalImage || summary) && (
            <div className={`absolute top-6 left-6 transition-all duration-500 ease-in-out z-30 ${showFullProblem ? 'w-[400px]' : 'w-14 h-14'}`}>
              <div className="bg-slate-900/95 border border-slate-700 rounded-2xl backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden max-h-[80vh]">
                <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-800/20">
                  {showFullProblem && <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">物理题目原文</span>}
                  <button 
                    onClick={() => setShowFullProblem(!showFullProblem)} 
                    className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors ml-auto flex items-center gap-1"
                  >
                    {showFullProblem ? <X size={16} /> : <Maximize2 size={16} />}
                  </button>
                </div>
                {showFullProblem && (
                  <div className="p-4 overflow-y-auto custom-scrollbar">
                    {originalImage && (
                      <div className="mb-4">
                        <img src={originalImage} alt="题目原文" className="w-full rounded-xl border border-slate-800 shadow-lg object-contain" />
                      </div>
                    )}
                    {summary && (
                      <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 shadow-inner">
                        <h4 className="text-[9px] text-slate-600 font-bold mb-2 uppercase flex items-center gap-2"><HelpCircle size={10} /> 场景简述</h4>
                        <p className="text-sm text-slate-300 font-serif leading-relaxed italic">
                          {summary}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="absolute bottom-8 left-8 pointer-events-none space-y-3 z-30">
             {state.gravityEnabled && (
               <div className="flex items-center gap-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-4 py-2.5 rounded-2xl text-[11px] font-black animate-pulse backdrop-blur shadow-2xl">
                 <MoveDown size={14} className="animate-bounce" /> 全局重力开启 (9.8 N/kg)
               </div>
             )}
          </div>

          <div className="absolute bottom-8 right-8 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl backdrop-blur shadow-2xl text-[10px] space-y-2.5 min-w-[160px] z-30">
             <div className="flex items-center justify-between font-bold border-b border-slate-800 pb-2 mb-2">
                <span className="text-slate-500 uppercase">模拟状态</span>
                <span className="text-blue-400">ACTIVE</span>
             </div>
             <div className="flex items-center justify-between"><span className="text-slate-500">粒子总数:</span> <span className="text-white font-mono">{state.particles.length}</span></div>
             <div className="flex items-center justify-between"><span className="text-slate-500">场区域数:</span> <span className="text-white font-mono">{state.regions.length}</span></div>
             <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center gap-3"><div className="w-3 h-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" /> <span className="text-slate-400 uppercase tracking-tighter">电场 E (红色)</span></div>
                <div className="flex items-center gap-3 text-emerald-500 font-black"><span className="text-sm">×</span> <span className="text-slate-400 font-normal uppercase tracking-tighter">磁场 B (垂直向里)</span></div>
                <div className="flex items-center gap-3 text-emerald-500 font-black"><span className="text-sm">•</span> <span className="text-slate-400 font-normal uppercase tracking-tighter">磁场 B (垂直向外)</span></div>
             </div>
             <div className="pt-2 mt-1 border-t border-slate-800/50">
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 flex items-center justify-center italic text-slate-500 text-[9px]">
                  F = q(E + v × B)
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
