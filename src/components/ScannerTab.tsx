import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Download,
  Eye,
  ImagePlus,
  Loader2,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  Zap,
  ZapOff,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  BubbleReading,
  Exam,
  GradedPaper,
  Part1Choice,
  ScanDisplayMode,
  ScanSettings,
  Student,
} from '../types';
import { TDict } from '../i18n/translations';
import {
  DetectedCorners,
  GuideBoxNorm,
  LiveCornerStatus,
  detectLiveCornersInGuide,
  gradeBubbleReading,
  isValidCornerQuad,
  scanOMRSheet,
} from '../omr/omrEngine';
import { renderSheetToCanvas } from '../omr/sheetRenderer';
import { getLayoutForExam } from '../omr/sheetTemplate';

interface ScannerTabProps {
  t: TDict;
  exams: Exam[];
  exam: Exam | null;
  onSelectExam: (id: string) => void;
  students: Student[];
  papers: GradedPaper[];
  scanSettings: ScanSettings;
  onUpdateScanSettings: (s: ScanSettings) => void;
  onSavePaper: (paper: GradedPaper) => Promise<void>;
  onDeletePaper: (id: string) => Promise<void>;
}

interface DuplicatePrompt {
  existing: GradedPaper;
  incoming: GradedPaper;
}

export const ScannerTab: React.FC<ScannerTabProps> = ({
  t,
  exams,
  exam,
  onSelectExam,
  students,
  papers,
  scanSettings,
  onUpdateScanSettings,
  onSavePaper,
  onDeletePaper,
}) => {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Trạng thái 4 ô vuông định vị thời gian thực trên Camera
  const [liveCorners, setLiveCorners] = useState<LiveCornerStatus>({
    tl: null,
    tr: null,
    br: null,
    bl: null,
    foundCount: 0,
  });
  const [cameraBanner, setCameraBanner] = useState<{
    type: 'error' | 'warning' | 'success';
    text: string;
  } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [antiGlareOn, setAntiGlareOn] = useState(true); // Tự động hạ phơi sáng chống chói khi ánh sáng mạnh
  const [exposureSupported, setExposureSupported] = useState(false);
  const [cooldownLeftMs, setCooldownLeftMs] = useState(0);

  // Thẻ nổi hiển thị nhanh kết quả (1s..5s)
  const [flashPaper, setFlashPaper] = useState<GradedPaper | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const cameraBannerTimerRef = useRef<number | null>(null);

  // Xử lý trùng SBD khi chấm lại
  const [dupPrompt, setDupPrompt] = useState<DuplicatePrompt | null>(null);

  // Modal xem chi tiết + Zoom ảnh
  const [selectedPaper, setSelectedPaper] = useState<GradedPaper | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [editSbd, setEditSbd] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editEssay, setEditEssay] = useState('0');

  const videoRef = useRef<HTMLVideoElement>(null);
  const guideBoxRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isCapturingRef = useRef(false);
  const stableLockCountRef = useRef(0);
  const prevCornersRef = useRef<DetectedCorners | null>(null);
  const cooldownUntilRef = useRef(0);
  const partialSightStartRef = useRef<number | null>(null);

  const showCameraBanner = (type: 'error' | 'warning' | 'success', text: string, ms = 3200) => {
    if (cameraBannerTimerRef.current) window.clearTimeout(cameraBannerTimerRef.current);
    setCameraBanner({ type, text });
    cameraBannerTimerRef.current = window.setTimeout(() => {
      setCameraBanner(null);
    }, ms);
  };

  /** Phát âm thanh bíp nhẹ khi chấm xong hoặc cảnh báo */
  const playBeep = (freq = 880, durationMs = 95) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.14;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close().catch(() => {});
      }, durationMs);
    } catch {
      // ignore audio error
    }
  };

  // Theo dõi cử chỉ vuốt từ trái sang phải để quay lại
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEndBack = (onBack: () => void) => (e: React.TouchEvent) => {
    if (!swipeStartRef.current || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
    const dy = Math.abs(e.changedTouches[0].clientY - swipeStartRef.current.y);
    const startX = swipeStartRef.current.x;
    swipeStartRef.current = null;
    // Vuốt từ trái sang phải (khi không đang zoom > 1)
    if (dx > 85 && dy < 70 && startX < 180) {
      onBack();
    }
  };

  const triggerFlashResult = (paper: GradedPaper, fromCamera = false) => {
    if (fromCamera && !scanSettings.showResultOnCamera) return;
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    setFlashPaper(paper);
    flashTimerRef.current = window.setTimeout(() => {
      setFlashPaper(null);
    }, scanSettings.displaySeconds * 1000);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
    setCameraOpen(false);
    setCameraBanner(null);
    setLiveCorners({ tl: null, tr: null, br: null, bl: null, foundCount: 0 });
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      if (cameraBannerTimerRef.current) window.clearTimeout(cameraBannerTimerRef.current);
    };
  }, []);

  /** Quy đổi tọa độ khung ngắm 4 ô vuông trên màn hình sang tọa độ chuẩn hóa [0..1] của khung hình video gốc (có tính object-cover) */
  const computeGuideBoxOnVideo = (): GuideBoxNorm => {
    const video = videoRef.current;
    const guide = guideBoxRef.current;
    if (!video || !guide || !video.videoWidth || !video.videoHeight) {
      return { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
    }
    const vRect = video.getBoundingClientRect();
    const gRect = guide.getBoundingClientRect();

    const vidRatio = video.videoWidth / video.videoHeight;
    const elRatio = vRect.width / vRect.height;

    let renderedW = vRect.width;
    let renderedH = vRect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (vidRatio > elRatio) {
      // Video rộng hơn phần tử -> bị cắt 2 bên trái/phải
      renderedH = vRect.height;
      renderedW = vRect.height * vidRatio;
      offsetX = (renderedW - vRect.width) / 2;
    } else {
      // Video cao hơn phần tử -> bị cắt trên/dưới
      renderedW = vRect.width;
      renderedH = vRect.width / vidRatio;
      offsetY = (renderedH - vRect.height) / 2;
    }

    const x = Math.max(0, Math.min(1, (gRect.left - vRect.left + offsetX) / renderedW));
    const y = Math.max(0, Math.min(1, (gRect.top - vRect.top + offsetY) / renderedH));
    const w = Math.max(0.1, Math.min(1 - x, gRect.width / renderedW));
    const h = Math.max(0.1, Math.min(1 - y, gRect.height / renderedH));
    return { x, y, w, h };
  };

  /**
   * Vòng lặp quét thời gian thực (Real-time 4-Corner Strict Auto Lock & Auto Grade):
   * - Kiểm tra 4 ô vuông mỗi 160ms trên ảnh thu nhỏ (~520px).
   * - CHỈ chấm khi bắt ĐỦ 4/4 chấm đen + đúng tỷ lệ hình học phiếu A4 + giữ ổn định 3 khung hình liên tiếp.
   * - Nếu chưa đưa camera vào phiếu (0/4 góc) -> TUYỆT ĐỐI không bật thông báo lỗi.
   * - Chỉ nhắc nhẹ nếu đang thấy 1–3 chấm đen kéo dài quá 7 giây mà vẫn thiếu góc.
   */
  useEffect(() => {
    if (!cameraOpen || !exam || dupPrompt) return;

    const layout = getLayoutForExam(exam.templateType || 'bgd1239', exam.customSheet);
    const probeCanvas = document.createElement('canvas');
    const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true })!;
    partialSightStartRef.current = null;
    stableLockCountRef.current = 0;
    prevCornersRef.current = null;

    const partialTimeoutMs = Math.max(7000, Math.round(scanSettings.scanSpeedSeconds * 4500));

    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

      const now = Date.now();
      const remain = Math.max(0, cooldownUntilRef.current - now);
      setCooldownLeftMs(remain);
      if (remain > 0 || isCapturingRef.current) return;

      const probeMax = 520;
      const pScale = Math.min(1, probeMax / Math.max(video.videoWidth, video.videoHeight));
      probeCanvas.width = Math.round(video.videoWidth * pScale);
      probeCanvas.height = Math.round(video.videoHeight * pScale);
      probeCtx.drawImage(video, 0, 0, probeCanvas.width, probeCanvas.height);

      const guideNorm = computeGuideBoxOnVideo();
      const probeData = probeCtx.getImageData(0, 0, probeCanvas.width, probeCanvas.height);
      const status = detectLiveCornersInGuide(probeData, guideNorm, layout);

      // Kiểm tra chặt chẽ: đủ 4/4 góc VÀ đúng tỷ lệ hình học phiếu A4
      const candidateQuad: DetectedCorners | null =
        status.foundCount === 4 && status.tl && status.tr && status.br && status.bl
          ? { tl: status.tl, tr: status.tr, br: status.br, bl: status.bl }
          : null;

      const isQuadValid = candidateQuad ? isValidCornerQuad(candidateQuad) : false;
      setLiveCorners(status);

      if (candidateQuad && isQuadValid) {
        partialSightStartRef.current = null;

        // Kiểm tra ổn định tọa độ giữa các khung hình (chống rung tay)
        const prev = prevCornersRef.current;
        const isStable =
          prev &&
          Math.hypot(candidateQuad.tl.x - prev.tl.x, candidateQuad.tl.y - prev.tl.y) < 14 &&
          Math.hypot(candidateQuad.tr.x - prev.tr.x, candidateQuad.tr.y - prev.tr.y) < 14 &&
          Math.hypot(candidateQuad.br.x - prev.br.x, candidateQuad.br.y - prev.br.y) < 14 &&
          Math.hypot(candidateQuad.bl.x - prev.bl.x, candidateQuad.bl.y - prev.bl.y) < 14;

        prevCornersRef.current = candidateQuad;
        stableLockCountRef.current = isStable ? stableLockCountRef.current + 1 : 1;

        // Giữ ổn định 3 khung hình liên tiếp (~450ms) -> mới tự động chụp full-res & chấm!
        if (stableLockCountRef.current >= 3) {
          stableLockCountRef.current = 0;
          prevCornersRef.current = null;
          const fullCorners: DetectedCorners = {
            tl: { x: candidateQuad.tl.x / pScale, y: candidateQuad.tl.y / pScale },
            tr: { x: candidateQuad.tr.x / pScale, y: candidateQuad.tr.y / pScale },
            br: { x: candidateQuad.br.x / pScale, y: candidateQuad.br.y / pScale },
            bl: { x: candidateQuad.bl.x / pScale, y: candidateQuad.bl.y / pScale },
          };
          await handleAutoCaptureLockedCorners(fullCorners);
        }
      } else {
        stableLockCountRef.current = 0;
        prevCornersRef.current = null;

        if (status.foundCount === 0) {
          // Chưa đưa camera tới phiếu -> KHÔNG đếm lỗi, KHÔNG báo lỗi!
          partialSightStartRef.current = null;
        } else {
          // Đã thấy 1..3 chấm đen -> bắt đầu đếm nếu giữ quá lâu vẫn thiếu góc
          if (partialSightStartRef.current === null) {
            partialSightStartRef.current = now;
          } else if (now - partialSightStartRef.current >= partialTimeoutMs) {
            partialSightStartRef.current = now;
            showCameraBanner('warning', `${t.camTimeoutMsg} (${status.foundCount}/4)`, 3000);
          }
        }
      }
    }, 160);

    return () => {
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen, exam?.id, dupPrompt, scanSettings.scanSpeedSeconds, t]);

  const applyCameraExposure = async (track: MediaStreamTrack, darken: boolean) => {
    try {
      const caps = track.getCapabilities?.() as
        | { exposureCompensation?: { min: number; max: number; step?: number } }
        | undefined;
      if (!caps?.exposureCompensation) return;
      const { min, max } = caps.exposureCompensation;
      const target = darken ? Math.max(min, -1.0) : Math.min(max, Math.max(min, 0));
      await track.applyConstraints({
        advanced: [{ exposureCompensation: target } as MediaTrackConstraintSet],
      });
    } catch {
      // ignore if browser/device doesn't support exposureCompensation
    }
  };

  const toggleAntiGlare = async () => {
    const next = !antiGlareOn;
    setAntiGlareOn(next);
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) await applyCameraExposure(track, next);
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      showCameraBanner('warning', 'Thiết bị không hỗ trợ bật đèn Flash trên trình duyệt.', 2500);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    setCameraBanner(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as Record<string, unknown> | undefined;
      setTorchSupported(Boolean(caps && 'torch' in caps));
      const hasExp = Boolean(caps && 'exposureCompensation' in caps);
      setExposureSupported(hasExp);
      if (hasExp && antiGlareOn) {
        applyCameraExposure(track, true);
      }

      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch {
      setCameraError(
        'Không thể mở camera trực tiếp (cần HTTPS hoặc chưa cấp quyền camera). Thầy vẫn có thể dùng nút "Chọn ảnh / Chụp" hoặc kéo thả ảnh vào bên dưới!'
      );
    }
  };

  const openDetailModal = (paper: GradedPaper) => {
    setSelectedPaper(paper);
    setZoomLevel(1);
    setEditSbd(paper.sbd);
    setEditCode(paper.examCode);
    setEditEssay(String(paper.essayScore ?? 0));
  };

  /** Kiểm tra trùng SBD trước khi lưu */
  const saveWithDuplicateCheck = async (
    graded: GradedPaper,
    fromCamera: boolean,
    isBatch = false
  ): Promise<void> => {
    const cleanSbd = graded.sbd.trim().replace(/^0+/, '');
    const existing =
      !isBatch && cleanSbd && graded.sbd !== 'Chưa rõ'
        ? papers.find((p) => p.sbd.trim().replace(/^0+/, '') === cleanSbd)
        : undefined;

    if (existing) {
      setDupPrompt({ existing, incoming: graded });
      return;
    }

    await onSavePaper(graded);
    triggerFlashResult(graded, fromCamera);
  };

  const handleResolveDuplicate = async (action: 'replace' | 'keep_both' | 'cancel') => {
    if (!dupPrompt) return;
    const { existing, incoming } = dupPrompt;
    setDupPrompt(null);
    if (action === 'cancel') return;

    if (action === 'replace') {
      const replaced: GradedPaper = {
        ...incoming,
        id: existing.id,
      };
      await onSavePaper(replaced);
      triggerFlashResult(replaced, cameraOpen);
    } else if (action === 'keep_both') {
      await onSavePaper(incoming);
      triggerFlashResult(incoming, cameraOpen);
    }
  };

  const handleAutoCaptureLockedCorners = async (fullCorners: DetectedCorners) => {
    if (!videoRef.current || !exam || isCapturingRef.current) return;
    if (videoRef.current.videoWidth === 0) return;

    isCapturingRef.current = true;
    setProcessing(true);
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);

      const scanResult = scanOMRSheet(canvas, exam, fullCorners);
      const graded = gradeBubbleReading(scanResult.reading, exam, students, scanResult.warpedCanvas);

      // Đặt thời gian nghỉ giữa 2 lần chấm theo tốc độ người dùng đã chọn
      cooldownUntilRef.current = Date.now() + Math.max(800, Math.round(scanSettings.scanSpeedSeconds * 1000));
      partialSightStartRef.current = null;

      // Cảnh báo nổi ngay trên màn hình camera nếu không thấy Mã đề trong kỳ thi đang chấm
      if (graded.warning) {
        playBeep(420, 180);
        showCameraBanner(
          'warning',
          `${t.camMissingCodeMsg}: "${graded.examCode}"`,
          3500
        );
      } else {
        playBeep(920, 95);
      }

      await saveWithDuplicateCheck(graded, true, false);
    } catch (err) {
      playBeep(360, 180);
      cooldownUntilRef.current = Date.now() + 1200;
      partialSightStartRef.current = null;
      showCameraBanner(
        'error',
        err instanceof Error ? err.message : 'Lỗi nhận diện phiếu.',
        3200
      );
    } finally {
      isCapturingRef.current = false;
      setProcessing(false);
    }
  };

  const processBatchFiles = async (files: FileList | File[]) => {
    if (!exam || files.length === 0) return;
    setProcessing(true);
    setStatusMsg(null);
    const total = files.length;
    setBatchProgress({ current: 0, total });

    let okCount = 0;
    const errMsgs: string[] = [];
    let lastPaper: GradedPaper | null = null;

    for (let i = 0; i < total; i++) {
      const file = files[i];
      setBatchProgress({ current: i + 1, total });
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const url = URL.createObjectURL(file);
          const image = new Image();
          image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
          };
          image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error(`Không đọc được ảnh ${file.name}`));
          };
          image.src = url;
        });

        const scanResult = scanOMRSheet(img, exam);
        const graded = gradeBubbleReading(scanResult.reading, exam, students, scanResult.warpedCanvas);
        if (total === 1) {
          await saveWithDuplicateCheck(graded, false, false);
        } else {
          await onSavePaper(graded);
        }
        okCount++;
        lastPaper = graded;
      } catch (err) {
        errMsgs.push(`${file.name}: ${err instanceof Error ? err.message : 'Lỗi OMR'}`);
      }
    }

    setBatchProgress(null);
    setProcessing(false);

    if (total > 1 && okCount > 0 && lastPaper) {
      triggerFlashResult(lastPaper, false);
    }

    if (errMsgs.length > 0) {
      setStatusMsg(`Đã chấm ${okCount}/${total} phiếu. Lỗi: ${errMsgs[0]}`);
    } else if (total > 1) {
      setStatusMsg(`Đã chấm thành công hàng loạt ${okCount}/${total} phiếu!`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processBatchFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDropFiles = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const imageFiles = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        await processBatchFiles(imageFiles);
      }
    }
  };

  const handleDemoScan = async () => {
    if (!exam) return;
    setProcessing(true);
    setStatusMsg(null);
    try {
      const availableCodes = Object.keys(exam.answerKeys);
      const code = availableCodes[0] || '0101';
      const key = exam.answerKeys[code];
      const randomStudent =
        students.length > 0 ? students[Math.floor(Math.random() * students.length)] : null;
      const demoSbd = randomStudent ? randomStudent.sbd.padStart(8, '0').slice(-8) : '01234567';

      const opts: Part1Choice[] = ['A', 'B', 'C', 'D'];
      const demoReading: BubbleReading = {
        sbd: demoSbd,
        examCode: code,
        part1: Array.from({ length: 40 }, (_, i) => {
          if (i >= exam.scoring.part1Count) return '';
          const correct = key?.part1[i] || 'A';
          return Math.random() < 0.8 ? correct : opts[Math.floor(Math.random() * 4)];
        }),
        part2: Array.from({ length: 8 }, (_, i) => {
          if (i >= exam.scoring.part2Count) return { a: '', b: '', c: '', d: '' };
          const ck = key?.part2[i];
          const pick = (c: 'D' | 'S' | '') =>
            Math.random() < 0.82 ? c || 'D' : Math.random() < 0.5 ? 'D' : 'S';
          return {
            a: pick(ck?.a || 'D'),
            b: pick(ck?.b || 'S'),
            c: pick(ck?.c || 'D'),
            d: pick(ck?.d || 'S'),
          };
        }),
        part3: Array.from({ length: 6 }, (_, i) => {
          if (i >= exam.scoring.part3Count) return '';
          const correct = key?.part3[i] || '2025';
          return Math.random() < 0.72 ? correct : '-2,5';
        }),
      };

      const rawSheet = renderSheetToCanvas({
        templateType: exam.templateType || 'bgd1239',
        customSheet: exam.customSheet,
        dpi: 145,
        filledData: demoReading,
      });

      const photoCanvas = document.createElement('canvas');
      photoCanvas.width = rawSheet.width + 120;
      photoCanvas.height = rawSheet.height + 120;
      const ctx = photoCanvas.getContext('2d')!;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, 0, photoCanvas.width, photoCanvas.height);
      ctx.translate(photoCanvas.width / 2, photoCanvas.height / 2);
      ctx.rotate((1.8 * Math.PI) / 180);
      ctx.drawImage(rawSheet, -rawSheet.width / 2, -rawSheet.height / 2);

      const scanResult = scanOMRSheet(photoCanvas, exam);
      const graded = gradeBubbleReading(scanResult.reading, exam, students, scanResult.warpedCanvas);
      await saveWithDuplicateCheck(graded, false, false);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Lỗi khi chấm thử.');
    } finally {
      setProcessing(false);
    }
  };

  const handleRegradeSelected = async () => {
    if (!selectedPaper || !exam) return;
    const updatedReading: BubbleReading = {
      ...selectedPaper.reading,
      sbd: editSbd.trim(),
      examCode: editCode.trim(),
    };
    const essayVal = Math.max(0, Number(editEssay) || 0);
    const regraded = gradeBubbleReading(updatedReading, exam, students, undefined, essayVal);
    regraded.id = selectedPaper.id;
    regraded.overlayImageDataUrl = selectedPaper.overlayImageDataUrl;
    await onSavePaper(regraded);
    setSelectedPaper(regraded);
    setStatusMsg('Đã cập nhật SBD / Mã đề / Điểm tự luận và tính lại điểm!');
  };

  /** Lưu ảnh bài làm đã chấm về máy */
  const handleDownloadPaperImage = (paper: GradedPaper) => {
    if (!paper.overlayImageDataUrl) return;
    const safeName = (paper.studentName || paper.sbd || 'BaiLam').replace(/[\\/:*?"<>|\s]+/g, '_');
    const fileName = `${paper.sbd}_${safeName}_${paper.totalScore}d.jpg`;
    const link = document.createElement('a');
    link.href = paper.overlayImageDataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /** Chia sẻ ảnh trực tiếp trên điện thoại (Zalo, Messenger...) */
  const handleSharePaperImage = async (paper: GradedPaper) => {
    if (!paper.overlayImageDataUrl) return;
    try {
      const res = await fetch(paper.overlayImageDataUrl);
      const blob = await res.blob();
      const safeName = (paper.studentName || paper.sbd || 'BaiLam').replace(/[\\/:*?"<>|\s]+/g, '_');
      const file = new File([blob], `${paper.sbd}_${safeName}_${paper.totalScore}d.jpg`, {
        type: 'image/jpeg',
      });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Kết quả bài thi - ${paper.studentName || paper.sbd}`,
          text: `SBD: ${paper.sbd} | Tổng điểm: ${paper.totalScore}/${paper.maxScore}`,
          files: [file],
        });
      } else {
        handleDownloadPaperImage(paper);
      }
    } catch {
      handleDownloadPaperImage(paper);
    }
  };

  if (exams.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center text-slate-600 dark:text-slate-300 text-sm">
        {t.noExamPrompt} <strong>{t.navExams}</strong>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* THẺ NỔI HIỂN THỊ KẾT QUẢ CHẤM LIÊN TỤC (1s..5s) */}
      {flashPaper && (
        <div
          onClick={() => {
            setFlashPaper(null);
            if (!cameraOpen) openDetailModal(flashPaper);
          }}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] w-[92vw] max-w-md bg-slate-900/95 dark:bg-slate-800/95 text-white rounded-3xl p-4 shadow-2xl border-2 border-emerald-400 cursor-pointer"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold">
                {t.displayDuration}: {scanSettings.displaySeconds}s
              </div>
              <div className="font-bold text-base truncate mt-0.5">
                {flashPaper.studentName || `SBD: ${flashPaper.sbd}`}
              </div>
              <div className="text-xs text-slate-300 font-mono">
                SBD: {flashPaper.sbd} • {t.examCodes}: {flashPaper.examCode}
              </div>
            </div>
            <div className="bg-emerald-500 text-white rounded-2xl px-4 py-2 text-center shrink-0">
              <div className="text-2xl font-black leading-none">{flashPaper.totalScore}</div>
              <div className="text-[10px] opacity-90 mt-0.5">/ {flashPaper.maxScore}</div>
            </div>
          </div>

          {scanSettings.displayMode === 'detail_parts' && (
            <div className="mt-3 pt-2.5 border-t border-white/15 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-white/10 rounded-xl py-1.5">
                <div className="text-[10px] text-slate-300">PI</div>
                <div className="font-bold text-emerald-300">{flashPaper.part1Score}</div>
              </div>
              <div className="bg-white/10 rounded-xl py-1.5">
                <div className="text-[10px] text-slate-300">PII</div>
                <div className="font-bold text-blue-300">{flashPaper.part2Score}</div>
              </div>
              <div className="bg-white/10 rounded-xl py-1.5">
                <div className="text-[10px] text-slate-300">PIII</div>
                <div className="font-bold text-amber-300">{flashPaper.part3Score}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BỐ CỤC 2 CỘT KHOA HỌC */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* CỘT TRÁI: CHỌN KỲ THI + HÀNH ĐỘNG CHẤM + CÀI ĐẶT THANH TRƯỢT */}
        <div className="lg:col-span-5 space-y-3.5">
          {/* Chọn kỳ thi */}
          <div className="bg-blue-600 dark:bg-blue-700 text-white rounded-2xl p-4 shadow-sm space-y-2">
            <label className="block text-[11px] uppercase tracking-wider text-blue-100 font-semibold">
              {t.selectExamToGrade}
            </label>
            <select
              value={exam?.id || ''}
              onChange={(e) => onSelectExam(e.target.value)}
              className="w-full bg-white text-slate-900 font-bold text-sm rounded-xl px-3 py-2 outline-none"
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} ({ex.templateType === 'custom' ? t.customTemplate : 'BGD 1239'})
                </option>
              ))}
            </select>
            {exam && (
              <div className="text-xs text-blue-100 flex flex-wrap items-center gap-2 pt-0.5">
                <span>
                  {t.gradedCount}: <strong>{papers.length}</strong> {t.papersUnit}
                </span>
                <span>•</span>
                <span>
                  {t.examCodes}: {Object.keys(exam.answerKeys).join(', ') || t.none}
                </span>
              </div>
            )}
          </div>

          {/* Nút Camera & Chọn ảnh */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={startCamera}
              disabled={processing || !exam}
              className="flex flex-col items-center justify-center gap-1.5 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 active:scale-95 text-white p-4 rounded-2xl shadow-sm transition"
            >
              <Camera className="w-6 h-6 text-blue-400 dark:text-white" />
              <span className="text-xs font-bold">{t.btnScanCamera}</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={processing || !exam}
              className="flex flex-col items-center justify-center gap-1.5 bg-white dark:bg-slate-800 border-2 border-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700 active:scale-95 text-blue-700 dark:text-blue-400 p-4 rounded-2xl shadow-sm transition"
            >
              <ImagePlus className="w-6 h-6" />
              <span className="text-xs font-bold">{t.btnPickImages}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          {/* Bảng Cài đặt quét & hiển thị dạng thanh trượt khoa học */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3.5">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-blue-600" />
              {t.cameraSettings}
            </div>

            {/* Kiểu hiển thị */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {(['continuous_total', 'detail_parts'] as ScanDisplayMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onUpdateScanSettings({ ...scanSettings, displayMode: mode })}
                  className={`py-2 px-2.5 rounded-xl border-2 font-semibold transition ${
                    scanSettings.displayMode === mode
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {mode === 'continuous_total' ? t.modeContinuous : t.modeDetail}
                </button>
              ))}
            </div>

            {/* Thanh trượt Thời gian hiển thị (1s..5s) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  {t.displayDuration}
                </span>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {scanSettings.displaySeconds.toFixed(1)}s
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={0.5}
                value={scanSettings.displaySeconds}
                onChange={(e) =>
                  onUpdateScanSettings({ ...scanSettings, displaySeconds: Number(e.target.value) })
                }
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>1s</span>
                <span>2s</span>
                <span>3s</span>
                <span>4s</span>
                <span>5s</span>
              </div>
            </div>

            {/* Thanh trượt Tốc độ chấm Camera (0.5s..3.0s) */}
            <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">{t.scanSpeed}</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {scanSettings.scanSpeedSeconds.toFixed(1)}s {t.perSheet}
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={3.0}
                step={0.5}
                value={scanSettings.scanSpeedSeconds}
                onChange={(e) =>
                  onUpdateScanSettings({ ...scanSettings, scanSpeedSeconds: Number(e.target.value) })
                }
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>0.5s ({t.fastLabel})</span>
                <span>1.5s</span>
                <span>3.0s ({t.slowLabel})</span>
              </div>
            </div>

            {/* 2 công tắc bật/tắt dành cho Camera */}
            <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-700 text-xs">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-slate-700 dark:text-slate-200 font-medium">
                  {t.showResultOnCamera}
                </span>
                <input
                  type="checkbox"
                  checked={scanSettings.showResultOnCamera}
                  onChange={(e) =>
                    onUpdateScanSettings({ ...scanSettings, showResultOnCamera: e.target.checked })
                  }
                  className="w-4 h-4 accent-blue-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-slate-700 dark:text-slate-200 font-medium">
                  {t.autoScanCamera}
                </span>
                <input
                  type="checkbox"
                  checked={scanSettings.autoScanCamera}
                  onChange={(e) =>
                    onUpdateScanSettings({ ...scanSettings, autoScanCamera: e.target.checked })
                  }
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
              </label>
            </div>
          </div>

          {/* Kéo & Thả hàng loạt ảnh trên máy tính */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDropFiles}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-3.5 text-center cursor-pointer transition ${
              isDragging
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30'
                : 'border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/60 hover:border-blue-400'
            }`}
          >
            <UploadCloud className="w-5 h-5 mx-auto text-blue-600 dark:text-blue-400 mb-1" />
            <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
              {t.dragDropTitle}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {t.dragDropSub}
            </div>
          </div>

          {/* Chấm thử phiếu mẫu */}
          <button
            onClick={handleDemoScan}
            disabled={processing || !exam}
            className="w-full flex items-center justify-center gap-2 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-200 text-xs font-semibold py-2.5 px-4 rounded-xl transition"
          >
            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            {t.btnDemoScan} ({exam?.templateType === 'custom' ? t.customTemplate : 'BGD 1239'})
          </button>

          {processing && (
            <div className="bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 rounded-xl p-3 flex items-center gap-2 text-xs font-semibold">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              {batchProgress
                ? `${t.batchProgressText} ${batchProgress.current}/${batchProgress.total}...`
                : t.processingOMR}
            </div>
          )}

          {cameraError && (
            <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-xl p-3 text-xs">
              {cameraError}
            </div>
          )}

          {statusMsg && (
            <div className="bg-slate-900 dark:bg-slate-700 text-white rounded-xl p-3 text-xs flex items-center justify-between gap-2">
              <span>{statusMsg}</span>
              <button onClick={() => setStatusMsg(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* CỘT PHẢI: DANH SÁCH BÀI ĐÃ CHẤM */}
        <div className="lg:col-span-7 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {t.gradedListTitle} ({papers.length})
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">{t.clickToInspect}</span>
          </div>

          {papers.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-10 text-center text-xs text-slate-500 dark:text-slate-400">
              {t.emptyPapers}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5">
              {papers.map((p) => (
                <div
                  key={p.id}
                  onClick={() => openDetailModal(p)}
                  className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:border-blue-400 transition"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {p.studentName || `SBD: ${p.sbd}`}
                      </span>
                      {p.className && (
                        <span className="text-[11px] bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded font-medium shrink-0">
                          {p.className}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5 font-mono">
                      <span>SBD: {p.sbd}</span>
                      <span>•</span>
                      <span>Đề: {p.examCode}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      PI: {p.part1Score} • PII: {p.part2Score} • PIII: {p.part3Score}
                      {typeof p.essayScore === 'number' ? ` • TL: ${p.essayScore}` : ''}
                    </div>
                    {p.warning && (
                      <div className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{p.warning}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <div className="text-lg font-extrabold text-blue-700 dark:text-blue-400 leading-none">
                        {p.totalScore}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">/ {p.maxScore}</div>
                    </div>
                    <Eye className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* HỘP THOẠI PHÁT HIỆN CHẤM TRÙNG SBD */}
      {dupPrompt && (
        <div className="fixed inset-0 z-[70] bg-black/65 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-xl text-amber-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t.dupTitle}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{t.dupDesc}</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/70 rounded-xl p-3 text-xs space-y-1.5">
              <div className="font-bold text-slate-800 dark:text-slate-100">
                {dupPrompt.incoming.studentName || `SBD: ${dupPrompt.incoming.sbd}`} (SBD:{' '}
                {dupPrompt.incoming.sbd})
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-white dark:bg-slate-800 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500">{t.oldScore}</div>
                  <div className="text-base font-extrabold text-slate-700 dark:text-slate-200">
                    {dupPrompt.existing.totalScore} / {dupPrompt.existing.maxScore}
                  </div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-2 border border-blue-200 dark:border-blue-700">
                  <div className="text-[11px] text-blue-600 dark:text-blue-300">{t.newScore}</div>
                  <div className="text-base font-extrabold text-blue-700 dark:text-blue-300">
                    {dupPrompt.incoming.totalScore} / {dupPrompt.incoming.maxScore}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleResolveDuplicate('replace')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl"
              >
                {t.btnKeepNew}
              </button>
              <button
                onClick={() => handleResolveDuplicate('keep_both')}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-xl"
              >
                {t.btnKeepBoth}
              </button>
              <button
                onClick={() => handleResolveDuplicate('cancel')}
                className="w-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold py-2 rounded-xl"
              >
                {t.btnCancelDup}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY CAMERA TỰ ĐỘNG BẮT 4 CHẤM ĐEN (KHÔNG CẦN NÚT CHỤP THỦ CÔNG + VUỐT ĐỂ QUAY LẠI) */}
      {cameraOpen && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col touch-pan-y select-none"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEndBack(stopCamera)}
        >
          {/* Thanh trên Camera */}
          <div className="flex items-center justify-between px-4 py-3 text-white bg-black/75 z-10">
            <div className="text-xs">
              <div className="font-bold flex items-center gap-2">
                <span>
                  {t.btnScanCamera} ({papers.length} {t.papersUnit})
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    liveCorners.foundCount === 4
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white/20 text-slate-200'
                  }`}
                >
                  {t.cornersLocked}: {liveCorners.foundCount}/4 {t.cornersUnit}
                </span>
              </div>
              <div className="text-[11px] text-slate-300 mt-0.5">{t.swipeToBack}</div>
            </div>
            <div className="flex items-center gap-2">
              {exposureSupported && (
                <button
                  onClick={toggleAntiGlare}
                  className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold transition ${
                    antiGlareOn ? 'bg-blue-500 text-white' : 'bg-white/15 text-slate-200'
                  }`}
                  title="Tự động hạ sáng chống chói"
                >
                  {antiGlareOn ? 'EV-' : 'EV 0'}
                </button>
              )}
              {torchSupported && (
                <button
                  onClick={toggleTorch}
                  className={`p-2 rounded-full transition ${
                    torchOn ? 'bg-amber-400 text-slate-900' : 'bg-white/15 text-white'
                  }`}
                  title={t.flashLabel}
                >
                  {torchOn ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
                </button>
              )}
              <button onClick={stopCamera} className="p-2 bg-white/15 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Bảng thông báo lỗi / cảnh báo nổi ngay trên màn hình Camera (tự ẩn sau ít giây) */}
          {cameraBanner && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[65] w-[92vw] max-w-md px-4 py-3 rounded-2xl shadow-2xl border-2 text-xs font-bold flex items-center gap-2.5 backdrop-blur-md bg-opacity-95 transition-all"
              style={{
                backgroundColor:
                  cameraBanner.type === 'error'
                    ? 'rgba(220, 38, 38, 0.94)'
                    : cameraBanner.type === 'warning'
                      ? 'rgba(217, 119, 6, 0.94)'
                      : 'rgba(22, 163, 74, 0.94)',
                borderColor:
                  cameraBanner.type === 'error'
                    ? '#fca5a5'
                    : cameraBanner.type === 'warning'
                      ? '#fde68a'
                      : '#86efac',
                color: '#ffffff',
              }}
            >
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span className="leading-snug">{cameraBanner.text}</span>
            </div>
          )}

          {/* Khung hình Camera + 4 Ô VUÔNG ĐỊNH VỊ 4 CHẤM ĐEN */}
          <div className="relative flex-1 overflow-hidden flex items-center justify-center">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
              <div
                ref={guideBoxRef}
                className={`w-full max-w-[340px] max-h-[72vh] aspect-[196/283] border-2 border-dashed rounded-md relative transition-colors duration-150 ${
                  liveCorners.foundCount === 4 ? 'border-[#00e038]' : 'border-white/50'
                }`}
              >
                {/* 4 ô vuông định vị lớn (64x64px) ở 4 góc — đổi màu XANH LÁ ngay khi chấm đen lọt vào */}
                {(
                  [
                    { key: 'tl', found: Boolean(liveCorners.tl), pos: '-top-8 -left-8' },
                    { key: 'tr', found: Boolean(liveCorners.tr), pos: '-top-8 -right-8' },
                    { key: 'bl', found: Boolean(liveCorners.bl), pos: '-bottom-8 -left-8' },
                    { key: 'br', found: Boolean(liveCorners.br), pos: '-bottom-8 -right-8' },
                  ] as const
                ).map((box) => (
                  <div
                    key={box.key}
                    className={`w-16 h-16 rounded-xl border-4 absolute ${box.pos} flex items-center justify-center transition-all duration-150 ${
                      box.found
                        ? 'border-[#00e038] bg-[#00e038]/25 scale-105 shadow-[0_0_18px_rgba(0,224,56,0.95)]'
                        : 'border-white/95 bg-black/25'
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-sm ${
                        box.found ? 'bg-[#00e038]' : 'bg-white/75'
                      }`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Thanh trạng thái tự động chấm (KHÔNG có nút chụp thủ công) */}
          <div className="bg-black/85 px-4 py-4 text-center text-white z-10">
            {processing ? (
              <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t.autoGradingNow}
              </div>
            ) : cooldownLeftMs > 0 ? (
              <div className="text-xs font-semibold text-amber-300">
                {t.cooldownNext} {(cooldownLeftMs / 1000).toFixed(1)}s...
              </div>
            ) : (
              <div className="text-xs font-semibold text-slate-200">{t.align4Corners}</div>
            )}
          </div>
        </div>
      )}

      {/* MODAL XEM CHI TIẾT BÀI CHẤM (CÓ ZOOM ẢNH + LƯU/CHIA SẺ + VUỐT QUAY LẠI) */}
      {selectedPaper && exam && (
        <div
          className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-900 flex flex-col"
          onTouchStart={handleTouchStart}
          onTouchEnd={zoomLevel <= 1 ? handleTouchEndBack(() => setSelectedPaper(null)) : undefined}
        >
          <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate">
                {selectedPaper.studentName || `SBD: ${selectedPaper.sbd}`}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.totalLabel}:{' '}
                <strong className="text-blue-600 dark:text-blue-400 text-sm">
                  {selectedPaper.totalScore} / {selectedPaper.maxScore}
                </strong>{' '}
                (PI: {selectedPaper.part1Score} • PII: {selectedPaper.part2Score} • PIII:{' '}
                {selectedPaper.part3Score}
                {(exam.scoring.essayMaxScore || 0) > 0
                  ? ` • ${t.essayShort}: ${selectedPaper.essayScore ?? 0}`
                  : ''}
                )
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {selectedPaper.overlayImageDataUrl && (
                <>
                  <button
                    onClick={() => handleDownloadPaperImage(selectedPaper)}
                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-xl"
                    title={t.saveImage}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t.saveImage}</span>
                  </button>
                  <button
                    onClick={() => handleSharePaperImage(selectedPaper)}
                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-xl"
                    title={t.shareImage}
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t.shareImage}</span>
                  </button>
                </>
              )}
              <button
                onClick={async () => {
                  if (confirm('Xóa bài chấm này?')) {
                    await onDeletePaper(selectedPaper.id);
                    setSelectedPaper(null);
                  }
                }}
                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSelectedPaper(null)}
                className="p-2 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 max-w-6xl w-full mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Ảnh bài làm có thanh Zoom thủ công */}
              {selectedPaper.overlayImageDataUrl && (
                <div className="lg:col-span-7 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#00e038]" /> {t.correctLabel}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#ff1a1a]" /> {t.wrongLabel}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#ffd000]" /> {t.answerLabel}
                      </span>
                    </div>

                    {/* Thanh điều khiển Zoom */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
                      <button
                        onClick={() => setZoomLevel((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
                        className="p-1.5 hover:bg-white dark:hover:bg-slate-600 rounded-lg"
                        title={t.zoomOut}
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setZoomLevel(1)}
                        className="px-2 text-xs font-bold min-w-[46px] text-center"
                        title={t.resetZoom}
                      >
                        {Math.round(zoomLevel * 100)}%
                      </button>
                      <button
                        onClick={() => setZoomLevel((z) => Math.min(3.5, Number((z + 0.5).toFixed(1))))}
                        className="p-1.5 hover:bg-white dark:hover:bg-slate-600 rounded-lg"
                        title={t.zoomIn}
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Khung cuộn hỗ trợ phóng to thủ công tới 350% */}
                  <div className="overflow-auto max-h-[72vh] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950">
                    <img
                      src={selectedPaper.overlayImageDataUrl}
                      alt="Ảnh bài làm đã chấm"
                      onDoubleClick={() => setZoomLevel((z) => (z > 1 ? 1 : 2))}
                      style={{
                        width: `${zoomLevel * 100}%`,
                        maxWidth: 'none',
                      }}
                      className="block transition-all duration-150 cursor-zoom-in"
                    />
                  </div>
                </div>
              )}

              {/* Cột chi tiết & Chỉnh sửa */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 space-y-2.5">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {t.editPaperHeader}{' '}
                    {(exam.scoring.essayMaxScore || 0) > 0 ? t.editEssaySuffix : ''}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <input
                      value={editSbd}
                      onChange={(e) => setEditSbd(e.target.value)}
                      placeholder="SBD"
                      className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-2.5 py-1.5 text-xs font-mono"
                    />
                    <input
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value)}
                      placeholder={t.examCodes}
                      className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-2.5 py-1.5 text-xs font-mono"
                    />
                    {(exam.scoring.essayMaxScore || 0) > 0 && (
                      <input
                        type="number"
                        step="0.25"
                        min={0}
                        max={exam.scoring.essayMaxScore}
                        value={editEssay}
                        onChange={(e) => setEditEssay(e.target.value)}
                        placeholder={t.essayShort}
                        className="border border-purple-300 dark:border-purple-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-2.5 py-1.5 text-xs font-bold"
                      />
                    )}
                    <button
                      onClick={handleRegradeSelected}
                      className="col-span-2 sm:col-span-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl py-2"
                    >
                      {t.updateScoreBtn}
                    </button>
                  </div>
                </div>

                {/* Phần I */}
                {selectedPaper.part1Details.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-2">
                      {t.part1Short} ({selectedPaper.part1Score} {t.pointsUnit})
                    </h4>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                      {selectedPaper.part1Details.map((d) => (
                        <div
                          key={d.question}
                          className={`text-center rounded-lg py-1.5 px-1 text-xs border ${
                            d.isCorrect
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                          }`}
                        >
                          <div className="text-[10px] opacity-70">
                            {t.questionShort}
                            {d.question}
                          </div>
                          <div className="font-bold">
                            {d.selected || '-'}
                            {!d.isCorrect && d.correct ? `/${d.correct}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Phần II */}
                {selectedPaper.part2Details.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-2">
                      {t.part2Full} ({selectedPaper.part2Score} {t.pointsUnit})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedPaper.part2Details.map((d) => (
                        <div key={d.question} className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-2.5 text-xs">
                          <div className="flex justify-between font-bold mb-1 text-slate-800 dark:text-slate-200">
                            <span>
                              {t.questionShort} {d.question}
                            </span>
                            <span className="text-blue-600 dark:text-blue-400">
                              {d.correctSubCount}/4 {t.subItemsCorrect} (+{d.point})
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-1">
                            {(['a', 'b', 'c', 'd'] as const).map((k) => {
                              const ok = d.correct[k] && d.selected[k] === d.correct[k];
                              return (
                                <div
                                  key={k}
                                  className={`text-center py-1 rounded font-semibold ${
                                    ok
                                      ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300'
                                      : 'bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-300'
                                  }`}
                                >
                                  {k}: {d.selected[k] === 'D' ? 'T/Đ' : d.selected[k] === 'S' ? 'F/S' : '-'}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Phần III */}
                {selectedPaper.part3Details.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-2">
                      {t.part3Full} ({selectedPaper.part3Score} {t.pointsUnit})
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {selectedPaper.part3Details.map((d) => (
                        <div
                          key={d.question}
                          className={`rounded-xl p-2 text-xs border ${
                            d.isCorrect
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                          }`}
                        >
                          <div className="flex justify-between">
                            <span className="font-bold">
                              {t.questionShort} {d.question}
                            </span>
                            {d.isCorrect && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                          </div>
                          <div className="font-mono mt-0.5">
                            {t.studentAnsShort}: <strong>{d.selected || t.emptyValue}</strong>
                          </div>
                          {!d.isCorrect && (
                            <div className="font-mono text-[11px] opacity-80">
                              {t.correctAnsShort}: <strong>{d.correct || '-'}</strong>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
