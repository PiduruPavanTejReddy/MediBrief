import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Camera, 
  FileText, 
  Image as ImageIcon, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ArrowRight, 
  Loader2,
  Lock,
  Smartphone
} from 'lucide-react';
import { ApiService } from '../services/api';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOCRComplete: (data: any) => void;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onOCRComplete
}) => {
  const [mode, setMode] = useState<'select' | 'camera' | 'preview' | 'processing' | 'success' | 'error'>('select');
  const [errorType, setErrorType] = useState<'permission_denied' | 'browser_unsupported' | 'processing' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);

  // Captured photo preview state
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null);
  const [captureSource, setCaptureSource] = useState<'live' | 'native'>('native');

  // Hidden file input refs
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // Live camera stream refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Clean up stream & preview object URL on close or unmount
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      if (capturedImageUrl) {
        URL.revokeObjectURL(capturedImageUrl);
        setCapturedImageUrl(null);
      }
      setCapturedFile(null);
      setMode('select');
      setErrorType(null);
      setErrorMessage(null);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (capturedImageUrl) {
        URL.revokeObjectURL(capturedImageUrl);
      }
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          // ignore track stop error
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const isMobileDevice = () => {
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      ('ontouchstart' in window && navigator.maxTouchPoints > 0)
    );
  };

  const isGetUserMediaSupported = () => {
    return Boolean(
      window.isSecureContext &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  };

  const handleScanWithCameraClick = () => {
    // If mobile device or insecure context where WebRTC getUserMedia is unavailable,
    // directly invoke native camera capture via <input capture="environment">
    if (isMobileDevice() || !isGetUserMediaSupported()) {
      setCaptureSource('native');
      nativeCameraInputRef.current?.click();
      return;
    }

    // On desktop browsers with secure context & getUserMedia, offer live viewfinder
    setCaptureSource('live');
    setMode('camera');
    startCamera();
  };

  const startCamera = async () => {
    setErrorType(null);
    setErrorMessage(null);
    try {
      if (!isGetUserMediaSupported()) {
        // Fallback to native capture input
        nativeCameraInputRef.current?.click();
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setMode('camera');
    } catch (err: any) {
      console.warn('Camera access error:', err);
      stopCamera();

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorType('permission_denied');
        setErrorMessage('Camera access is needed to scan a report.');
        setMode('error');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.name === 'NotSupportedError') {
        // If no camera device found via getUserMedia, offer native file input fallback
        nativeCameraInputRef.current?.click();
      } else {
        setErrorType('browser_unsupported');
        setErrorMessage("Camera scanning isn't available in this browser.");
        setMode('error');
      }
    }
  };

  // Capture still photo from live video element
  const captureLivePhoto = () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, width, height);

      canvas.toBlob(blob => {
        if (!blob) return;
        const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
        
        stopCamera();

        if (capturedImageUrl) URL.revokeObjectURL(capturedImageUrl);
        const url = URL.createObjectURL(blob);

        setCapturedFile(file);
        setCapturedImageUrl(url);
        setCaptureSource('live');
        setMode('preview');
      }, 'image/jpeg', 0.95);
    } catch (err) {
      console.error('Capture live photo error:', err);
    }
  };

  // Handle native camera capture from <input capture="environment">
  const handleNativeCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (capturedImageUrl) URL.revokeObjectURL(capturedImageUrl);
      const url = URL.createObjectURL(file);
      setCapturedFile(file);
      setCapturedImageUrl(url);
      setCaptureSource('native');
      setMode('preview');
    }
    // Clear value so the same file or subsequent retakes can trigger onChange
    e.target.value = '';
  };

  // Retake photo
  const handleRetake = () => {
    if (capturedImageUrl) {
      URL.revokeObjectURL(capturedImageUrl);
      setCapturedImageUrl(null);
    }
    setCapturedFile(null);

    if (captureSource === 'live' && isGetUserMediaSupported()) {
      setMode('camera');
      startCamera();
    } else {
      nativeCameraInputRef.current?.click();
    }
  };

  // Confirm photo and initiate OCR pipeline
  const handleConfirmPhoto = () => {
    if (capturedFile) {
      processFile(capturedFile);
    }
  };

  // Handle regular file selection (PDF or Gallery Image)
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    e.target.value = '';
  };

  // Document OCR processing pipeline
  const processFile = async (file: File) => {
    setLastUploadedFile(file);
    setMode('processing');
    setErrorType(null);
    setErrorMessage(null);
    setActiveStep(1);

    try {
      // Step 1: Uploading
      setActiveStep(1);
      await new Promise(r => setTimeout(r, 450));

      // Step 2: Reading report
      setActiveStep(2);
      await new Promise(r => setTimeout(r, 450));

      // Step 3: Extracting medical information
      setActiveStep(3);
      const result = await ApiService.uploadDocument(file);

      // Step 4: Organizing record
      setActiveStep(4);
      await new Promise(r => setTimeout(r, 400));

      setMode('success');

      // Short delay then transition to verification review
      setTimeout(() => {
        onClose();
        onOCRComplete(result);
      }, 900);
    } catch (err: any) {
      console.error('OCR pipeline failed:', err);
      setErrorType('processing');
      setErrorMessage(err.message || "We couldn't process this report.");
      setMode('error');
    }
  };

  if (!isOpen) return null;

  const steps = [
    { num: 1, title: 'Uploading...' },
    { num: 2, title: 'Reading report...' },
    { num: 3, title: 'Extracting medical information...' },
    { num: 4, title: 'Organizing record...' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-md max-h-[92vh] sm:max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-6 sm:fade-in sm:zoom-in-95 duration-200">
        
        {/* Mobile Grab Handle */}
        <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-2xs shadow-teal-600/20">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">Add Medical Record</h3>
              <p className="text-[11px] text-slate-500">Scan or upload your report</p>
            </div>
          </div>
          <button
            onClick={() => { stopCamera(); onClose(); }}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center touch-press"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden Native File & Camera Inputs */}
        <input
          ref={nativeCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleNativeCameraCapture}
        />
        <input
          ref={pdfInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileInput}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileInput}
        />

        {/* Modal Body */}
        <div className="p-5 sm:p-6">
          
          {/* STATE 1: Select Upload Source */}
          {mode === 'select' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 mb-1 leading-relaxed">
                Choose how you want to add your medical report. Clinical OCR will automatically extract test findings, units, and ranges.
              </p>

              {/* Option 1: Scan with Camera */}
              <button
                type="button"
                onClick={handleScanWithCameraClick}
                className="w-full min-h-[56px] p-4 bg-teal-50/80 hover:bg-teal-100/80 active:bg-teal-200/80 border border-teal-200/90 rounded-2xl flex items-center justify-between transition-all touch-press group"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-slate-900">Scan with Camera</div>
                    <div className="text-[11px] text-teal-700">Instant capture using phone camera</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-teal-600 group-hover:translate-x-1 transition-transform" />
              </button>

              {/* Option 2: Upload PDF */}
              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                className="w-full min-h-[56px] p-4 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 rounded-2xl flex items-center justify-between transition-all touch-press group"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-slate-900">Upload PDF</div>
                    <div className="text-[11px] text-slate-500">Lab test report, discharge summary</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </button>

              {/* Option 3: Upload Image */}
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="w-full min-h-[56px] p-4 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 rounded-2xl flex items-center justify-between transition-all touch-press group"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-slate-900">Upload Image</div>
                    <div className="text-[11px] text-slate-500">JPG, PNG, or photo from gallery</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          )}

          {/* STATE 2: Live Camera Viewfinder */}
          {mode === 'camera' && (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-3/4 flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  className="w-full h-full object-cover"
                />
                
                {/* Viewfinder Target Frame */}
                <div className="absolute inset-4 border-2 border-teal-400/80 border-dashed rounded-xl pointer-events-none flex items-center justify-center">
                  <span className="text-[11px] font-bold text-white/95 bg-black/70 px-3 py-1 rounded-full backdrop-blur-xs">
                    Align document inside frame
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { stopCamera(); setMode('select'); }}
                  className="flex-1 min-h-[48px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors touch-press"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={captureLivePhoto}
                  className="flex-2 min-h-[48px] bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-600/20 flex items-center justify-center space-x-2 transition-all touch-press"
                >
                  <Camera className="w-4 h-4" />
                  <span>Capture Photo</span>
                </button>
              </div>

              {/* Native camera switch option */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    nativeCameraInputRef.current?.click();
                  }}
                  className="text-[11px] font-semibold text-teal-700 hover:underline inline-flex items-center space-x-1"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Switch to device camera app</span>
                </button>
              </div>
            </div>
          )}

          {/* STATE 3: Photo Preview & Confirmation Screen */}
          {mode === 'preview' && capturedImageUrl && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-3/4 flex items-center justify-center border border-slate-200 shadow-inner">
                <img
                  src={capturedImageUrl}
                  alt="Scanned Medical Document Preview"
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="text-center px-2">
                <h4 className="text-xs font-bold text-slate-900">Review Scanned Photo</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Make sure clinical findings, dates, and test values are clearly legible before analyzing.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleRetake}
                  className="min-h-[48px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center justify-center space-x-1.5 touch-press"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Retake</span>
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPhoto}
                  className="min-h-[48px] px-4 py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-1.5 touch-press"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Use This Photo</span>
                </button>
              </div>
            </div>
          )}

          {/* STATE 4: 4-Step Progress Stepper */}
          {mode === 'processing' && (
            <div className="py-6 space-y-6 text-center">
              
              <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto shadow-xs">
                <Loader2 className="w-7 h-7 text-teal-600 animate-spin" />
              </div>

              <div>
                <h4 className="text-base font-extrabold text-slate-900">Processing Document</h4>
                <p className="text-xs text-slate-500 mt-1">Please wait while our clinical OCR analyzes your report</p>
              </div>

              {/* Step indicator */}
              <div className="max-w-xs mx-auto space-y-2.5 text-left pt-2">
                {steps.map(s => {
                  const isDone = activeStep > s.num;
                  const isCurrent = activeStep === s.num;
                  return (
                    <div
                      key={s.num}
                      className={`flex items-center space-x-3 p-2.5 rounded-xl transition-colors ${
                        isCurrent
                          ? 'bg-teal-50 text-teal-900 font-bold border border-teal-200/80 shadow-2xs'
                          : isDone
                          ? 'text-emerald-700 font-semibold'
                          : 'text-slate-400 font-medium'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 font-bold ${
                        isDone
                          ? 'bg-emerald-600 text-white'
                          : isCurrent
                          ? 'bg-teal-600 text-white animate-pulse'
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {isDone ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                      </div>
                      <span className="text-xs">{s.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STATE 5: Success State */}
          {mode === 'success' && (
            <div className="py-8 text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-slate-900">Record added successfully</h4>
                <p className="text-xs text-slate-500 mt-1">Opening extracted findings review...</p>
              </div>
            </div>
          )}

          {/* STATE 6: Differentiated Error States */}
          {mode === 'error' && (
            <div className="py-6 space-y-5 text-center">
              
              {/* Error Case 1: Camera Permission Denied */}
              {errorType === 'permission_denied' && (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                    <Lock className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Camera Access Needed</h4>
                    <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto leading-relaxed">
                      Camera access is needed to scan a report.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 max-w-xs mx-auto pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('camera');
                        startCamera();
                      }}
                      className="flex-1 min-h-[44px] bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors touch-press"
                    >
                      Try Again
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('select');
                        imageInputRef.current?.click();
                      }}
                      className="flex-1 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors touch-press"
                    >
                      Upload Instead
                    </button>
                  </div>
                </>
              )}

              {/* Error Case 2: Browser Unsupported */}
              {errorType === 'browser_unsupported' && (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Camera Scanning Unavailable</h4>
                    <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto leading-relaxed">
                      Camera scanning isn't available in this browser.
                    </p>
                  </div>
                  <div className="max-w-xs mx-auto pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('select');
                        imageInputRef.current?.click();
                      }}
                      className="w-full min-h-[44px] bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors touch-press"
                    >
                      Upload Photo Instead
                    </button>
                  </div>
                </>
              )}

              {/* Error Case 3: Processing Failure */}
              {errorType === 'processing' && (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">We couldn't process this report.</h4>
                    <p className="text-xs text-rose-600 mt-1 max-w-xs mx-auto leading-relaxed">
                      {errorMessage || "Please make sure the document is well-lit, flat, and legible."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 max-w-xs mx-auto pt-2">
                    <button
                      type="button"
                      onClick={() => setMode('select')}
                      className="flex-1 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors touch-press"
                    >
                      Change File
                    </button>
                    {lastUploadedFile && (
                      <button
                        type="button"
                        onClick={() => processFile(lastUploadedFile)}
                        className="flex-1 min-h-[44px] bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center space-x-1 transition-colors touch-press"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Try Again</span>
                      </button>
                    )}
                  </div>
                </>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
};
