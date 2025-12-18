
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Image as ImageIcon, Trash2, 
  Settings2, Activity, Zap, Crosshair, Send, Layers,
  MoveDown, X, Save, Download, Video, DownloadCloud,
  Compass, Maximize, MousePointer2, Check, Target, Eraser
} from 'lucide-react';
import { FieldRegion, Particle, SimulationState, Vector2D } from './types';
import { updatePhysics } from './PhysicsEngine';
import { parseProblem } from './geminiService';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

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
  const [summary, setSummary] = useState<string | null>(null);

  // 视频录制状态
  const [recordMode, setRecordMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('physilab_v5_save');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setState(prev => ({ ...prev, ...parsed, isPlaying: false, time: 0 }));
      } catch(e) {}
    }
  }, []);

  const handleSaveLocal = () => {
    localStorage.setItem('physilab_v5_save', JSON.stringify({
      regions: state.regions, particles: state.particles, scale: state.scale, gravityEnabled: state.gravityEnabled
    }));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const startRecording = useCallback(() => {
    if (!canvasRef.current) return;
    const stream = canvasRef.current.captureStream(60);
    const types = ["video/mp4;codecs=h264", "video/webm;codecs=vp9", "video/webm"];
    const mimeType = types.find(type => MediaRecorder.isTypeSupported(type)) || "";
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setShowResultModal(true);
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  useEffect(() => {
    if (state.isPlaying) {
      if (recordMode && !isRecording) startRecording();
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
      if (isRecording) stopRecording();
    }
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [state.isPlaying, recordMode, isRecording, startRecording, stopRecording]);

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

    // 网格
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 0.5/state.scale;
    for(let i=-2000; i<=2000; i+=100) {
      ctx.beginPath(); ctx.moveTo(i, -2000); ctx.lineTo(i, 2000); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2000, i); ctx.lineTo(2000, i); ctx.stroke();
    }
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1/state.scale;
    ctx.beginPath(); ctx.moveTo(-2000, 0); ctx.lineTo(2000, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -2000); ctx.lineTo(0, 2000); ctx.stroke();

    // 场区域
    state.regions.forEach(r => {
      const isSelected = selectedId === r.id;
      ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.1)';
      ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.strokeStyle = isSelected ? '#60a5fa' : 'rgba(59, 130, 246, 0.4)';
      ctx.lineWidth = (isSelected ? 3 : 1) / state.scale;
      ctx.strokeRect(r.x, r.y, r.width, r.height);

      if (Math.abs(r.ex) > 0.01 || Math.abs(r.ey) > 0.01) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
        ctx.lineWidth = 1/state.scale;
        const spacing = 50;
        for(let x = r.x + spacing/2; x < r.x + r.width; x += spacing) {
          for(let y = r.y + spacing/2; y < r.y + r.height; y += spacing) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.atan2(r.ey, r.ex));
            ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.lineTo(6, -4); ctx.moveTo(10, 0); ctx.lineTo(6, 4); ctx.stroke();
            ctx.restore();
          }
        }
      }
      if (Math.abs(r.bz) !== 0) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.7)';
        ctx.font = `bold ${14/state.scale}px monospace`;
        ctx.textAlign = 'center';
        const spacing = 50;
        for(let x = r.x + spacing/2; x < r.x + r.width; x += spacing) {
          for(let y = r.y + spacing/2; y < r.y + r.height; y += spacing) {
            ctx.save(); ctx.translate(x, y); ctx.scale(1, -1);
            ctx.fillText(r.bz > 0 ? '×' : '•', 0, 5); ctx.restore();
          }
        }
      }
    });

    // 粒子
    state.particles.forEach(p => {
      const isSelected = selectedId === p.id;
      if (p.path.length > 1) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2/state.scale;
        ctx.beginPath(); ctx.moveTo(p.path[0].x, p.path[0].y);
        p.path.forEach(pt => ctx.lineTo(pt.x, pt.y)); ctx.stroke();
      }
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius/state.scale, 0, Math.PI*2); ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3/state.scale;
        ctx.beginPath(); ctx.arc(p.x, p.y, (p.radius+5)/state.scale, 0, Math.PI*2); ctx.stroke();
      }
    });

    ctx.restore();
  }, [state, viewOffset, selectedId]);

  const selectedObj = useMemo(() => {
    return state.regions.find(r => r.id === selectedId) || state.particles.find(p => p.id === selectedId);
  }, [state.regions, state.particles, selectedId]);

  const eFieldInfo = useMemo(() => {
    if (!selectedObj || !('ex' in selectedObj)) return { mag: 0, ang: 0 };
    const mag = Math.sqrt(selectedObj.ex ** 2 + selectedObj.ey ** 2);
    const ang = (Math.atan2(selectedObj.ey, selectedObj.ex) * 180) / Math.PI;
    return { mag: parseFloat(mag.toFixed(2)), ang: Math.round(ang < 0 ? ang + 360 : ang) };
  }, [selectedObj]);

  const updateRegion = (id: string, updates: Partial<FieldRegion>) => {
    setState(s => ({ ...s, regions: s.regions.map(r => r.id === id ? { ...r, ...updates } : r) }));
  };

  const updateParticle = (id: string, updates: Partial<Particle>) => {
    setState(s => ({
      ...s,
      particles: s.particles.map(p => {
        if (p.id === id) {
          const updated = { ...p, ...updates };
          // 如果模拟没在跑，更新位置/速度也同时更新初始值
          if (!s.isPlaying) {
            if ('x' in updates) updated.initX = updates.x!;
            if ('y' in updates) updated.initY = updates.y!;
            if ('vx' in updates) updated.initVx = updates.vx!;
            if ('vy' in updates) updated.initVy = updates.vy!;
            // 更新路径起点
            if ('x' in updates || 'y' in updates) {
                updated.path = [{ x: updated.initX, y: updated.initY }];
            }
          }
          return updated;
        }
        return p;
      })
    }));
  };

  const deleteComponent = (id: string) => {
    setState(s => ({
      ...s,
      regions: s.regions.filter(r => r.id !== id),
      particles: s.particles.filter(p => p.id !== id)
    }));
    if (selectedId === id) setSelectedId(null);
  };

  const handleAIModel = async () => {
    if (!problemText && !originalImage) return;
    setIsLoading(true);
    try {
      const res = await parseProblem(problemText, originalImage || undefined);
      if (res) {
        setSummary(res.problemDescription);
        const newRegions = res.suggestedRegions.map((r, i) => ({ 
          ...r, 
          id: `ai-region-${Date.now()}-${i}`, 
          color: 'rgba(59, 130, 246, 0.1)' 
        }));
        const newParticles = res.suggestedParticles.map((p, i) => ({ 
          ...p, 
          id: `ai-particle-${Date.now()}-${i}`,
          initX: p.x,
          initY: p.y,
          initVx: p.vx,
          initVy: p.vy,
          radius: 8, 
          path: [{x: p.x, y: p.y}], 
          color: COLORS[i % COLORS.length] 
        }));
        setState(s => ({ ...s, regions: newRegions, particles: newParticles, isPlaying: false, time: 0 }));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetSimulation = () => {
    setState(s => ({
      ...s,
      time: 0,
      isPlaying: false,
      particles: s.particles.map(p => ({
        ...p,
        x: p.initX,
        y: p.initY,
        vx: p.initVx,
        vy: p.initVy,
        path: [{ x: p.initX, y: p.initY }]
      }))
    }));
  };

  const clearWorkspace = () => {
    if (confirm("确定要清空工作区吗？所有场和粒子都将被移除。")) {
      setState(s => ({ ...s, regions: [], particles: [], time: 0, isPlaying: false }));
      setSelectedId(null);
      setSummary(null);
    }
  };

  const resetView = () => setViewOffset({ x: 0, y: 0 });

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      <aside className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col shadow-2xl z-30">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg shadow-lg">
              <Zap className="text-white fill-white" size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">PhysiLab <span className="text-blue-500">2.8</span></h1>
          </div>
          <button onClick={clearWorkspace} className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all" title="清空工作区">
            <Eraser size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
          <section className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Activity size={12}/> 题目 AI 视觉解析
            </label>
            <textarea 
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-600/50 transition h-20 outline-none resize-none placeholder:text-slate-700"
              placeholder="描述题目物理过程或上传图片..."
              value={problemText}
              onChange={e => setProblemText(e.target.value)}
            />
            {originalImage && (
              <div className="relative group rounded-xl overflow-hidden border border-slate-700 aspect-video bg-black">
                <img src={originalImage} className="w-full h-full object-contain" alt="Preview" />
                <button onClick={() => setOriginalImage(null)} className="absolute top-2 right-2 p-1.5 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={14}/>
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 py-2.5 rounded-xl text-xs font-bold border border-slate-700 transition">
                <ImageIcon size={14}/> 选图
              </button>
              <button onClick={handleAIModel} disabled={isLoading} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xl shadow-blue-900/20 transition">
                {isLoading ? '建模中...' : <><Send size={14}/> 自动建模</>}
              </button>
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => {
              const file = e.target.files?.[0]; if (!file) return;
              const reader = new FileReader(); reader.onload = () => setOriginalImage(reader.result as string); reader.readAsDataURL(file);
            }}/>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">组件管理与列表</h2>
              <div className="flex gap-1.5">
                <button onClick={() => {
                  const id = `reg-${Date.now()}`;
                  setState(s => ({...s, regions: [...s.regions, {id, x:-150, y:-150, width:300, height:300, ex:15, ey:0, bz:0, color: 'rgba(59, 130, 246, 0.1)'}]}));
                  setSelectedId(id);
                }} className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/20 transition" title="添加场区域">
                  <Layers size={14}/>
                </button>
                <button onClick={() => {
                  const id = `ptl-${Date.now()}`;
                  const newP: Particle = {
                    id, x:0, y:0, vx:80, vy:40, 
                    initX:0, initY:0, initVx:80, initVy:40,
                    m:1, q:1, radius:8, path:[{x:0,y:0}], color:COLORS[state.particles.length%COLORS.length]
                  };
                  setState(s => ({...s, particles: [...s.particles, newP]}));
                  setSelectedId(id);
                }} className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/20 transition" title="添加粒子">
                  <Crosshair size={14}/>
                </button>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
              {state.regions.length === 0 && state.particles.length === 0 && (
                <div className="py-8 text-center border border-dashed border-slate-800 rounded-2xl text-slate-600 italic text-[10px]">
                  暂无组件，点击上方按钮添加
                </div>
              )}
              {state.regions.map(r => (
                <div key={r.id} onClick={() => setSelectedId(r.id)} className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${selectedId === r.id ? 'bg-blue-600/20 border-blue-500' : 'bg-slate-800/40 border-transparent hover:border-slate-700'}`}>
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-blue-500/20 rounded-md"><Layers size={12} className="text-blue-400"/></div>
                    <span className="text-xs font-semibold">场区域 {r.id.slice(-4)}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteComponent(r.id); }} className="p-1.5 text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14}/></button>
                </div>
              ))}
              {state.particles.map(p => (
                <div key={p.id} onClick={() => setSelectedId(p.id)} className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${selectedId === p.id ? 'bg-emerald-600/20 border-emerald-500' : 'bg-slate-800/40 border-transparent hover:border-slate-700'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full border-2 border-white/20" style={{ backgroundColor: p.color }} />
                    <span className="text-xs font-semibold">粒子 {p.id.slice(-4)}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteComponent(p.id); }} className="p-1.5 text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14}/></button>
                </div>
              ))}
            </div>
          </section>

          {selectedObj && (
            <section className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-4 shadow-xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-2"><Settings2 size={12}/> 参数调节</h3>
              </div>
              {'width' in selectedObj ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[8px] text-slate-600 block px-1">宽度 W</span>
                      <input type="number" value={selectedObj.width} onChange={e => updateRegion(selectedId!, { width: Number(e.target.value) })} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs font-mono focus:border-blue-500 transition outline-none"/>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[8px] text-slate-600 block px-1">高度 H</span>
                      <input type="number" value={selectedObj.height} onChange={e => updateRegion(selectedId!, { height: Number(e.target.value) })} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs font-mono focus:border-blue-500 transition outline-none"/>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[8px] text-slate-600 block px-1">坐标 X</span>
                      <input type="number" value={selectedObj.x} onChange={e => updateRegion(selectedId!, { x: Number(e.target.value) })} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs font-mono focus:border-blue-500 transition outline-none"/>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[8px] text-slate-600 block px-1">坐标 Y</span>
                      <input type="number" value={selectedObj.y} onChange={e => updateRegion(selectedId!, { y: Number(e.target.value) })} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs font-mono focus:border-blue-500 transition outline-none"/>
                    </div>
                  </div>
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <label className="text-[9px] text-red-400 font-bold flex items-center gap-2"><Compass size={10}/> 电场 E (强度与角度)</label>
                    <div className="flex gap-2">
                      <input type="number" value={eFieldInfo.mag} onChange={e => {
                        const mag = Number(e.target.value);
                        const rad = (eFieldInfo.ang * Math.PI) / 180;
                        updateRegion(selectedId!, { ex: mag * Math.cos(rad), ey: mag * Math.sin(rad) });
                      }} className="w-1/2 bg-slate-900 border border-red-900/20 rounded-lg p-2 text-xs text-red-400 font-bold outline-none"/>
                      <input type="number" value={eFieldInfo.ang} onChange={e => {
                        const ang = Number(e.target.value);
                        const rad = (ang * Math.PI) / 180;
                        updateRegion(selectedId!, { ex: eFieldInfo.mag * Math.cos(rad), ey: eFieldInfo.mag * Math.sin(rad) });
                      }} className="w-1/2 bg-slate-900 border border-red-900/20 rounded-lg p-2 text-xs text-red-400 font-bold outline-none"/>
                    </div>
                    <input type="range" min="0" max="360" value={eFieldInfo.ang} onChange={e => {
                      const ang = Number(e.target.value);
                      const rad = (ang * Math.PI) / 180;
                      updateRegion(selectedId!, { ex: eFieldInfo.mag * Math.cos(rad), ey: eFieldInfo.mag * Math.sin(rad) });
                    }} className="w-full accent-red-500 h-1.5 bg-slate-800 rounded-full cursor-pointer"/>
                  </div>
                  <div className="space-y-2 pt-3 border-t border-slate-800">
                    <label className="text-[9px] text-emerald-400 font-bold">磁场 Bz (Tesla)</label>
                    <input type="number" value={selectedObj.bz} onChange={e => updateRegion(selectedId!, { bz: Number(e.target.value) })} className="w-full bg-slate-900 border border-emerald-900/20 rounded-lg p-2 text-xs text-emerald-400 font-bold outline-none focus:border-emerald-500 transition"/>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[8px] text-slate-600 block px-1">坐标 X</span>
                      <input type="number" value={selectedObj.x} onChange={e => updateParticle(selectedId!, { x: Number(e.target.value) })} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs font-mono focus:border-emerald-500 transition outline-none"/>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[8px] text-slate-600 block px-1">坐标 Y</span>
                      <input type="number" value={selectedObj.y} onChange={e => updateParticle(selectedId!, { y: Number(e.target.value) })} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs font-mono focus:border-emerald-500 transition outline-none"/>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-500 font-bold">质量 m (kg)</label>
                      <input type="number" value={selectedObj.m} onChange={e => updateParticle(selectedId!, { m: Math.max(0.001, Number(e.target.value)) })} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs font-mono outline-none"/>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-500 font-bold">电量 q (C)</label>
                      <input type="number" value={selectedObj.q} onChange={e => updateParticle(selectedId!, { q: Number(e.target.value) })} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs font-mono outline-none"/>
                    </div>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <label className="text-[9px] text-blue-400 font-bold">初始速度 (Vx, Vy)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" value={selectedObj.vx} onChange={e => updateParticle(selectedId!, { vx: Number(e.target.value) })} className="bg-slate-900 border border-blue-900/10 rounded-lg p-2 text-xs font-mono outline-none"/>
                      <input type="number" value={selectedObj.vy} onChange={e => updateParticle(selectedId!, { vy: Number(e.target.value) })} className="bg-slate-900 border border-blue-900/10 rounded-lg p-2 text-xs font-mono outline-none"/>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex gap-2">
          <button onClick={handleSaveLocal} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-[10px] font-bold transition">
            {saveSuccess ? <Check size={14} className="text-emerald-400"/> : <Save size={14}/>} 本地保存
          </button>
          <button onClick={() => setRecordMode(!recordMode)} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-bold transition ${recordMode ? 'bg-red-600' : 'bg-slate-800 hover:bg-slate-700'}`}>
            <Video size={14}/> {recordMode ? '录制中' : '录制'}
          </button>
        </div>
      </aside>

      <main className="flex-1 relative flex flex-col overflow-hidden">
        <div className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-900/70 backdrop-blur-xl z-20">
          <div className="flex items-center gap-6">
            <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shadow-2xl">
              <button onClick={() => setState(s=>({...s, isPlaying: !s.isPlaying}))} className={`p-2.5 rounded-xl transition ${state.isPlaying ? 'text-red-500 bg-red-500/10' : 'text-emerald-500 bg-emerald-500/10'}`}>
                {state.isPlaying ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}
              </button>
              <button onClick={resetSimulation} className="p-2.5 text-slate-400 hover:bg-slate-800 rounded-xl ml-1.5 transition" title="重置模拟">
                <RotateCcw size={20}/>
              </button>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest flex items-center gap-2">
                Sim Time {isRecording && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"/>}
              </span>
              <span className="fira-code text-blue-400 text-lg font-bold tabular-nums">{state.time.toFixed(3)}s</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6 bg-slate-950/80 px-5 py-2.5 rounded-full border border-slate-800 shadow-inner">
            <button 
              onClick={resetView} 
              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-full transition-all group"
              title="回到坐标原点"
            >
              <Target size={18} className="group-active:scale-90" />
            </button>
            <div className="h-4 w-px bg-slate-800" />
            <div className="flex items-center gap-3">
              <span className="text-[9px] text-slate-500 font-black uppercase tracking-tighter">Zoom</span>
              <input type="range" min="0.1" max="4" step="0.1" value={state.scale} onChange={e=>setState(s=>({...s, scale:Number(e.target.value)}))} className="w-28 accent-blue-600 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer hover:accent-blue-400 transition-all"/>
              <span className="fira-code text-[10px] text-blue-400 w-10 font-bold">{state.scale.toFixed(1)}x</span>
            </div>
            <div className="h-4 w-px bg-slate-800" />
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-500 font-black uppercase">Gravity</span>
              <button onClick={() => setState(s => ({...s, gravityEnabled: !s.gravityEnabled}))} className={`w-10 h-5 rounded-full relative transition ${state.gravityEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${state.gravityEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        </div>

        <canvas 
          ref={canvasRef} 
          width={window.innerWidth - 320} 
          height={window.innerHeight - 64}
          onMouseDown={e => {
            const startX = e.clientX, startY = e.clientY;
            const onMouseMove = (ev: MouseEvent) => setViewOffset(v => ({ x: v.x + (ev.clientX - startX), y: v.y + (ev.clientY - startY) }));
            const onMouseUp = () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
            window.addEventListener('mousemove', onMouseMove); window.addEventListener('mouseup', onMouseUp);
          }}
          className="cursor-move bg-[radial-gradient(circle_at_center,_#111827_0%,_#020617_100%)]"
        />

        {isLoading && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex flex-col items-center justify-center animate-in fade-in duration-300">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-blue-600/20 border-t-blue-500 rounded-full animate-spin" />
              <Zap className="absolute inset-0 m-auto text-blue-500 animate-pulse" size={30} />
            </div>
            <h2 className="mt-6 text-xl font-bold tracking-tight">AI 物理引擎正在解析题目...</h2>
          </div>
        )}

        {summary && (
          <div className="absolute top-6 left-6 w-72 bg-slate-900/90 border border-slate-700 rounded-3xl shadow-2xl backdrop-blur-2xl p-4 animate-in fade-in slide-in-from-left-4 duration-500 ring-1 ring-white/10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2"><Activity size={12}/> 解析结论</span>
              <button onClick={() => setSummary(null)} className="p-1 hover:bg-slate-800 rounded-full text-slate-500 transition"><X size={14}/></button>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-medium">{summary}</p>
          </div>
        )}

        {showResultModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-6">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
              <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900">
                <h2 className="text-xl font-bold flex items-center gap-3"><Video className="text-red-500"/> 模拟实验录像</h2>
                <button onClick={() => { setShowResultModal(false); setVideoUrl(null); }} className="p-2 hover:bg-slate-800 rounded-full transition"><X/></button>
              </div>
              <div className="p-8 space-y-6 text-center">
                {videoUrl && <video src={videoUrl} controls className="w-full rounded-2xl shadow-inner border border-slate-800 bg-black" autoPlay />}
                <div className="flex gap-4">
                  <a href={videoUrl!} download={`PhysiLab_Result_${Date.now()}.mp4`} className="flex-1 bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all">
                    <DownloadCloud size={20}/> 下载成果
                  </a>
                  <button onClick={() => setShowResultModal(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 py-4 rounded-2xl font-bold transition-all">
                    返回
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="absolute bottom-6 left-6 flex gap-3 pointer-events-none">
           <div className="bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full flex items-center gap-2 backdrop-blur-md">
              <MousePointer2 size={12} className="text-slate-500"/>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">拖拽画布移动视角</span>
           </div>
        </div>
      </main>
    </div>
  );
};

export default App;
