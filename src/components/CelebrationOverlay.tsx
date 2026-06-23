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
      const type = 'confetti';

      // Restrained monochrome confetti for every tier
      const colors = ['#E5E5E5', '#A3A3A3', '#71717A', '#D4D4D8', '#FFFFFF'];
      const color = colors[Math.floor(Math.random() * colors.length)];

      const life = purchasedTier >= 4 ? 800 + Math.random() * 800 : 2000 + Math.random() * 1000;

      particles.push({
        x: Math.random() * width,
        y: isInitial ? Math.random() * height : -30,
        vx: (Math.random() - 0.5) * 5,
        vy: 5 + Math.random() * 7, // Leave screen fast!
        size: 4 + Math.random() * 7,
        width: 0,
        height: 0,
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

        // Restrained monochrome confetti flakes
        ctx.fillStyle = p.color;
        if (purchasedTier >= 4) {
          // Diamond sparks
          ctx.beginPath();
          ctx.moveTo(0, -p.size * 1.1);
          ctx.lineTo(p.size * 0.75, 0);
          ctx.lineTo(0, p.size * 1.1);
          ctx.lineTo(-p.size * 0.75, 0);
          ctx.closePath();
          ctx.fill();
        } else {
          // Rectangular or circular confetti (size is a float, so key off its integer part)
          if (Math.floor(p.size) % 2 === 0) {
            ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            ctx.fill();
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
                {purchasedTier >= 5 ? 'Lifetime Unlocked' :
                 purchasedTier === 4 ? 'SkyVision Unlocked' :
                 purchasedTier === 3 ? 'SkyVision Unlocked' :
                 purchasedTier === 2 ? 'Pinpoint GEX Unlocked' :
                 purchasedTier === 1 ? 'Discord Unlocked' : 'Upgraded'}
              </h2>

              <p className="text-zinc-400 text-[10.5px] font-mono mb-6 leading-relaxed">
                Your new plan is live. All features for your tier are now unlocked.
              </p>

              <div className="inline-block bg-black/65 border border-black rounded-lg px-4 py-2.5 text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-widest select-none">
                Ready
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
