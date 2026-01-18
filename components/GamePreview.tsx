import React, { useEffect, useRef, useState } from 'react';
import { Play, Upload, Sliders, Check, Loader2, Trophy, Settings, Wand2, GraduationCap, Shield, Zap, Target, Infinity, AlertTriangle, FileVideo, Cpu, Camera } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

const logoUrl = new URL('../nus-surfers-logo.png', import.meta.url).href;
const dingSfxUrl = new URL('../ding.mp3', import.meta.url).href;
const bgmUrl = new URL('../bgm.mp3', import.meta.url).href;
const jumpSfxUrl = new URL('../jump.mp3', import.meta.url).href;

// --- CONSTANTS ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// World Dimensions
const LANE_WIDTH_WORLD = 120; // Internal world units for logic

// Physics
const GRAVITY = 1.2;
const JUMP_VELOCITY = 22; 
const LATERAL_SPEED = 18;
const INITIAL_GAME_SPEED = 25; 

// Dimensions (World Units)
const OBS_WIDTH = 90;
const OBS_HEIGHT_LOW = 60;      
const OBS_HEIGHT_BARRIER = 120; 
const OBS_HEIGHT_BUS = 280;     

// Game Settings
const MC_GOAL = 160;
const MCS_PER_TOKEN = 4;

// Boss Settings
const BOSS_INTERVAL_MS = 30000;
const BOSS_WARNING_MS = 3000;
// UPDATED: Boss fight duration 67 seconds
const BOSS_FIGHT_MS = 67000; 
const CLICKS_TO_WIN = 6;

type GameState = 'START' | 'PLAYING' | 'BOSS_WARNING' | 'BOSS_FIGHT' | 'GAME_OVER' | 'GRADUATED';
type ObstacleType = 'study_table' | 'student_crowd' | 'mpsh_peacock' | 'nus_shuttle' | 'mc_token' | 'su_token';

interface Player {
  x: number;
  y: number;
  z: number;
  laneIndex: number;
  targetX: number;
  yVelocity: number;
  isJumping: boolean;
  frame: number;
  invincible: boolean;
  spawnTime: number;
}

interface Obstacle {
  id: number;
  type: ObstacleType;
  laneIndex: number;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
}

interface VideoTransform {
    vpX: number;       // Vanishing Point X (pixels)
    horizonY: number;  // Vanishing Point Y (pixels)
    roadWidth: number; // Width of the 3-lane road at the bottom of the screen (pixels)
    curvature: number; // Visual curvature
    spawnDistance: number; // Z-distance where obstacles spawn
}

interface ScoreEntry {
    score: number;
    mcs: number;
    date: string;
}

// Added: Effect Interface for "Juicy" animations
interface VisualEffect {
    x: number;
    y: number;
    z: number;
    text: string;
    life: number;
    color: string;
}

export const GamePreview: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [mcs, setMcs] = useState(0);
  const [sus, setSus] = useState(0);
  
  const [videoName, setVideoName] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);
  
  // UI State
  const [showSettings, setShowSettings] = useState(false);
  const [calibrationMode, setCalibrationMode] = useState(false);
  
  // New Transform State
  const [transform, setTransform] = useState<VideoTransform>({ 
      vpX: 400, 
      horizonY: 180, 
      roadWidth: 640, 
      curvature: 0,
      spawnDistance: 4000
  });
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiSuccess, setAiSuccess] = useState(false);

  // Boss State
  const [bossHits, setBossHits] = useState(0);

  // --- CAMERA & HAND TRACKING STATE ---
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const handsRef = useRef<any>(null);
  // Replaced cameraRef usage with direct stream management
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>(0);
  const [cameraActive, setCameraActive] = useState(false);

  // Hand Motion Tracking Refs (Up-Down Cycles)
  const leftHandCycleRef = useRef({ lastY: 0.5, phase: 'IDLE' as 'IDLE' | 'MOVE_EXTREME' });
  const rightHandCycleRef = useRef({ lastY: 0.5, phase: 'IDLE' as 'IDLE' | 'MOVE_EXTREME' });
  const leftCompletedRef = useRef(false);
  const rightCompletedRef = useRef(false);
  const lastHitTimeRef = useRef(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoBaseSpeedScoreRef = useRef<number>(5); 

  const gameStateRef = useRef<GameState>('START');
  const playerRef = useRef<Player>({
    x: 0, y: 0, z: 0, laneIndex: 1, targetX: 0,
    yVelocity: 0, isJumping: false, frame: 0, invincible: false, spawnTime: 0
  });
  
  const obstaclesRef = useRef<Obstacle[]>([]);
  const frameIdRef = useRef<number>(0);
  const gameSpeedRef = useRef<number>(INITIAL_GAME_SPEED);
  const obstacleTimerRef = useRef<number>(0);
  const distanceRef = useRef<number>(0);
  const lifeLongLearningRef = useRef<boolean>(false);

  // Added: Visual Effects Ref and Sound Ref
  const effectsRef = useRef<VisualEffect[]>([]);
  const dingSoundRef = useRef<HTMLAudioElement | null>(null);
  const jumpSoundRef = useRef<HTMLAudioElement | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  // Timers
  const bossIntervalTimerRef = useRef<number>(0); 
  const bossStateTimerRef = useRef<number>(0);    

  // --- INITIALIZATION ---
  useEffect(() => {
    const saved = localStorage.getItem('nus_surfers_leaderboard');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Migration for old format without MCs
            const migrated = parsed.map((p: any) => ({...p, mcs: p.mcs ?? 0}));
            setLeaderboard(migrated);
            if (migrated.length > 0) setHighScore(migrated[0].score);
        } catch (e) { console.error("Leaderboard parse error", e); }
    } else {
        const defaults = [
            { score: 211, mcs: 20, date: '17 Jan' },
            { score: 180, mcs: 12, date: '16 Jan' },
            { score: 125, mcs: 8, date: '15 Jan' }
        ];
        setLeaderboard(defaults);
        localStorage.setItem('nus_surfers_leaderboard', JSON.stringify(defaults));
    }

    // Initialize Audio
    dingSoundRef.current = new Audio(dingSfxUrl);
    dingSoundRef.current.volume = 0.75;
    dingSoundRef.current.preload = 'auto';
    jumpSoundRef.current = new Audio(jumpSfxUrl);
    jumpSoundRef.current.volume = 0.65;
    jumpSoundRef.current.preload = 'auto';
    bgmRef.current = new Audio(bgmUrl);
    bgmRef.current.loop = true;
    bgmRef.current.volume = 0.35;
    bgmRef.current.preload = 'auto';

    const v = document.createElement('video');
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = "anonymous"; 
    videoRef.current = v;

    return () => { 
        if (v.src) URL.revokeObjectURL(v.src);
        // Ensure manual stream cleanup
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
        if (bgmRef.current) {
            bgmRef.current.pause();
        }
    };
  }, []);

  // --- HAND TRACKING CALLBACK ---
  const onResults = (results: any) => {
    if (gameStateRef.current !== 'BOSS_FIGHT') return;

    let leftHand: any = null;
    let rightHand: any = null;

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const label = results.multiHandedness[i].label;
        if (label === 'Left') leftHand = results.multiHandLandmarks[i];
        if (label === 'Right') rightHand = results.multiHandLandmarks[i];
      }
    }

    // Both hands must be detected
    if (!leftHand || !rightHand) return;

    // REDUCED THRESHOLD: Lowered from 0.08 to 0.05 to catch very fast/small movements
    const MOVE_THRESHOLD = 0.05; 

    const processHand = (landmarks: any, cycleRef: React.MutableRefObject<any>, completedRef: React.MutableRefObject<boolean>) => {
      // Use wrist (landmark 0) for Y tracking (0.0 top, 1.0 bottom)
      const currentY = landmarks[0].y;
      
      if (cycleRef.current.phase === 'IDLE') {
        // Look for significant movement up or down from last position
        if (Math.abs(currentY - cycleRef.current.lastY) > MOVE_THRESHOLD) {
          cycleRef.current.phase = 'MOVE_EXTREME';
          cycleRef.current.extremeY = currentY;
        }
      } else if (cycleRef.current.phase === 'MOVE_EXTREME') {
        // Look for return towards the original position
        const distFromExtreme = Math.abs(currentY - cycleRef.current.extremeY);
        if (distFromExtreme > MOVE_THRESHOLD) {
          completedRef.current = true;
          cycleRef.current.phase = 'IDLE';
          cycleRef.current.lastY = currentY;
        }
      }
    };

    processHand(leftHand, leftHandCycleRef, leftCompletedRef);
    processHand(rightHand, rightHandCycleRef, rightCompletedRef);

    // --- REPS DETECTION (GESTURE REPS) ---
    // If both hands completed a cycle
    if (leftCompletedRef.current && rightCompletedRef.current) {
      const now = Date.now();
      // REDUCED DEBOUNCE: Lowered from 250ms to 150ms to allow vigorous/fast reps (~6 reps/sec)
      if (now - lastHitTimeRef.current > 150) {
        setBossHits(prev => Math.min(CLICKS_TO_WIN, prev + 1));
        lastHitTimeRef.current = now;
      }
      
      // Reset logic to force clean new reps
      leftCompletedRef.current = false;
      rightCompletedRef.current = false;
      
      // Hard reset cycles to sync up for the next rep and prevent residual drift
      leftHandCycleRef.current = { lastY: leftHand[0].y, phase: 'IDLE' };
      rightHandCycleRef.current = { lastY: rightHand[0].y, phase: 'IDLE' };
    }
  };

  // --- BOSS STATE CAMERA LIFECYCLE ---
  useEffect(() => {
    let handsInstance: any = null;
    let isActive = false;

    if (gameState === 'BOSS_FIGHT') {
      // FIX 1: Explicitly reset tracking state on every boss entry
      leftHandCycleRef.current = { lastY: 0.5, phase: 'IDLE' };
      rightHandCycleRef.current = { lastY: 0.5, phase: 'IDLE' };
      leftCompletedRef.current = false;
      rightCompletedRef.current = false;
      lastHitTimeRef.current = Date.now();
      setBossHits(0); 

      // FIX 2: Create new MediaPipe Hands instance
      handsInstance = new (window as any).Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      handsInstance.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      handsInstance.onResults(onResults);
      handsRef.current = handsInstance;
      isActive = true;

      // FIX 3: Manual getUserMedia & requestAnimationFrame loop
      // This avoids the 'Camera' util assertions and provides direct control
      const startCamera = async () => {
          try {
              if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                  const stream = await navigator.mediaDevices.getUserMedia({
                      video: { width: 640, height: 480, facingMode: "user" }
                  });
                  streamRef.current = stream;
                  
                  if (webcamVideoRef.current) {
                      webcamVideoRef.current.srcObject = stream;
                      webcamVideoRef.current.onloadedmetadata = () => {
                          if (webcamVideoRef.current) {
                              webcamVideoRef.current.play().catch(e => console.warn("Play error", e));
                              setCameraActive(true);
                              processFrame();
                          }
                      };
                  }
              }
          } catch (e) {
              console.error("Camera access failed", e);
          }
      };

      const processFrame = async () => {
          if (!isActive) return;
          
          if (webcamVideoRef.current && handsRef.current) {
              const vid = webcamVideoRef.current;
              // Guard against buffer errors: ensure video has data and dimensions
              if (vid.readyState >= 2 && vid.videoWidth > 0 && vid.videoHeight > 0) {
                  try {
                      await handsRef.current.send({ image: vid });
                  } catch (e) {
                      // Suppress potential initial frame errors or WASM memory resizing issues
                      console.debug("Frame processing transient error", e);
                  }
              }
          }
          
          if (isActive) {
              requestRef.current = requestAnimationFrame(processFrame);
          }
      };

      startCamera();

    } else {
      // Immediate cleanup if not BOSS_FIGHT
      setCameraActive(false);
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
      }
      if (handsRef.current) {
          handsRef.current.close();
          handsRef.current = null;
      }
    }

    // Cleanup on unmount or re-run
    return () => {
        isActive = false;
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (handsInstance) {
            handsInstance.close();
        }
        handsRef.current = null;
        setCameraActive(false);
    };
  }, [gameState]);

  useEffect(() => {
    const bgm = bgmRef.current;
    if (!bgm) return;
    if (gameState === 'PLAYING' || gameState === 'BOSS_WARNING' || gameState === 'BOSS_FIGHT') {
        if (bgm.paused) bgm.play().catch(() => {});
    } else {
        bgm.pause();
        bgm.currentTime = 0;
    }
  }, [gameState]);

  const saveScore = (newScore: number) => {
      const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      // Use current mcs state
      const newEntry = { score: newScore, mcs: mcs, date };
      
      setLeaderboard(prev => {
          const updated = [...prev, newEntry]
            .sort((a, b) => {
                // Primary sort: MCs (descending)
                if (b.mcs !== a.mcs) return b.mcs - a.mcs;
                // Secondary sort: Score/Distance (descending)
                return b.score - a.score;
            })
            .slice(0, 5);
            
          localStorage.setItem('nus_surfers_leaderboard', JSON.stringify(updated));
          if (updated.length > 0) setHighScore(updated[0].score);
          return updated;
      });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !videoRef.current) return;
      const url = URL.createObjectURL(file);
      videoRef.current.src = url;
      videoRef.current.onloadedmetadata = () => autoAlignVideo(); 
      videoRef.current.play().catch(err => console.error("Video play failed:", err));
      setVideoName(file.name);
      videoBaseSpeedScoreRef.current = 5; 
      if (videoRef.current) videoRef.current.playbackRate = 1;
      setAiSuccess(false);
  };

  const autoAlignVideo = () => {
      // Default reset
      setTransform({
          vpX: 400,
          horizonY: 180,
          roadWidth: 640,
          curvature: 0,
          spawnDistance: 4000
      });
  };

  const runAIAnalysis = async () => {
      if (!videoRef.current || !process.env.API_KEY) {
          alert("API Key missing or video not loaded.");
          return;
      }
      setIsAnalyzing(true);
      setAiSuccess(false);

      try {
          const vid = videoRef.current;
          if (vid.readyState < 2) {
              await new Promise(r => setTimeout(r, 500));
          }

          const captureCanvas = document.createElement('canvas');
          captureCanvas.width = vid.videoWidth;
          captureCanvas.height = vid.videoHeight;
          const captureCtx = captureCanvas.getContext('2d');
          if (!captureCtx) throw new Error("Could not get context");
          
          captureCtx.drawImage(vid, 0, 0);
          const base64Image = captureCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];
          
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview', 
              contents: [
                {
                    parts: [
                        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                        { text: `You are an expert at perspective analysis for video games.
                          Analyze this image which is the background for an endless runner game.
                          
                          I need to align the game's 3-lane path with the visual path in the video.
                          
                          1. Find the Vanishing Point (VP) where the road lines converge in the distance.
                          2. Estimate the width of the runnable road path at the VERY BOTTOM of the image.

                          Return ONLY a JSON object:
                          {
                            "vp_x": number, // 0.0 (Left) to 1.0 (Right)
                            "vp_y": number, // 0.0 (Top) to 1.0 (Bottom) - The horizon line
                            "road_width": number, // 0.0 to 1.0 - Width of road at bottom relative to image width
                            "curvature": number, // -10 (Left) to 10 (Right)
                            "speed": number // 1-10 speed feel
                          }
                          Do not use markdown.` 
                        }
                    ]
                }
              ]
          });

          let cleanJson = response.text || "{}";
          const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
          if (jsonMatch) cleanJson = jsonMatch[0];
          
          let result;
          try {
             result = JSON.parse(cleanJson);
          } catch (e) {
             console.error("JSON Parse Error", cleanJson);
             result = { vp_x: 0.5, vp_y: 0.3, road_width: 0.8, curvature: 0, speed: 5 };
          }
          
          const vpX = (result.vp_x ?? 0.5) * CANVAS_WIDTH;
          const vpY = (result.vp_y ?? 0.3) * CANVAS_HEIGHT;
          const roadW = (result.road_width ?? 0.8) * CANVAS_WIDTH;
          const curve = result.curvature ?? 0;
          const speedScore = result.speed ?? 5;

          setTransform(prev => ({
              ...prev,
              vpX: vpX,
              horizonY: vpY,
              roadWidth: roadW,
              curvature: curve
          }));

          videoBaseSpeedScoreRef.current = speedScore;
          setAiSuccess(true);
          setTimeout(() => setAiSuccess(false), 3000);
          
      } catch (error) {
          console.error("AI Analysis failed:", error);
          alert("AI Analysis failed. See console.");
      } finally {
          setIsAnalyzing(false);
      }
  };

  const project = (worldX: number, worldY: number, worldZ: number) => {
    const K = 800; 
    const dist = worldZ + K;
    if (dist <= 10) return null; 
    const scale = K / dist;
    const floorY = transform.horizonY + (CANVAS_HEIGHT - transform.horizonY) * scale;
    const worldTotalWidth = 3 * LANE_WIDTH_WORLD;
    const pixelsPerWorldUnit = transform.roadWidth / worldTotalWidth;
    const sy = floorY - (worldY * pixelsPerWorldUnit * scale);
    const sx = transform.vpX + (worldX * pixelsPerWorldUnit) * scale;
    const curveOffset = (transform.curvature * (worldZ * worldZ)) / 50000;
    const MAX_VISIBILITY_Z = transform.spawnDistance + 500;
    const fadeStart = transform.spawnDistance - 1000;
    let alpha = 1;
    if (worldZ > fadeStart) {
        alpha = Math.max(0, 1 - (worldZ - fadeStart) / (MAX_VISIBILITY_Z - fadeStart));
    }
    return { x: sx + curveOffset, y: sy, scale: scale * pixelsPerWorldUnit, alpha };
  };

  const playDingSfx = () => {
    const audio = dingSoundRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  };

  const playJumpSfx = () => {
    const audio = jumpSoundRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  };

  const playBgm = (resetPosition = false) => {
    const audio = bgmRef.current;
    if (!audio) return;
    if (resetPosition) audio.currentTime = 0;
    if (audio.paused) audio.play().catch(() => {});
  };

  const resetGame = () => {
    gameStateRef.current = 'PLAYING';
    setGameState('PLAYING');
    playerRef.current = {
      x: 0, y: 0, z: 0, laneIndex: 1, targetX: 0,
      yVelocity: 0, isJumping: false, frame: 0, invincible: true, spawnTime: performance.now(),
    };
    obstaclesRef.current = [];
    effectsRef.current = []; // Clear effects on reset
    gameSpeedRef.current = INITIAL_GAME_SPEED;
    distanceRef.current = 0;
    bossIntervalTimerRef.current = 0;
    bossStateTimerRef.current = 0;
    lifeLongLearningRef.current = false;
    setScore(0);
    setMcs(0);
    setSus(0);
    setBossHits(0);
    playBgm(true);
    
    // Safety: Reset tracking refs here too in case of mid-game reset
    leftHandCycleRef.current = { lastY: 0.5, phase: 'IDLE' };
    rightHandCycleRef.current = { lastY: 0.5, phase: 'IDLE' };
    leftCompletedRef.current = false;
    rightCompletedRef.current = false;

    if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
    }
    setShowSettings(false);
    setCalibrationMode(false);
  };

  const continueLifeLongLearning = () => {
      gameStateRef.current = 'PLAYING';
      setGameState('PLAYING');
      playBgm(true);
      lifeLongLearningRef.current = true;
      if (videoRef.current) videoRef.current.play();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const gs = gameStateRef.current;

      // ADDED: Keyboard Input for Boss Fight (Simultaneous with Camera)
      if (gs === 'BOSS_FIGHT') {
          if (e.key === '6' || e.key === '7') {
              const now = Date.now();
              // Reuse debounce logic to prevent spamming/double-counting with gestures
              if (now - lastHitTimeRef.current > 150) {
                  setBossHits(prev => Math.min(CLICKS_TO_WIN, prev + 1));
                  lastHitTimeRef.current = now;
              }
          }
          return;
      }

      if (gs === 'START' || gs === 'GAME_OVER') {
        if (e.code === 'Space') resetGame();
        return;
      }
      
      if (gs === 'GRADUATED') {
          if (e.code === 'Space') resetGame();
          return;
      }

      const p = playerRef.current;
      if (e.code === 'ArrowLeft') {
        if (p.laneIndex > 0) { p.laneIndex--; p.targetX = (p.laneIndex - 1) * LANE_WIDTH_WORLD; }
      } else if (e.code === 'ArrowRight') {
        if (p.laneIndex < 2) { p.laneIndex++; p.targetX = (p.laneIndex - 1) * LANE_WIDTH_WORLD; }
      } else if (e.code === 'Space' || e.code === 'ArrowUp') {
        if (!p.isJumping) { p.isJumping = true; p.yVelocity = JUMP_VELOCITY; playJumpSfx(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let lastTime = performance.now();
    const loop = (time: number) => { 
        const dt = time - lastTime;
        lastTime = time;
        update(dt); 
        draw(ctx); 
        frameIdRef.current = requestAnimationFrame(loop); 
    };
    frameIdRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameIdRef.current);
  }, [transform, calibrationMode, bossHits, mcs, sus, cameraActive]); 

  const update = (dt: number) => {
    const currentState = gameStateRef.current;

    if (mcs >= MC_GOAL && currentState === 'PLAYING' && !lifeLongLearningRef.current) {
        gameStateRef.current = 'GRADUATED';
        setGameState('GRADUATED');
        saveScore(Math.floor(distanceRef.current / 250));
        return;
    }

    if (currentState === 'BOSS_WARNING') {
        bossStateTimerRef.current += dt;
        if (videoRef.current) videoRef.current.playbackRate = 0.1; 
        if (bossStateTimerRef.current >= BOSS_WARNING_MS) {
            gameStateRef.current = 'BOSS_FIGHT';
            setGameState('BOSS_FIGHT');
            bossStateTimerRef.current = 0;
            setBossHits(0);
        }
        return;
    }

    if (currentState === 'BOSS_FIGHT') {
        bossStateTimerRef.current += dt;
        if (videoRef.current) videoRef.current.playbackRate = 0;
        
        // --- SUCCESS CONDITION ---
        if (bossHits >= CLICKS_TO_WIN) {
            gameStateRef.current = 'PLAYING';
            setGameState('PLAYING');
            bossIntervalTimerRef.current = 0;
            obstaclesRef.current = obstaclesRef.current.filter(o => o.z > 2000); 
            if (videoRef.current) videoRef.current.playbackRate = 1;
            return;
        }

        // --- FAILURE CONDITION (67 Seconds) ---
        if (bossStateTimerRef.current >= BOSS_FIGHT_MS) {
            gameStateRef.current = 'GAME_OVER';
            setGameState('GAME_OVER');
            if (videoRef.current) videoRef.current.playbackRate = 1;
        }
        return;
    }

    if (currentState !== 'PLAYING') return;

    // Added: Update Effects Logic (Float up and fade)
    for (let i = effectsRef.current.length - 1; i >= 0; i--) {
        const fx = effectsRef.current[i];
        fx.life -= dt / 1000; // Fade out over 1 second
        fx.y -= 200 * (dt/1000); // Float up
        fx.z -= gameSpeedRef.current * 0.5; // Move slightly with world
        if (fx.life <= 0) effectsRef.current.splice(i, 1);
    }

    bossIntervalTimerRef.current += dt;
    if (bossIntervalTimerRef.current >= BOSS_INTERVAL_MS) {
        gameStateRef.current = 'BOSS_WARNING';
        setGameState('BOSS_WARNING');
        bossStateTimerRef.current = 0;
        return;
    }

    const p = playerRef.current;
    p.frame++;
    distanceRef.current += gameSpeedRef.current;
    
    const currentScore = Math.floor(distanceRef.current / 250);
    setScore(currentScore);
    
    gameSpeedRef.current = INITIAL_GAME_SPEED + (distanceRef.current * 0.0001);

    if (videoRef.current) {
        const gamePace = gameSpeedRef.current / INITIAL_GAME_SPEED;
        const targetSpeedRef = 8; 
        const detectedSpeed = Math.max(1, videoBaseSpeedScoreRef.current);
        const targetRate = (targetSpeedRef / detectedSpeed) * gamePace;
        const clampedRate = Math.max(0.25, Math.min(targetRate, 5.0));
        if (Math.abs(videoRef.current.playbackRate - clampedRate) > 0.05) {
            videoRef.current.playbackRate = clampedRate;
        }
    }

    if (p.x < p.targetX) p.x = Math.min(p.x + LATERAL_SPEED, p.targetX);
    else if (p.x > p.targetX) p.x = Math.max(p.x - LATERAL_SPEED, p.targetX);

    if (p.isJumping) {
      p.y += p.yVelocity;
      p.yVelocity -= GRAVITY;
      if (p.y <= 0) { p.y = 0; p.isJumping = false; p.yVelocity = 0; }
    }
    
    if (p.invincible && performance.now() - p.spawnTime > 1500) p.invincible = false;

    obstacleTimerRef.current++;
    const spawnThreshold = Math.max(25, 70 - Math.floor(distanceRef.current / 2000));
    
    if (obstacleTimerRef.current > spawnThreshold) {
      obstacleTimerRef.current = 0;
      const r = Math.random();
      let type: ObstacleType = 'study_table';
      let h = OBS_HEIGHT_LOW;
      let w = OBS_WIDTH;
      if (r < 0.30) { type = 'mc_token'; h = 50; } 
      else if (r < 0.33) { type = 'su_token'; h = 50; } 
      else if (r < 0.50) { type = 'study_table'; h = OBS_HEIGHT_LOW; } 
      else if (r < 0.70) { type = 'student_crowd'; h = OBS_HEIGHT_BARRIER; } 
      else if (r < 0.85) { type = 'mpsh_peacock'; h = 100; } 
      else { type = 'nus_shuttle'; h = OBS_HEIGHT_BUS; w = OBS_WIDTH * 1.3; }
      const laneIdx = Math.floor(Math.random() * 3);
      obstaclesRef.current.push({
          id: Math.random(), type, laneIndex: laneIdx,
          x: (laneIdx - 1) * LANE_WIDTH_WORLD, y: 0, z: transform.spawnDistance,
          width: w, height: h,
      });
    }

    for (let i = obstaclesRef.current.length - 1; i >= 0; i--) {
      const obs = obstaclesRef.current[i];
      let speed = gameSpeedRef.current;
      if (obs.type === 'nus_shuttle') speed += 20; 
      obs.z -= speed;
      if (obs.type === 'mpsh_peacock') obs.x += Math.sin(obs.z * 0.01) * 2;
      if (obs.z < -200) { obstaclesRef.current.splice(i, 1); continue; }
      if (obs.z < 40 && obs.z > -60) {
        if (p.x - 20 < obs.x + obs.width/2 && p.x + 20 > obs.x - obs.width/2) {
          if (obs.type === 'mc_token') { 
              setMcs(prev => prev + MCS_PER_TOKEN); 
              // Added: SFX and Effect
              playDingSfx();
              effectsRef.current.push({ x: obs.x, y: 0, z: obs.z, text: '+4 MCs', life: 1.0, color: '#4ade80' });
              obstaclesRef.current.splice(i, 1); 
              continue; 
          } 
          else if (obs.type === 'su_token') { 
              setSus(prev => prev + 1); 
              // Added: SFX and Effect
              playDingSfx();
              effectsRef.current.push({ x: obs.x, y: 0, z: obs.z, text: 'S/U SAVED', life: 1.0, color: '#c084fc' });
              obstaclesRef.current.splice(i, 1); 
              continue; 
          } 
          if (p.y < obs.height && !p.invincible) {
            if (sus > 0) { setSus(prev => prev - 1); p.invincible = true; p.spawnTime = performance.now(); } 
            else { const finalScore = Math.floor(distanceRef.current / 250); saveScore(finalScore); gameStateRef.current = 'GAME_OVER'; setGameState('GAME_OVER'); }
          }
        }
      }
    }
  };

  const drawPlayer = (ctx: CanvasRenderingContext2D, p: Player) => {
    const point = project(p.x, p.y, p.z);
    if (!point) return;
    const { x, y, scale } = point;
    const w = 45 * scale;
    const h = 90 * scale;
    const isRunning = gameStateRef.current === 'PLAYING' && !p.isJumping;
    const cSkin = '#eebb99'; const cHair = '#5D4037'; const cShirt = '#0055aa';
    const cShirtHighlight = '#0066cc'; const cCollar = '#facc15'; const cPants = '#c2b280';
    const cShoes = '#332211'; const cBackpack = '#8b5a2b'; 
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y, w/1.5, w/4, 0, 0, Math.PI * 2); ctx.fill();
    if (p.invincible) { if (Math.floor(p.frame / 5) % 2 === 0) ctx.globalAlpha = 0.5; ctx.strokeStyle = '#c084fc'; ctx.lineWidth = 3 * scale; ctx.beginPath(); ctx.arc(x, y - h/2, h * 0.7, 0, Math.PI * 2); ctx.stroke(); }
    ctx.save(); ctx.translate(x, y);
    const legW = w * 0.3; const legH = h * 0.35; const legY = -legH;
    const lLegOffset = isRunning ? Math.sin(p.frame * 0.5) * 10 * scale : 0;
    ctx.fillStyle = cPants; ctx.fillRect(-w/4 - legW/2, legY + (isRunning ? -lLegOffset : 0), legW, legH);
    ctx.fillStyle = cShoes; ctx.fillRect(-w/4 - legW/2 - 2, legY + legH + (isRunning ? -lLegOffset : 0), legW + 4, 8 * scale);
    const rLegOffset = isRunning ? Math.sin(p.frame * 0.5 + Math.PI) * 10 * scale : 0;
    ctx.fillStyle = cPants; ctx.fillRect(w/4 - legW/2, legY + (isRunning ? -rLegOffset : 0), legW, legH);
    ctx.fillStyle = cShoes; ctx.fillRect(w/4 - legW/2 - 2, legY + legH + (isRunning ? -rLegOffset : 0), legW + 4, 8 * scale);
    const bodyW = w * 0.8; const bodyH = h * 0.4; const bodyY = legY - bodyH;
    ctx.fillStyle = cBackpack; ctx.fillRect(-bodyW/1.5, bodyY + 5 * scale, bodyW * 1.3, bodyH * 0.85);
    ctx.fillStyle = '#6d4520'; ctx.fillRect(-bodyW/1.5, bodyY + bodyH * 0.4, bodyW * 1.3, 4 * scale); ctx.fillRect(-bodyW/2, bodyY + bodyH * 0.6, bodyW, bodyH * 0.2);
    ctx.fillStyle = cShirt; ctx.fillRect(-bodyW/2, bodyY, bodyW, 5*scale); ctx.fillStyle = cCollar; ctx.fillRect(-bodyW/3, bodyY - 3*scale, bodyW*0.66, 4*scale);
    const headSize = w * 0.75; const headY = bodyY - headSize;
    ctx.fillStyle = cSkin; ctx.fillRect(-headSize/4, bodyY - 4 * scale, headSize/2, 6 * scale); ctx.fillStyle = cSkin; ctx.fillRect(-headSize/2, headY, headSize, headSize);
    ctx.fillStyle = cHair; ctx.beginPath(); ctx.moveTo(-headSize/2 - 2*scale, headY - 4*scale); ctx.lineTo(headSize/2 + 2*scale, headY - 4*scale); ctx.lineTo(headSize/2 + 2*scale, headY + headSize * 0.8); ctx.lineTo(0, headY + headSize * 0.9); ctx.lineTo(-headSize/2 - 2*scale, headY + headSize * 0.8); ctx.fill();
    const armW = w * 0.2; const armH = h * 0.35;
    const lArmRot = isRunning ? Math.cos(p.frame * 0.5) * 0.5 : 0;
    ctx.save(); ctx.translate(-bodyW/2, bodyY + 5 * scale); ctx.rotate(lArmRot); ctx.fillStyle = cSkin; ctx.fillRect(-armW, 0, armW, armH); ctx.fillStyle = cShirtHighlight; ctx.fillRect(-armW, 0, armW, armH * 0.35); ctx.fillStyle = cCollar; ctx.fillRect(-armW, armH*0.3, armW, 2*scale); ctx.restore();
    const rArmRot = isRunning ? Math.cos(p.frame * 0.5 + Math.PI) * 0.5 : 0;
    ctx.save(); ctx.translate(bodyW/2, bodyY + 5 * scale); ctx.rotate(rArmRot); ctx.fillStyle = cSkin; ctx.fillRect(0, 0, armW, armH); ctx.fillStyle = cShirtHighlight; ctx.fillRect(0, 0, armW, armH * 0.35); ctx.fillStyle = cCollar; ctx.fillRect(0, armH*0.3, armW, 2*scale); ctx.restore();
    ctx.restore(); ctx.globalAlpha = 1.0;
  };

  const drawProfessor = (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, angryFrame: number) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    const cRobe = '#111'; const cSkin = '#fca5a5'; const cBeard = '#e5e7eb'; 
    ctx.fillStyle = cRobe; ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(-40, 60); ctx.lineTo(40, 60); ctx.closePath(); ctx.fill();
    const shake = Math.sin(angryFrame * 0.1) * 5;
    ctx.fillStyle = cRobe; ctx.fillRect(-50, -30 + shake, 20, 50); ctx.fillRect(30, -30 - shake, 20, 50);  
    ctx.fillStyle = cSkin; ctx.beginPath(); ctx.arc(-40, 20 + shake, 10, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(40, 20 - shake, 10, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = cSkin; ctx.fillRect(-25, -80, 50, 50); ctx.fillStyle = cBeard; ctx.beginPath(); ctx.moveTo(-25, -50); ctx.lineTo(-35, -20); ctx.lineTo(0, 10); ctx.lineTo(35, -20); ctx.lineTo(25, -50); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, -40); ctx.lineTo(-5, -35); ctx.lineTo(0, -40); ctx.lineTo(5, -35); ctx.lineTo(10, -40); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(-20, -65, 15, 10); ctx.fillRect(5, -65, 15, 10); ctx.fillStyle = '#000'; ctx.fillRect(-15, -62, 5, 5); ctx.fillRect(10, -62, 5, 5);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-25, -75); ctx.lineTo(-5, -65); ctx.stroke(); ctx.beginPath(); ctx.moveTo(25, -75); ctx.lineTo(5, -65); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(0, -85); ctx.lineTo(50, -95); ctx.lineTo(0, -105); ctx.lineTo(-50, -95); ctx.closePath(); ctx.fill(); ctx.fillRect(-25, -90, 50, 10); 
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -95); ctx.lineTo(40, -90); ctx.lineTo(40, -70); ctx.stroke(); ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(40, -70, 3, 0, Math.PI*2); ctx.fill();
    const cloudScale = 1 + Math.sin(angryFrame * 0.05) * 0.1;
    ctx.save(); ctx.translate(60, -120); ctx.scale(cloudScale, cloudScale); ctx.fillStyle = '#374151'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI*2); ctx.arc(20, 0, 15, 0, Math.PI*2); ctx.arc(-20, 0, 15, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(5, -10); ctx.lineTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(-5, 20); ctx.lineTo(0, 5); ctx.lineTo(-10, 5); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.restore();
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    if (videoRef.current && videoRef.current.readyState >= 2) {
        const vid = videoRef.current;
        ctx.save(); ctx.drawImage(vid, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        if (gameStateRef.current === 'BOSS_WARNING' || gameStateRef.current === 'BOSS_FIGHT') { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0,0,CANVAS_WIDTH, CANVAS_HEIGHT); }
        ctx.restore();
    } else {
        const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT); gradient.addColorStop(0, '#0f172a'); gradient.addColorStop(0.5, '#4c1d95'); gradient.addColorStop(1, '#be185d'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.beginPath();
        for(let i=0; i<CANVAS_WIDTH; i+=40) { ctx.moveTo(i, CANVAS_HEIGHT/2); ctx.lineTo((i - CANVAS_WIDTH/2) * 4 + CANVAS_WIDTH/2, CANVAS_HEIGHT); }
        for(let i=0; i<CANVAS_HEIGHT/2; i+=20) { const y = CANVAS_HEIGHT/2 + i; ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); }
        ctx.stroke();
    }
    const gradient = ctx.createRadialGradient(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_WIDTH/4, CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_WIDTH * 0.9); gradient.addColorStop(0, 'rgba(0,0,0,0)'); gradient.addColorStop(1, 'rgba(0,0,0,0.4)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const showLines = calibrationMode || gameStateRef.current === 'PLAYING' || !videoRef.current;
    if (showLines) {
        ctx.save(); ctx.lineWidth = calibrationMode ? 3 : 2; ctx.strokeStyle = calibrationMode ? 'rgba(0, 255, 0, 0.8)' : 'rgba(200, 230, 255, 0.25)'; 
        if (!calibrationMode) ctx.setLineDash([20, 20]);
        [-1.5, -0.5, 0.5, 1.5].forEach(laneOffset => { ctx.beginPath(); for(let z=0; z<=transform.spawnDistance; z+=100) { const p = project(laneOffset * LANE_WIDTH_WORLD, 0, z); if(p) { if (z===0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); } } ctx.stroke(); });
        ctx.restore();
        if (calibrationMode) { ctx.strokeStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(0, transform.horizonY); ctx.lineTo(CANVAS_WIDTH, transform.horizonY); ctx.stroke(); ctx.fillStyle = '#ef4444'; ctx.fillText("HORIZON", 10, transform.horizonY - 5); ctx.beginPath(); ctx.arc(transform.vpX, transform.horizonY, 5, 0, Math.PI*2); ctx.fill(); }
    }
    if (gameStateRef.current === 'PLAYING' || calibrationMode) {
        // Draw Effects (Behind player if desired, or layered with objects)
        effectsRef.current.forEach(fx => {
            const pt = project(fx.x, fx.y, fx.z);
            if (pt) {
                ctx.save();
                ctx.globalAlpha = fx.life;
                ctx.fillStyle = fx.color;
                ctx.font = `bold ${24 * pt.scale}px monospace`;
                ctx.textAlign = 'center';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2 * pt.scale;
                ctx.strokeText(fx.text, pt.x, pt.y);
                ctx.fillText(fx.text, pt.x, pt.y);
                ctx.restore();
            }
        });

        const renderList: {type: string, z: number, data: any}[] = [];
        obstaclesRef.current.forEach(o => renderList.push({type: 'obstacle', z: o.z, data: o}));
        renderList.push({type: 'player', z: playerRef.current.z, data: playerRef.current});
        renderList.sort((a, b) => b.z - a.z);
        renderList.forEach(item => {
            if (item.type === 'obstacle') { const obs = item.data as Obstacle; const point = project(obs.x, obs.y, obs.z); if (point) {
              // Added: Pulse for idle icons
              const pulse = 1 + Math.sin(Date.now() / 150) * 0.1;
              const drawPixelBus = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, scale: number) => { ctx.fillStyle = '#ea580c'; ctx.fillRect(x - w/2, y - h, w, h); ctx.fillStyle = '#c2410c'; ctx.fillRect(x - w/2, y - h, w, h * 0.1); ctx.fillStyle = '#94a3b8'; ctx.fillRect(x - w/2 + 5 * scale, y - h * 0.85, w - 10 * scale, h * 0.45); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(x - w/2 + 5 * scale, y - h * 0.85); ctx.lineTo(x, y - h * 0.85); ctx.lineTo(x - w/2 + 5 * scale, y - h * 0.6); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillRect(x - w/3, y - h * 0.95, w * 0.66, h * 0.08); ctx.fillStyle = '#fbbf24'; ctx.textAlign = 'center'; ctx.font = `bold ${8 * scale}px monospace`; ctx.fillText("NUS SHUTTLE", x, y - h * 0.89); ctx.fillStyle = '#1e3a8a'; ctx.fillRect(x - w/2 - 2*scale, y - h * 0.2, w + 4*scale, h * 0.2); ctx.fillStyle = '#fbbf24'; ctx.fillRect(x - w*0.15, y - h * 0.15, w*0.3, h*0.1); ctx.fillStyle = '#000'; ctx.font = `bold ${6 * scale}px monospace`; ctx.fillText("NUS", x, y - h * 0.08); ctx.fillStyle = '#fef08a'; ctx.fillRect(x - w/2 + 5 * scale, y - h * 0.25, 12 * scale, 10 * scale); ctx.fillRect(x + w/2 - 17 * scale, y - h * 0.25, 12 * scale, 10 * scale); ctx.fillStyle = '#111'; ctx.fillRect(x - w/2 - 10 * scale, y - h * 0.7, 8 * scale, 20 * scale); ctx.fillRect(x + w/2 + 2 * scale, y - h * 0.7, 8 * scale, 20 * scale); };
              const drawPixelTable = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, scale: number) => { ctx.fillStyle = '#855E42'; ctx.beginPath(); ctx.moveTo(x - w/2, y - h); ctx.lineTo(x + w/2, y - h); ctx.lineTo(x + w/2 + 10 * scale, y - h + 15 * scale); ctx.lineTo(x - w/2 + 10 * scale, y - h + 15 * scale); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#5C4033'; ctx.fillRect(x - w/2 + 10 * scale, y - h + 15 * scale, w, 5 * scale); ctx.fillStyle = '#4A332A'; ctx.fillRect(x - w/2 + 15 * scale, y - h + 20 * scale, 6 * scale, h - 20 * scale); ctx.fillRect(x + w/2 - 5 * scale, y - h + 20 * scale, 6 * scale, h - 20 * scale); ctx.fillStyle = '#2e7d32'; ctx.fillRect(x - 10 * scale, y - h - 5 * scale, 20 * scale, 5 * scale); ctx.fillStyle = '#fff'; ctx.fillRect(x - 8 * scale, y - h - 4 * scale, 16 * scale, 2 * scale); ctx.fillStyle = '#6a1b9a'; ctx.fillRect(x - 12 * scale, y - h - 10 * scale, 18 * scale, 5 * scale); ctx.fillStyle = '#1565c0'; ctx.fillRect(x + 25 * scale, y - h * 0.8, 20 * scale, 30 * scale); ctx.fillStyle = '#0d47a1'; ctx.fillRect(x + 23 * scale, y - h * 0.8, 2 * scale, 30 * scale); ctx.fillRect(x + 45 * scale, y - h * 0.8, 2 * scale, 30 * scale); };
              const drawPixelCrowd = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, scale: number) => { const drawStudent = (ox: number, oy: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(ox - 8 * scale, oy, 16 * scale, 20 * scale); ctx.fillStyle = '#eebb99'; ctx.fillRect(ox - 6 * scale, oy - 12 * scale, 12 * scale, 12 * scale); ctx.fillStyle = '#333'; ctx.fillRect(ox - 8 * scale, oy - 14 * scale, 16 * scale, 6 * scale); }; drawStudent(x - 15 * scale, y - h * 0.5, '#b91c1c'); drawStudent(x + 15 * scale, y - h * 0.55, '#15803d'); drawStudent(x, y - h * 0.3, '#1d4ed8'); const bx = x + 20 * scale; const by = y - h * 0.9; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(bx, by, 70 * scale, 25 * scale, 5 * scale); ctx.fill(); ctx.beginPath(); ctx.moveTo(bx + 5 * scale, by + 25 * scale); ctx.lineTo(bx + 15 * scale, by + 25 * scale); ctx.lineTo(bx, by + 35 * scale); ctx.fill(); ctx.fillStyle = '#000'; ctx.font = `bold ${8 * scale}px monospace`; ctx.fillText("So hungry...", bx + 35 * scale, by + 16 * scale); };
              const drawPixelPeacock = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, scale: number) => { for(let i=0; i<12; i++) { const angle = Math.PI + (Math.PI/13)*(i+1); const length = w * 0.6; const px = x + Math.cos(angle) * length; const py = (y - h * 0.4) + Math.sin(angle) * length; ctx.strokeStyle = '#047857'; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.moveTo(x, y - h * 0.4); ctx.lineTo(px, py); ctx.stroke(); ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(px, py, 8 * scale, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = '#1d4ed8'; ctx.beginPath(); ctx.arc(px, py, 4 * scale, 0, Math.PI*2); ctx.fill(); } ctx.fillStyle = '#1e3a8a'; ctx.beginPath(); ctx.ellipse(x, y - h * 0.3, w * 0.15, h * 0.25, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1e3a8a'; ctx.beginPath(); ctx.arc(x, y - h * 0.65, 12 * scale, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.moveTo(x, y - h * 0.65 - 10 * scale); ctx.lineTo(x, y - h * 0.65 - 20 * scale); ctx.stroke(); ctx.fillStyle = '#06b6d4'; ctx.beginPath(); ctx.arc(x, y - h * 0.65 - 22 * scale, 3 * scale, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 5 * scale, y - h * 0.68); ctx.lineTo(x - 1 * scale, y - h * 0.65); ctx.lineTo(x - 8 * scale, y - h * 0.65); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 5 * scale, y - h * 0.68); ctx.lineTo(x + 1 * scale, y - h * 0.65); ctx.lineTo(x + 8 * scale, y - h * 0.65); ctx.fill(); ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.moveTo(x, y - h * 0.62); ctx.lineTo(x - 3 * scale, y - h * 0.58); ctx.lineTo(x + 3 * scale, y - h * 0.58); ctx.fill(); };
              // Updated: Pulsing animations for tokens
              const drawMCToken = (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => { 
                  ctx.save();
                  ctx.translate(x, y); ctx.scale(pulse, pulse); ctx.translate(-x, -y);
                  const floatY = y + Math.sin(Date.now() / 200) * 10 * scale; 
                  ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 20; ctx.fillStyle = '#0284c7'; ctx.fillRect(x - 25 * scale, floatY - 20 * scale, 50 * scale, 40 * scale); ctx.fillStyle = '#fff'; ctx.fillRect(x - 22 * scale, floatY - 17 * scale, 20 * scale, 34 * scale); ctx.fillRect(x + 2 * scale, floatY - 17 * scale, 20 * scale, 34 * scale); ctx.fillStyle = '#94a3b8'; ctx.fillRect(x - 18 * scale, floatY - 10 * scale, 12 * scale, 2 * scale); ctx.fillRect(x - 18 * scale, floatY - 5 * scale, 10 * scale, 2 * scale); ctx.fillRect(x + 6 * scale, floatY - 10 * scale, 12 * scale, 2 * scale); ctx.fillRect(x + 6 * scale, floatY - 5 * scale, 10 * scale, 2 * scale); ctx.shadowBlur = 0; 
                  ctx.restore();
              };
              const drawSUToken = (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) => { 
                  ctx.save();
                  ctx.translate(x, y); ctx.scale(pulse, pulse); ctx.translate(-x, -y);
                  const floatY = y + Math.sin(Date.now() / 200) * 10 * scale; ctx.shadowColor = '#d8b4fe'; ctx.shadowBlur = 20; ctx.fillStyle = '#7e22ce'; ctx.beginPath(); ctx.moveTo(x - 20 * scale, floatY - 20 * scale); ctx.lineTo(x + 20 * scale, floatY - 20 * scale); ctx.lineTo(x + 20 * scale, floatY); ctx.quadraticCurveTo(x, floatY + 30 * scale, x - 20 * scale, floatY); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#e9d5ff'; ctx.lineWidth = 4 * scale; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `bold ${16 * scale}px monospace`; ctx.fillText("S/U", x, floatY + 5 * scale); ctx.shadowBlur = 0; 
                  ctx.restore();
              };
              const drawAsset = (ctx: CanvasRenderingContext2D, obs: Obstacle, x: number, y: number, w: number, h: number, alpha: number, scale: number) => { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y, w/2, w/6, 0, 0, Math.PI * 2); ctx.fill(); if (obs.type === 'mc_token') drawMCToken(ctx, x, y - 20 * scale, scale); else if (obs.type === 'su_token') drawSUToken(ctx, x, y - 20 * scale, scale); else if (obs.type === 'study_table') drawPixelTable(ctx, x, y, w, h, scale); else if (obs.type === 'student_crowd') drawPixelCrowd(ctx, x, y, w, h, scale); else if (obs.type === 'mpsh_peacock') drawPixelPeacock(ctx, x, y, w, h, scale); else if (obs.type === 'nus_shuttle') drawPixelBus(ctx, x, y, w, h, scale); ctx.restore(); };
              drawAsset(ctx, obs, point.x, point.y, obs.width * point.scale, obs.height * point.scale, point.alpha, point.scale); 
            } 
        }
        });
        drawPlayer(ctx, playerRef.current);
    } else if (gameStateRef.current === 'BOSS_WARNING') {
        drawPlayer(ctx, { ...playerRef.current, y: 0, isJumping: false });
        ctx.save(); ctx.textAlign = 'center'; ctx.shadowColor = 'black'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 4;
        ctx.fillStyle = '#ef4444'; ctx.font = 'bold 64px monospace'; ctx.fillText("WARNING", CANVAS_WIDTH/2, CANVAS_HEIGHT/2 - 60);
        ctx.font = 'bold 32px monospace'; ctx.fillStyle = '#fff'; ctx.fillText("PROFESSOR APPROACHING!", CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 20);
        const timeLeft = Math.ceil((BOSS_WARNING_MS - bossStateTimerRef.current) / 1000); ctx.font = 'bold 80px monospace'; ctx.fillText(timeLeft.toString(), CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 120); ctx.restore();
    } else if (gameStateRef.current === 'BOSS_FIGHT') {
        // --- WEBCAM FEED PREVIEW (SUBTLE) ---
        if (webcamVideoRef.current && cameraActive) {
            ctx.save();
            ctx.globalAlpha = 0.3;
            // Scale and draw webcam to fit a corner
            const cw = 200; const ch = 150;
            ctx.drawImage(webcamVideoRef.current, CANVAS_WIDTH - cw - 20, CANVAS_HEIGHT - ch - 20, cw, ch);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(CANVAS_WIDTH - cw - 20, CANVAS_HEIGHT - ch - 20, cw, ch);
            ctx.restore();
        }

        const p = playerRef.current;
        const playerScreen = project(0, 0, 0); if (playerScreen) drawPlayer(ctx, { ...p, x: 0, laneIndex: 1, z: 0 });
        const dropDuration = 500; const progress = Math.min(1, bossStateTimerRef.current / dropDuration); const ease = (t: number) => 1 - Math.pow(1 - t, 3);
        const startY = -400; const targetY = CANVAS_HEIGHT/2 - 50; const currentY = startY + (targetY - startY) * ease(progress);
        drawProfessor(ctx, CANVAS_WIDTH/2, currentY, 1.5, bossStateTimerRef.current);

        ctx.save();
        const barWidth = 400; const barHeight = 40; const progressWidth = Math.min(bossHits / CLICKS_TO_WIN, 1);
        ctx.translate(CANVAS_WIDTH/2 - barWidth/2, CANVAS_HEIGHT - 120);
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, barWidth, barHeight); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, barWidth, barHeight);
        ctx.fillStyle = progressWidth >= 1 ? '#22c55e' : '#eab308'; ctx.fillRect(4, 4, (barWidth - 8) * progressWidth, barHeight - 8);
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 24px monospace'; 
        // UPDATED HUD TEXT
        ctx.fillText(`DO 6 REPS!`, barWidth/2, -20);
        ctx.font = 'bold 20px monospace'; ctx.shadowColor = 'black'; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2; ctx.fillText(`${bossHits}/${CLICKS_TO_WIN} REPS`, barWidth/2, barHeight - 12);
        const msLeft = Math.max(0, BOSS_FIGHT_MS - bossStateTimerRef.current); const secondsLeft = (msLeft / 1000).toFixed(1);
        ctx.font = 'bold 48px monospace'; ctx.fillStyle = parseFloat(secondsLeft) < 10 ? '#ef4444' : '#fff'; ctx.fillText(secondsLeft + "s", barWidth/2, -60);
        ctx.restore();
    }
  };

  return (
    <div className="relative w-full h-full bg-slate-900 flex items-center justify-center font-mono selection:bg-orange-500 selection:text-white overflow-hidden">
        {/* WEBCAM VIDEO ELEMENT (HIDDEN BUT MOUNTED) - UPDATED TO FIX BUFFER ERROR */}
        <video 
            ref={webcamVideoRef} 
            className="absolute opacity-0 pointer-events-none" 
            style={{ zIndex: -1 }}
            playsInline 
            autoPlay 
            muted 
            width="640" 
            height="480"
        />

        <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute inset-0 w-full h-full object-cover z-10" />
        {(gameState === 'PLAYING' || gameState === 'BOSS_FIGHT' || gameState === 'BOSS_WARNING') && (
            <div className="absolute top-0 left-0 w-full p-4 flex justify-between z-20 pointer-events-none">
                <div className="flex gap-4">
                    <div className="bg-blue-900 border-2 border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col p-1 w-24">
                         <div className="text-[10px] text-blue-200 font-bold uppercase border-b border-blue-700 pb-1 mb-1 text-center">MCs</div>
                         <div className="flex items-center justify-center gap-2">
                             <GraduationCap className="w-4 h-4 text-white" />
                             <div className="text-xl font-black text-white leading-none">
                                 {mcs}<span className="text-[10px] text-blue-400">/{MC_GOAL}</span>
                             </div>
                         </div>
                    </div>
                    <div className="bg-purple-900 border-2 border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col p-1 w-24">
                         <div className="text-[10px] text-purple-200 font-bold uppercase border-b border-purple-700 pb-1 mb-1 text-center">S/Us</div>
                         <div className="flex items-center justify-center gap-2">
                             <Shield className="w-4 h-4 text-white" />
                             <div className="text-xl font-black text-white leading-none">
                                 {sus}
                             </div>
                         </div>
                    </div>
                </div>
                <div className="bg-gray-900 border-2 border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col p-1 w-32">
                     <div className="text-[10px] text-gray-400 font-bold uppercase border-b border-gray-700 pb-1 mb-1 text-center">Distance</div>
                     <div className="text-2xl font-black text-orange-500 leading-none text-center tabular-nums">
                         {score}m
                     </div>
                </div>
            </div>
        )}
        {(gameState === 'START' || gameState === 'GAME_OVER' || gameState === 'GRADUATED') && (
            <div className="absolute z-20 w-[95%] max-w-md bg-slate-900 border-4 border-white p-5 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.8)] text-center scale-95 sm:scale-100 origin-center">
                <div className="absolute top-2 right-2 text-[10px] text-gray-500 font-bold">v0.71 (MOTION)</div>
                <div className="flex flex-col items-center gap-2 mb-4">
                    <div className="relative w-full flex justify-center">
                        <div className="absolute inset-6 bg-gradient-to-b from-yellow-400/30 via-orange-500/20 to-purple-500/10 blur-3xl opacity-80 pointer-events-none"></div>
                        <img src={logoUrl} alt="NUS Surfers logo" className="relative z-10 w-full max-w-[360px] drop-shadow-[0_10px_0_rgba(0,0,0,0.8)] mix-blend-screen pointer-events-none select-none" />
                    </div>
                    <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-orange-400 to-red-600 tracking-tighter drop-shadow-[3px_3px_0_rgba(0,0,0,1)] transform -skew-x-6">NUS SURFERS</h1>
                </div>
                
                {gameState === 'GRADUATED' && (
                    <div className="mb-4 bg-blue-950 border-4 border-blue-400 p-4 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-blue-900/20 animate-pulse pointer-events-none"></div>
                        <div className="flex justify-center mb-2 relative z-10"><GraduationCap className="w-12 h-12 text-yellow-400 drop-shadow-[2px_2px_0_rgba(0,0,0,1)]" /></div>
                        <h2 className="text-yellow-400 font-black text-2xl tracking-tight mb-1 uppercase drop-shadow-md">CONVOCATION!</h2>
                        <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest mb-2">First Class Honours Achieved</p>
                        <div className="text-3xl font-black text-white tabular-nums border-t-2 border-dashed border-blue-400/50 pt-2 mt-2 mb-4">{score}m</div>
                        <div className="flex flex-col gap-2 relative z-10">
                            <button onClick={continueLifeLongLearning} className="w-full bg-blue-600 text-white font-black py-2 text-md border-2 border-white shadow-[2px_2px_0_0_rgba(0,0,0,1)] hover:shadow-[1px_1px_0_0_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all flex items-center justify-center gap-2"><Infinity className="w-5 h-5" /><span>LIFE LONG LEARNING</span></button>
                            <button onClick={resetGame} className="text-[10px] text-blue-300 font-bold uppercase hover:text-white mt-1 hover:underline">Return to Matriculation</button>
                        </div>
                    </div>
                )}
                {gameState === 'GAME_OVER' && (
                     mcs >= MC_GOAL ? (
                        // GRADUATED / LEGACY DEATH SCREEN
                        <div className="mb-4 bg-blue-950 border-4 border-blue-600 p-4 relative">
                            <div className="absolute -top-3 -left-3 bg-blue-600 text-white font-bold px-2 py-0.5 transform -rotate-6 border-2 border-white text-[10px]">HONOURS</div>
                            <h2 className="text-blue-400 font-black uppercase text-xl tracking-widest mb-1 drop-shadow-sm">ACADEMIC LEGACY</h2>
                            <div className="text-4xl font-black text-white tabular-nums tracking-tight my-2">{score}m</div>
                            <div className="flex justify-center gap-4 text-[10px] font-bold uppercase text-blue-300 border-t border-blue-800 pt-2">
                                <div className="flex flex-col"><span>MCs Cleared</span><span className="text-white text-md">{mcs}/{MC_GOAL}</span></div>
                                <div className="w-px bg-blue-800"></div>
                                <div className="flex flex-col"><span>Status</span><span className="text-white text-md">GRADUATED</span></div>
                            </div>
                            {score >= highScore && score > 0 && <div className="absolute -right-2 -bottom-2 px-2 py-0.5 bg-yellow-500 text-black border-2 border-white shadow-[2px_2px_0_0_rgba(0,0,0,1)] transform rotate-3"><span className="text-[10px] font-bold flex items-center gap-1 uppercase"><Trophy className="w-3 h-3" /> New Best!</span></div>}
                        </div>
                     ) : (
                        // STANDARD DEATH SCREEN
                        <div className="mb-4 bg-red-950 border-4 border-red-600 p-4 relative">
                            <div className="absolute -top-3 -left-3 bg-red-600 text-white font-bold px-2 py-0.5 transform -rotate-6 border-2 border-white text-[10px]">WARNING</div>
                            <h2 className="text-red-500 font-black uppercase text-xl tracking-widest mb-1 drop-shadow-sm">ACADEMIC PROBATION</h2>
                            <div className="text-4xl font-black text-white tabular-nums tracking-tight my-2">{score}m</div>
                            <div className="flex justify-center gap-4 text-[10px] font-bold uppercase text-red-300 border-t border-red-800 pt-2">
                                <div className="flex flex-col"><span>MCs Cleared</span><span className="text-white text-md">{mcs}/{MC_GOAL}</span></div>
                                <div className="w-px bg-red-800"></div>
                                <div className="flex flex-col"><span>Status</span><span className="text-white text-md">RETAINED</span></div>
                            </div>
                            {score >= highScore && score > 0 && <div className="absolute -right-2 -bottom-2 px-2 py-0.5 bg-yellow-500 text-black border-2 border-white shadow-[2px_2px_0_0_rgba(0,0,0,1)] transform rotate-3"><span className="text-[10px] font-bold flex items-center gap-1 uppercase"><Trophy className="w-3 h-3" /> New Best!</span></div>}
                        </div>
                     )
                )}
                <div className="flex gap-3 mb-4">
                    <label className="flex-1 cursor-pointer bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 hover:border-white transition-all p-2 flex flex-col items-center justify-center gap-1 group active:bg-slate-900 relative">
                        <FileVideo className="w-5 h-5 text-slate-400 group-hover:text-white" />
                        <span className="text-[10px] font-bold text-slate-400 group-hover:text-white uppercase tracking-wider leading-tight">{videoName ? 'Change' : 'Upload Lecture'}</span>
                        <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
                    </label>
                    <button onClick={runAIAnalysis} disabled={!videoName || isAnalyzing || aiSuccess} className="flex-1 bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 hover:border-purple-400 disabled:opacity-50 disabled:cursor-not-allowed p-2 flex flex-col items-center justify-center gap-1 group transition-all active:bg-slate-900 relative">
                        {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin text-purple-400"/> : aiSuccess ? <Check className="w-5 h-5 text-green-400" /> : <Cpu className="w-5 h-5 text-slate-400 group-hover:text-purple-400" />}
                        <span className={`text-[10px] font-bold uppercase tracking-wider leading-tight ${aiSuccess ? 'text-green-400' : 'text-slate-400 group-hover:text-white'}`}>{isAnalyzing ? 'Calibrating...' : aiSuccess ? 'Tuned!' : 'AI Tuning'}</span>
                    </button>
                </div>
                {videoName && <div className="mb-4 text-[10px] text-green-400 font-bold uppercase flex items-center justify-center gap-2 bg-green-900/20 py-0.5 px-3 border border-green-800 inline-block rounded-full"><Check className="w-3 h-3" /><span>Source: {videoName}</span></div>}
                {gameState !== 'GRADUATED' && (
                    <button onClick={resetGame} className="w-full bg-orange-600 text-white font-black py-3 text-xl border-2 border-white shadow-[4px_4px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all flex items-center justify-center gap-3 relative overflow-hidden">
                        <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity"></div>
                        <Play className="w-6 h-6 fill-current" />
                        <span>{gameState === 'START' ? 'MATRICULATE' : 'RETAKE MODULE'}</span>
                    </button>
                )}
                <div className="mt-6 relative">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black px-3 py-0.5 text-[10px] font-bold border-2 border-black transform -rotate-1 shadow-[2px_2px_0_0_rgba(0,0,0,0.5)] z-10">DEAN'S LIST</div>
                    <div className="bg-slate-800 border-2 border-slate-600 p-3 pt-5 shadow-inner text-left">
                        <div className="space-y-1">
                            {leaderboard.map((entry, idx) => (
                                 <div key={idx} className={`flex justify-between items-center p-1.5 border-b border-dashed ${idx === 0 ? 'bg-yellow-900/20 border-yellow-600/50' : 'bg-transparent border-slate-700'}`}>
                                    <div className="flex items-center gap-2">
                                        <span className={`flex items-center justify-center w-5 h-5 text-[10px] font-bold border shadow-[1px_1px_0_0_rgba(0,0,0,1)] ${idx === 0 ? 'bg-yellow-500 text-black border-white' : 'bg-slate-700 text-slate-400 border-slate-500'}`}>#{idx + 1}</span>
                                        <div className="flex flex-col leading-none">
                                            <span className={`font-bold font-mono text-[10px] ${idx === 0 ? 'text-yellow-500' : 'text-slate-400'}`}>{entry.mcs} MCs</span>
                                            <span className="text-[10px] text-slate-500">{entry.score}m</span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">{entry.date}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}
        {(videoName || gameState === 'PLAYING') && (
            <div className="absolute top-6 right-6 z-20 flex gap-2 pointer-events-auto">
                 <button onClick={() => { setCalibrationMode(!calibrationMode); setShowSettings(!showSettings); }} className={`p-2 border-2 transition-all active:translate-y-1 shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:shadow-[2px_2px_0_0_rgba(0,0,0,1)] hover:translate-y-[2px] ${calibrationMode ? 'bg-yellow-500 text-black border-white' : 'bg-slate-800 text-slate-400 border-white hover:text-white'}`}><Settings className="w-6 h-6" /></button>
            </div>
        )}
        {calibrationMode && (
             <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border-4 border-white p-4 w-[360px] z-30 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex items-center justify-between border-b-2 border-slate-700 pb-2 mb-4"><span className="text-yellow-500 font-bold text-sm uppercase flex items-center gap-2"><Sliders className="w-4 h-4" /> Perspective Cal.</span><button onClick={() => setCalibrationMode(false)} className="text-red-400 hover:text-red-300 font-bold text-xs uppercase border border-red-900 bg-red-900/20 px-2 py-0.5">CLOSE [X]</button></div>
                <div className="space-y-4">
                    <div className="space-y-1"><div className="flex justify-between text-xs font-bold text-slate-400 uppercase"><span>Horizon Y</span><span>{transform.horizonY.toFixed(0)}px</span></div><input type="range" min="0" max={CANVAS_HEIGHT} step="5" value={transform.horizonY} onChange={(e) => setTransform(p => ({ ...p, horizonY: parseFloat(e.target.value) }))} className="w-full h-2 bg-slate-700 appearance-none cursor-pointer accent-cyan-400 rounded-none border border-slate-600" /></div>
                    <div className="space-y-1"><div className="flex justify-between text-xs font-bold text-slate-400 uppercase"><span>Road Width</span><span>{transform.roadWidth.toFixed(0)}px</span></div><input type="range" min="200" max={CANVAS_WIDTH * 1.5} step="10" value={transform.roadWidth} onChange={(e) => setTransform(p => ({ ...p, roadWidth: parseFloat(e.target.value) }))} className="w-full h-2 bg-slate-700 appearance-none cursor-pointer accent-pink-400 rounded-none border border-slate-600" /></div>
                    <div className="space-y-1"><div className="flex justify-between text-xs font-bold text-slate-400 uppercase"><span>Vanishing Point X</span><span>{transform.vpX.toFixed(0)}px</span></div><input type="range" min="0" max={CANVAS_WIDTH} step="10" value={transform.vpX} onChange={(e) => setTransform(p => ({ ...p, vpX: parseFloat(e.target.value) }))} className="w-full h-2 bg-slate-700 appearance-none cursor-pointer accent-yellow-500 rounded-none border border-slate-600" /></div>
                    <div className="space-y-1"><div className="flex justify-between text-xs font-bold text-slate-400 uppercase"><span>Spawn Distance</span><span>{transform.spawnDistance.toFixed(0)}</span></div><input type="range" min="1000" max="10000" step="100" value={transform.spawnDistance} onChange={(e) => setTransform(p => ({ ...p, spawnDistance: parseFloat(e.target.value) }))} className="w-full h-2 bg-slate-700 appearance-none cursor-pointer accent-orange-500 rounded-none border border-slate-600" /></div>
                    <div className="space-y-1"><div className="flex justify-between text-xs font-bold text-slate-400 uppercase"><span>Curvature</span><span>{transform.curvature}</span></div><input type="range" min="-50" max="50" step="1" value={transform.curvature} onChange={(e) => setTransform(p => ({ ...p, curvature: parseFloat(e.target.value) }))} className="w-full h-2 bg-slate-700 appearance-none cursor-pointer accent-green-500 rounded-none border border-slate-600" /></div>
                    <button onClick={autoAlignVideo} className="w-full py-2 bg-blue-900 border-2 border-blue-500 hover:bg-blue-800 text-xs font-bold text-white uppercase mt-2 shadow-[2px_2px_0_0_#000] active:shadow-none active:translate-y-[2px]">Reset Defaults</button>
                </div>
            </div>
        )}
    </div>
  );
};
