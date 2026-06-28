import React, { useState, useEffect, useRef, useCallback } from 'react';
import { withCacheBust } from '../lib/format';
import { Camera, Upload, User, CheckCircle2, X, Image as ImageIcon, AlertCircle, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TerminalLogo } from './BrandLogo';

interface UserProfileProps {
  session: any;
  onUpdateSession: () => void;
}

interface CropParams {
  file: File;
  originalSrc: string;
  type: 'avatar' | 'cover';
  width: number;
  height: number;
  zoom: number;
  panX: number;
  panY: number;
}

export function UserProfile({ session, onUpdateSession }: UserProfileProps) {
  // Input states
  const [nickname, setNickname] = useState(() => session?.name || '');
  const [handle, setHandle] = useState(() => session?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(() => session?.avatar || '');
  const [coverUrl, setCoverUrl] = useState(() => session?.cover_photo || '');
  // Stable per-mount cache-bust so a re-uploaded avatar (same S3 URL) isn't served stale.
  const [avatarBust] = useState(() => Date.now());

  // Operation indicators
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Drag states
  const [isDragOverAvatar, setIsDragOverAvatar] = useState(false);
  const [isDragOverCover, setIsDragOverCover] = useState(false);

  // Debounced Handle Availability states
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [availabilityReason, setAvailabilityReason] = useState('');

  // Crop overlay states
  const [cropActive, setCropActive] = useState(false);
  const [cropParams, setCropParams] = useState<CropParams | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const [localPan, setLocalPan] = useState({ x: 0, y: 0 });

  // Upload selectors trigger references
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);

  // Sync state if session updates externally
  useEffect(() => {
    if (session) {
      if (session.name) setNickname(session.name);
      if (session.username) setHandle(session.username);
      if (session.avatar) setAvatarUrl(session.avatar);
      if (session.cover_photo) setCoverUrl(session.cover_photo);
    }
  }, [session]);

  // Real-time debounced username verification routine
  useEffect(() => {
    if (!handle) {
      setAvailability('idle');
      return;
    }

    const clean = handle.toLowerCase().trim();
    if (clean === session?.username?.toLowerCase().trim()) {
      setAvailability('available');
      setAvailabilityReason('');
      return;
    }

    const regex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!regex.test(clean)) {
      setAvailability('invalid');
      setAvailabilityReason('Must be 3-20 characters, lowercase letters, numbers, or underscores.');
      return;
    }

    const reservedWords = [
      'admin', 'system', 'root', 'support', 'moderator', 'null', 'undefined',
      'slayer', 'pinpoint', 'skyseye', 'billing', 'api', 'auth', 'images', 'users',
      'settings', 'preferences', 'trade', 'quant', 'help', 'developer', 'staff'
    ];
    if (reservedWords.includes(clean)) {
      setAvailability('invalid');
      setAvailabilityReason('This handle is a reserved platform word.');
      return;
    }

    setAvailability('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/check-username?q=${encodeURIComponent(clean)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.available) {
            setAvailability('available');
            setAvailabilityReason('');
          } else {
            setAvailability('taken');
            setAvailabilityReason(data.reason || 'Username is already taken.');
          }
        }
      } catch (err) {
        setAvailability('idle');
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [handle, session]);

  // Strict file format and sizing pre-checks
  const validateAndPrepareFile = (file: File, type: 'avatar' | 'cover') => {
    setErrorMsg(null);
    setSuccessMsg(null);

    // Reject formats outside of JPEG, PNG, or WebP. SVG must be blocked.
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMsg('Unsupported file type. Please use a JPEG, PNG, or WebP image.');
      return;
    }

    // Reject files above 5MB
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('File is too large. Maximum size is 5 MB.');
      return;
    }

    // Verify raw resolution limits using Image constructor
    const blobUrl = URL.createObjectURL(file);
    const imgTester = new Image();
    imgTester.src = blobUrl;
    imgTester.onload = () => {
      const minW = type === 'avatar' ? 150 : 600;
      const minH = type === 'avatar' ? 150 : 200;

      if (imgTester.width < minW || imgTester.height < minH) {
        setErrorMsg(
          `Image is too small. Minimum size is ${minW}x${minH} px. Your file is ${imgTester.width}x${imgTester.height} px.`
        );
        URL.revokeObjectURL(blobUrl);
        return;
      }

      setCropParams({
        file,
        originalSrc: blobUrl,
        type,
        width: imgtesterWidthHeightAndRotationFix(imgTester.width), // standard coordinates
        height: imgTester.height,
        zoom: 1.0,
        panX: 0,
        panY: 0
      });
      setLocalPan({ x: 0, y: 0 });
      setCropActive(true);
    };
    imgTester.onerror = () => {
      // Decode failure: revoke the object URL (otherwise it leaks) and surface an error.
      URL.revokeObjectURL(blobUrl);
      setErrorMsg('Couldn’t read that image. Try a different file.');
    };

    // Helper for correct resolution scope
    function imgtesterWidthHeightAndRotationFix(w: number) {
      return w;
    }
  };

  const handleAvatarFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndPrepareFile(file, 'avatar');
    }
  };

  const handleCoverFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndPrepareFile(file, 'cover');
    }
  };

  // Drag and Drop callbacks
  const handleDragOverAvatar = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverAvatar(true);
  };

  const handleDragLeaveAvatar = () => {
    setIsDragOverAvatar(false);
  };

  const handleDragOverCover = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverCover(true);
  };

  const handleDragLeaveCover = () => {
    setIsDragOverCover(false);
  };

  const handleDropEvent = (e: React.DragEvent, type: 'avatar' | 'cover') => {
    e.preventDefault();
    if (type === 'avatar') setIsDragOverAvatar(false);
    else setIsDragOverCover(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndPrepareFile(file, type);
    }
  };

  // Crop Drag Pan Calculations
  const startDragImagePose = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!cropParams) return;
    setIsDraggingImage(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleDragImagePose = (e: React.MouseEvent) => {
    if (!isDraggingImage || !cropParams) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    dragStartPos.current = { x: e.clientX, y: e.clientY };

    setLocalPan((prev) => {
      const nextX = prev.x + dx;
      const nextY = prev.y + dy;
      return { x: nextX, y: nextY };
    });
  };

  const endDragImagePose = () => {
    setIsDraggingImage(false);
  };

  // Render on clean canvas and save base64 data to our validated CDN simulator route
  const executeCommenceCrop = () => {
    if (!cropParams) return;
    setIsUploading(true);

    const imgElement = new Image();
    imgElement.src = cropParams.originalSrc;
    imgElement.onload = async () => {
      const canvas = document.createElement('canvas');
      const targetW = cropParams.type === 'avatar' ? 250 : 800;
      const targetH = cropParams.type === 'avatar' ? 250 : 300;

      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, targetW, targetH);

        // Aspect calculations centered with zoom and pan
        const imgRatio = imgElement.width / imgElement.height;
        const canvasRatio = targetW / targetH;
        let drawW, drawH;

        if (imgRatio > canvasRatio) {
          drawH = targetH * cropParams.zoom;
          drawW = drawH * imgRatio;
        } else {
          drawW = targetW * cropParams.zoom;
          drawH = drawW / imgRatio;
        }

        const x = (targetW - drawW) / 2 + localPan.x;
        const y = (targetH - drawH) / 2 + localPan.y;

        ctx.drawImage(imgElement, x, y, drawW, drawH);

        try {
          const croppedBase64 = canvas.toDataURL('image/jpeg', 0.9);
          
          // Submit Base64 image payload to secure mock CDN (not localStorage!)
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image: croppedBase64 })
          });

          if (res.ok) {
            const data = await res.json();
            if (cropParams.type === 'avatar') {
              setAvatarUrl(data.cdnUrl);
            } else {
              setCoverUrl(data.cdnUrl);
            }
            setCropActive(false);
            setSuccessMsg(`Image cropped and uploaded successfully.`);
            setTimeout(() => setSuccessMsg(null), 4000);
          } else {
            const errData = await res.json();
            setErrorMsg(errData.error || 'Failed to complete CDN registration.');
          }
        } catch (e) {
          console.error('[CROP UPLOAD ERROR]', e);
          setErrorMsg('Couldn’t process the cropped image. Please try again.');
        } finally {
          setIsUploading(false);
          URL.revokeObjectURL(cropParams.originalSrc);
          setCropParams(null);
        }
      } else {
        // Canvas 2D context unavailable: reset upload state so the button doesn't lock.
        setIsUploading(false);
        URL.revokeObjectURL(cropParams.originalSrc);
        setCropParams(null);
        setErrorMsg('Couldn’t process the cropped image. Please try again.');
      }
    };
    imgElement.onerror = () => {
      // Decode failure: reset state so "Apply Crop" doesn't stay disabled forever.
      setIsUploading(false);
      URL.revokeObjectURL(cropParams.originalSrc);
      setCropParams(null);
      setErrorMsg('Failed to load image for cropping.');
    };
  };

  // Submit complete profile changes
  const handleSaveCompleteProfile = async () => {
    if (availability === 'invalid' || availability === 'taken') {
      setErrorMsg('Please fix the username error before saving.');
      return;
    }

    setIsUpdating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/users/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: nickname.trim(),
          username: handle.trim().toLowerCase(),
          avatar: avatarUrl,
          cover_photo: coverUrl
        })
      });

      if (res.ok) {
        onUpdateSession();
        setSuccessMsg('Profile database saved and synchronized successfully.');
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to synchronize profile preferences.');
      }
    } catch (e) {
      console.error('[PROFILE SAVE ERROR]', e);
      setErrorMsg('Couldn’t save your profile. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-6 space-y-6 relative shadow-2xl">
      <div className="absolute top-0 right-0 p-3 text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-widest font-mono">
        PUBLIC PROFILE
      </div>

      <div className="flex items-center gap-2.5 border-b border-[var(--border)] pb-3">
        <User className="w-5 h-5 text-[var(--accent-color)]" />
        <h2 className="text-lg font-black tracking-tight text-[var(--text-primary)] uppercase font-mono">
          Your Public Profile
        </h2>
      </div>

      {/* Warning/Success Banner displays */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 bg-rose-950/20 border border-rose-900/50 rounded text-[var(--danger)] text-xs font-mono flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 animate-pulse" />
            <span>{errorMsg}</span>
          </motion.div>
        )}

        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 bg-[var(--surface-2)] border border-[var(--border)] rounded text-[var(--success)] text-xs font-mono flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--success)]" />
            <span>{successMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {/* Step A: Cover Banner Dropzone Container */}
        <div className="space-y-2">
          <label className="text-xs text-[var(--text-tertiary)] font-bold block uppercase tracking-wider font-mono">
            Profile Cover Photo
          </label>
          <div
            onDragOver={handleDragOverCover}
            onDragLeave={handleDragLeaveCover}
            onDrop={(e) => handleDropEvent(e, 'cover')}
            onClick={() => coverInputRef.current?.click()}
            className={`w-full h-36 md:h-44 rounded-lg relative overflow-hidden transition-all duration-300 border-2 select-none group cursor-pointer flex flex-col items-center justify-center ${
              isDragOverCover
                ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10'
                : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]'
            }`}
          >
            <input
              type="file"
              ref={coverInputRef}
              className="hidden"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleCoverFileSelected}
            />

            {coverUrl ? (
              <>
                <img
                  src={coverUrl}
                  alt="Profile Cover"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
                  <Camera className="w-6 h-6 text-[var(--accent-color)] animate-pulse" />
                  <span className="text-[9px] font-mono text-[var(--success)] font-black tracking-widest uppercase">
                    DRAG & DROP OR CLICK TO RE-UPLOAD
                  </span>
                </div>
              </>
            ) : (
              <div className="text-center space-y-2 px-4">
                <div className="w-10 h-10 rounded-full bg-[var(--surface-2)] flex items-center justify-center mx-auto group-hover:bg-[var(--surface-3)] transition-colors">
                  <Upload className="w-4 h-4 text-[var(--text-tertiary)]" />
                </div>
                <div>
                  <span className="text-xs text-[var(--text-tertiary)] font-bold font-mono uppercase block">
                    DRAG AND DROP OR CLICK TO UPLOAD COVER PHOTO
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)] font-mono block mt-0.5">
                    JPEG, PNG, or WEBP - min 600x200 px - max 5 MB
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Step B: Overlapping Avatar drop-zone card row */}
        <div className="flex flex-col sm:flex-row gap-5 items-end -mt-10 sm:-mt-12 px-4 z-10 relative">
          <div
            onDragOver={handleDragOverAvatar}
            onDragLeave={handleDragLeaveAvatar}
            onDrop={(e) => handleDropEvent(e, 'avatar')}
            onClick={() => avatarInputRef.current?.click()}
            className={`w-28 h-28 rounded-full relative overflow-hidden transition-all duration-300 border-4 border-[var(--border)] select-none group cursor-pointer flex items-center justify-center bg-[var(--surface-2)] ${
              isDragOverAvatar ? 'scale-110 border-[var(--accent-color)]' : 'hover:scale-105 hover:border-[var(--border-strong)]'
            }`}
          >
            <input
              type="file"
              ref={avatarInputRef}
              className="hidden"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarFileSelected}
            />

            {avatarUrl ? (
              <>
                <img
                  src={withCacheBust(avatarUrl, avatarBust)}
                  alt="Profile Avatar"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                  <Camera className="w-4 h-4 text-[var(--accent-color)] animate-pulse" />
                  <span className="text-[7.5px] font-mono text-[var(--success)] font-black tracking-widest uppercase">
                    UPLOAD
                  </span>
                </div>
              </>
            ) : (
              <div className="text-center space-y-1 scale-125">
                <TerminalLogo />
              </div>
            )}
          </div>

          <div className="space-y-1 shrink-0 pb-2">
            <h3 className="text-sm font-black text-[var(--text-primary)] font-mono tracking-wider uppercase">
              {nickname || 'YOUR NAME'}
            </h3>
            <p className="text-[10px] text-[var(--text-tertiary)] font-mono uppercase tracking-widest">
              {handle ? `@${handle}` : 'NO USERNAME SET'}
            </p>
          </div>
        </div>

        {/* Step C: Form input boxes block */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[var(--text-tertiary)] font-bold block uppercase tracking-wider font-mono">
                Display Name
              </label>
              <span className="text-[9px] text-[var(--text-tertiary)] font-mono font-bold">
                {nickname.length} / 50 CHAR
              </span>
            </div>
            <input
              type="text"
              value={nickname}
              maxLength={50}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:border-[var(--border-strong)] text-[var(--text-primary)] rounded-lg p-2.5 text-sm transition-colors focus:outline-none placeholder-[var(--text-tertiary)] font-mono"
              placeholder="e.g. Robin Slayer"
            />
            <p className="text-[10px] text-[var(--text-tertiary)] font-mono leading-relaxed uppercase">
              Shown publicly on your profile. Spaces and special characters allowed.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[var(--text-tertiary)] font-bold block uppercase tracking-wider font-mono">
                Handle (Username)
              </label>
              {/* Availability Indicator badges */}
              {availability !== 'idle' && (
                <div className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold shrink-0">
                  {availability === 'checking' && (
                    <span className="text-[var(--text-tertiary)] flex items-center gap-1">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" /> Verifying...
                    </span>
                  )}
                  {availability === 'available' && (
                    <span className="text-[var(--success)] flex items-center gap-1">
                      <Check className="w-2.5 h-2.5" /> Handle Available
                    </span>
                  )}
                  {availability === 'taken' && (
                    <span className="text-rose-500 flex items-center gap-1">
                      <AlertCircle className="w-2.5 h-2.5" /> Handle Taken
                    </span>
                  )}
                  {availability === 'invalid' && (
                    <span className="text-rose-500 flex items-center gap-1">
                      <X className="w-2.5 h-2.5" /> Blocked Format
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-[var(--text-tertiary)] text-sm font-mono font-bold">@</span>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                className={`w-full bg-[var(--surface-2)] border border-[var(--border)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:border-[var(--border-strong)] text-[var(--text-primary)] rounded-lg p-2.5 pl-8 text-sm transition-colors focus:outline-none placeholder-[var(--text-tertiary)] font-mono ${
                  availability === 'available' ? 'border-[var(--border)]' : availability === 'taken' || availability === 'invalid' ? 'border-rose-500/30' : 'border-[var(--border)]'
                }`}
                placeholder="your_handle"
              />
            </div>
            <p className="text-[10px] text-[var(--text-tertiary)] font-mono leading-relaxed md:w-11/12 uppercase">
              {availabilityReason || '3-20 characters limit. Lowercase letters, numbers, or underscores only.'}
            </p>
          </div>
        </div>

        {/* Save and submit row */}
        <div className="pt-4 flex justify-end">
          <button
            onClick={handleSaveCompleteProfile}
            disabled={isUpdating || availability === 'taken' || availability === 'invalid'}
            className="py-2.5 px-5 bg-[var(--surface-2)] hover:bg-[var(--accent-color)]/10 text-[var(--accent-color)] hover:text-[var(--accent-color)] border border-[var(--border)] hover:border-[var(--accent-color)]/40 rounded-lg text-xs font-bold font-mono uppercase flex items-center gap-2 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {isUpdating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-[var(--accent-color)]" />
                Save Profile
              </>
            )}
          </button>
        </div>
      </div>

      {/* Visual interactive cropping overlay modal */}
      {cropActive && cropParams && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden max-w-lg w-full shadow-2xl space-y-4"
          >
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[var(--accent-color)]" />
                <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-widest font-mono">
                  Crop {cropParams.type === 'avatar' ? 'Profile Photo' : 'Cover Photo'}
                </span>
              </div>
              <button
                onClick={() => {
                  URL.revokeObjectURL(cropParams.originalSrc);
                  setCropActive(false);
                  setCropParams(null);
                }}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 space-y-4">
              <p className="text-[10px] text-[var(--text-tertiary)] font-mono uppercase bg-[var(--surface-2)] p-2 border border-[var(--border)] rounded">
                Drag the image to reposition it, then use the zoom slider to scale.
              </p>

              {/* Crop Box Window */}
              <div className="relative w-full aspect-square md:aspect-video bg-[var(--bg-base)] border border-[var(--border)] rounded-lg overflow-hidden select-none">
                <div
                  className="absolute inset-0 cursor-move flex items-center justify-center"
                  onMouseDown={startDragImagePose}
                  onMouseMove={handleDragImagePose}
                  onMouseUp={endDragImagePose}
                  onMouseLeave={endDragImagePose}
                >
                  <img
                    ref={cropImageRef}
                    src={cropParams.originalSrc}
                    alt="Source Crop Preview"
                    draggable={false}
                    className="max-w-none origin-center"
                    style={{
                      transform: `translate(${localPan.x}px, ${localPan.y}px) scale(${cropParams.zoom})`,
                      height: cropParams.width > cropParams.height ? '75%' : 'auto',
                      width: cropParams.width <= cropParams.height ? '75%' : 'auto'
                    }}
                  />
                </div>

                {/* Mask layer overlay centered to capture crop boundaries */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  {cropParams.type === 'avatar' ? (
                    // Circular avatar crop mask
                    <div className="w-2/3 aspect-square rounded-full border-2 border-dashed border-[var(--accent-color)] shadow-[0_0_0_1000px_rgba(0,0,0,0.65)]" />
                  ) : (
                    // Banner rectangle crop mask
                    <div className="w-11/12 aspect-[3/1] border-2 border-dashed border-[var(--accent-color)] shadow-[0_0_0_1000px_rgba(0,0,0,0.65)]" />
                  )}
                </div>
              </div>

              {/* Zoom slider control */}
              <div className="space-y-1">
                <div className="flex items-center justify-between font-mono text-[10px] text-[var(--text-tertiary)]">
                  <span>ZOOM</span>
                  <span className="text-[var(--text-primary)] font-bold">{Math.round(cropParams.zoom * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="4.0"
                  step="0.05"
                  value={cropParams.zoom}
                  onChange={(e) => {
                    const nextZoom = parseFloat(e.target.value);
                    setCropParams((prev) => {
                      if (!prev) return null;
                      return { ...prev, zoom: nextZoom };
                    });
                  }}
                  className="w-full accent-[var(--accent-color)] bg-[var(--surface-2)] rounded cursor-pointer"
                />
              </div>
            </div>

            <div className="p-4 bg-[var(--surface)] border-t border-[var(--border)] flex justify-end gap-3">
              <button
                onClick={() => {
                  URL.revokeObjectURL(cropParams.originalSrc);
                  setCropActive(false);
                  setCropParams(null);
                }}
                className="py-2 px-4 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] uppercase font-mono font-bold tracking-wider text-[10px] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeCommenceCrop}
                disabled={isUploading}
                className="py-2 px-5 bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-base)] font-mono font-bold uppercase tracking-wider text-[10px] rounded flex items-center gap-1 cursor-pointer disabled:opacity-45"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Apply Crop
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
