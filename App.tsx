
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Image as ImageIcon, Trash2, 
  Settings2, Activity, Zap, Crosshair, Send, Layers,
  MoveDown, X, Maximize2, HelpCircle, CircleDot, Save, 
  FolderOpen, Download, Upload, Check, Info, Terminal, Key, Video, VideoOff, Share2
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

  // 视频录制相关状态
  const [isRecordingEnabled, setIsRecordingEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Load initial state from LocalStorage if exists
  useEffect(() => {
    const saved = localStorage.getItem('physilab_save');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.regions && parsed.particles) {
          setState({ ...parsed, isPlaying: false, time: 0 });
        }
      } catch (e) {
        console.error("Failed to load local save", e);
      }
    }
  }, []);

  // 保存到本地
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

  // 视频录制逻辑
  const startRecording = useCallback(() => {
    if (!canvasRef.current) return;
    recordedChunksRef.current = [];
    const stream = canvasRef.current.captureStream(60); // 60 FPS
    
    // 优先使用 MP4，如果不支持则退回 WebM
    const options = MediaRecorder.isTypeSupported('video/mp4;codecs=h264') 
      ? { mimeType: 'video/mp4;codecs=h264' } 
      : { mimeType: 'video/webm;codecs=vp9' };

    try {
      const recorder = new MediaRecorder(stream, options);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: options.mimeType });
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
        setShowResultModal(true); // 录制结束展示成果
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("MediaRecorder start failed:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  // 物理模拟循环
  useEffect(() => {
    if (state.isPlaying) {
      // 如果启用了录制模式，开始录制
      if (isRecordingEnabled && !isRecording) {
        startRecording();
      }

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
      // 停止模拟时停止录制
      if (isRecording) {
        stopRecording();
      }
    }
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [state.isPlaying, isRecordingEnabled, isRecording, startRecording, stopRecording]);

  // 画布渲染逻辑
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

    // 绘制网格
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

    // 绘制轴线
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1 / state.scale;
    ctx.beginPath(); ctx.moveTo(-limit, 0); ctx.lineTo(limit, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -limit); ctx.lineTo(0, limit); ctx.stroke();

    // 绘制场区域
    state.regions.forEach(r => {
      ctx.fillStyle = r.color;
      ctx.fillRect(r.x, r.y, r.width, r.height);
      if (selectedId === r.id) {
        ctx.strokeStyle = '#fff'; 
        ctx.lineWidth = 2 / state.scale; 
        ctx.strokeRect(r.x, r.y, r.width, r.height);
      }
      
      // 绘制电场箭头
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
      // 绘制磁场符号
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

    // 绘制粒子
    state.particles.forEach(p => {
      // 绘制轨迹
      if (p.path.length > 1) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 / state.scale;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p.path[0].x, p.path[0].y);
        p.path.forEach(pt => ctx.lineTo(pt.x, pt.y));
        ctx.stroke();
      }

      // 绘制粒子实体
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius / state.scale, 0, Math.PI * 2); ctx.fill();
      
      // 绘制电性符号
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
    const file =