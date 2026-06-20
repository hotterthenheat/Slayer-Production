import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Trophy, X } from 'lucide-react';
import { useContractStore } from '../lib/store';

interface CelebrationOverlayProps {
  purchasedTier: number;
  isOpen: boolean;
  onComplete: () => void;
}

export function CelebrationOverlay({ purchasedTier, isOpen, onComplete }: CelebrationOverlayProps) {
  const onCompleteRef = useRef(onComplete);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Adjust display duration & scroll to top
  useEffect(() => {
    if (!isOpen) return;

    if (purchasedTier <= 1) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      onCompleteRef.current();
      return;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.style.overflow = 'hidden';

    // Auto-dismiss after 4.8 seconds for rapid turnaround
    const dismissTimer = setTimeout(() => {
      onCompleteRef.current();
    }, 4800);

    return () => {
      clearTimeout(dismissTimer);
      document.body.style.overflow = '';
    };
  }, [isOpen, purchasedTier]);

  // High performance Canvas particle simulation loop
  useEffect(() => {
    if (!isOpen || !canvasRef.current || purchasedTier <= 1) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const particles: any[] = [];

    // Helper to spawn individual custom styled particles
    const spawnParticle = (isInitial = false) => {
      const type = purchasedTier === 3 ? (Math.random() > 0.4 ? 'bill' : 'coin') : 'confetti';
      
      let color = '';
      if (purchasedTier === 2) {
        // Vibrant neon rainbow elements
        const colors = ['#ff2d55', '#ff9500', '#ffcc00', '#4cd964', '#5ac8fa', '#007aff', '#5856d6', '#ff2d55', '#4ADE80', '#0a84ff'];
        color = colors[Math.floor(Math.random() * colors.length)];
      } else if (purchasedTier >= 4) {
        // Elite Gold & Silver glitter
        const metallics = ['#ffd700', '#e6c300', '#ffe875', '#e6e8fa', '#c0c0c0', '#b8860b', '#8a8d8f', '#ffffff'];
        color = metallics[Math.floor(Math.random() * metallics.length)];
      }

      const life = purchasedTier >= 4 ? 800 + Math.random() * 800 : 2000 + Math.random() * 1000;

      particles.push({
        x: Math.random() * width,
        y: isInitial ? Math.random() * height : -30,
        vx: (Math.random() - 0.5) * 5,
        vy: type === 'coin' ? 6 + Math.random() * 7 : 5 + Math.random() * 7, // Leave screen fast!
        size: type === 'bill' ? 0 : 4 + Math.random() * 7,
        width: type === 'bill' ? 36 + Math.random() * 14 : 0,
        height: type === 'bill' ? 16 + Math.random() * 5 : 0,
        color,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.16,
        opacity: purchasedTier >= 4 ? 0 : 0.9, 
        scaleY: Math.random() * 2 - 1,
        scaleYSpeed: 0.1 + Math.random() * 0.1,
        type,
        swaySpeed: 0.03 + Math.random() * 0.05,
        swayAmount: 1.5 + Math.random() * 3,
        swayOffset: Math.random() * 100,
        birth: Date.now(),
        life
      });
    };

    // Populate initial batch of particles
    const initialCount = purchasedTier >= 4 ? 110 : 80;
    for (let i = 0; i < initialCount; i++) {
      spawnParticle(true);
    }

    const loop = () => {
      ctx.clearRect(0, 0, width, height);

      // Continuously top-up particle buffer to sustain the blizzard loop
      const maxCount = purchasedTier >= 4 ? 140 : 90;
      if (particles.length < maxCount) {
        const toSpawn = maxCount - particles.length;
        for (let i = 0; i < Math.min(4, toSpawn); i++) {
          spawnParticle(false);
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        // Accelerating fall velocity for faster screen clearance
        p.y += p.vy;
        p.x += p.vx + Math.sin(p.swayOffset + p.y * p.swaySpeed) * 0.4;
        p.angle += p.spin;

        if (p.type === 'bill') {
          p.scaleY += p.scaleYSpeed;
          if (p.scaleY > 1 || p.scaleY < -1) {
            p.scaleYSpeed = -p.scaleYSpeed;
          }
        }

        // Fast blending & fading rules for Tier 4 gold/silver blizzard
        if (purchasedTier >= 4) {
          const age = Date.now() - p.birth;
          if (age < 200) {
            p.opacity = Math.min(1, age / 200); // Blend-in fast
          } else if (age > p.life - 250) {
            p.opacity = Math.max(0, (p.life - age) / 250); // Fade-away fast
          } else {
            p.opacity = 0.95;
          }
        } else {
          // Regular fade near frame bottom
          if (p.y > height - 100) {
            p.opacity = Math.max(0, (height - p.y) / 100);
          }
        }

        // Screen boundary or life exhaustion filter
        const isDead = p.y > height + 40 || p.x < -40 || p.x > width + 40 || (purchasedTier >= 4 && Date.now() - p.birth > p.life);
        if (isDead) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = Math.min(1, Math.max(0, p.opacity));

        if (p.type === 'bill') {
          // $100 Bill Renderer
          ctx.scale(1, p.scaleY);
          
          ctx.fillStyle = '#10371a'; 
          ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);

          ctx.fillStyle = '#659c6b'; 
          ctx.fillRect(-p.width / 2 + 1.2, -p.height / 2 + 1.2, p.width - 2.4, p.height - 2.4);

          ctx.strokeStyle = '#224425'; 
          ctx.lineWidth = 1;
          ctx.strokeRect(-p.width / 2 + 2.5, -p.height / 2 + 2.5, p.width - 5, p.height - 5);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('$100', 0, 0);

        } else if (p.type === 'coin') {
          // Shiny 3D Gold Coin with radial highlights
          const grad = ctx.createRadialGradient(-p.size/3, -p.size/3, 1, 0, 0, p.size);
          grad.addColorStop(0, '#fffae3');
          grad.addColorStop(0.3, '#ffd700');
          grad.addColorStop(0.75, '#be9416');
          grad.addColorStop(1, '#664c05');

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#3d2c01';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(0, 0, p.size - 1.2, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#ffe985';
          ctx.font = `bold ${p.size * 1.05}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('$', 0, 0);

        } else {
          // Rainbow and Gold/Silver Confetti Flakes
          ctx.fillStyle = p.color;
          if (purchasedTier >= 4) {
            // Metallic Diamond Sparks
            ctx.beginPath();
            ctx.moveTo(0, -p.size * 1.1);
            ctx.lineTo(p.size * 0.75, 0);
            ctx.lineTo(0, p.size * 1.1);
            ctx.lineTo(-p.size * 0.75, 0);
            ctx.closePath();
            ctx.fill();
          } else {
            // Rectangular or circular confetti
            if (p.size % 2 === 0) {
              ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
            } else {
              ctx.beginPath();
              ctx.arc(0, 0, p.size, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, purchasedTier]);

  if (!isOpen || purchasedTier <= 1) return null;

  const appleEasing = [0.16, 1, 0.3, 1] as const;

  return (
    <AnimatePresence>
      {/* Background Dim */}
      <motion.div
        key="celebration-bg-outer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: appleEasing }}
        className="fixed inset-0 z-[9998] bg-black/75 backdrop-blur-sm pointer-events-auto flex items-center justify-center p-4 overflow-hidden"
      >
        {/* Particle Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none z-0 block w-full h-full"
        />

        {/* Central Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ duration: 0.6, delay: 0.05, ease: appleEasing }}
          className="relative pointer-events-auto max-w-sm w-full mx-auto z-10"
        >
          {/* Neon back-glow */}
          <div className="absolute -inset-0.5 bg-gradient-to-br from-[#4ADE80]/15 to-[#3a86ff]/15 rounded-2xl blur-xl animate-pulse" />
          
          <div className={`relative rounded-2xl overflow-hidden backdrop-blur-3xl border ${purchasedTier >= 4 ? 'bg-black/90 border-yellow-500/25 shadow-[0_0_40px_rgba(234,179,8,0.12)]' : 'bg-black/90 border-black shadow-2xl'} p-8 text-center`}>
            
            {/* Close Button */}
            <button
              onClick={() => onCompleteRef.current()}
              className="absolute top-4 right-4 text-zinc-500 hover:text-[#E5E5E5] p-1 rounded-full bg-black/40 hover:bg-black/60 transition-all cursor-pointer"
              title="Close Celebration"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex justify-center mb-6 relative">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${purchasedTier >= 4 ? 'bg-yellow-500/10 shadow-[0_0_30px_rgba(234,179,8,0.25)]' : 'bg-black/15 shadow-[0_0_30px_rgba(48,209,88,0.2)]'}`}>
                {purchasedTier >= 4 ? (
                  <Trophy className="w-8 h-8 text-yellow-400" />
                ) : (
                  <Sparkles className="w-8 h-8 text-[#4ADE80]" />
                )}
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
            >
              <h2 className="text-xl font-black text-[#E5E5E5] tracking-widest mb-2 uppercase">
                {purchasedTier >= 5 ? 'Elite Tier Activated' : 
                 purchasedTier === 4 ? 'Professional Clearance' : 
                 purchasedTier === 3 ? 'Gexbot Access Granted' : 'Upgraded'}
              </h2>
              
              <p className="text-zinc-400 text-[10.5px] font-mono mb-6 leading-relaxed">
                System parameters elevated and restriction sets lifted. Real-time options exposure algorithms loaded successfully.
              </p>

              <div className="inline-block bg-black/65 border border-black rounded-lg px-4 py-2.5 text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-widest select-none">
                <span className="text-[#4ADE80]">&gt;&gt;</span> MODULES REBOOTED SECURELY
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
