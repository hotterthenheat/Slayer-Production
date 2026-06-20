import { motion } from 'motion/react';
import React from 'react';

export function AnimatedBorder({ radius = 16, color = '#ffffff', duration = 5 }) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ borderRadius: 'inherit' }}>
      <rect
        x="0.75"
        y="0.75"
        width="calc(100% - 1.5px)"
        height="calc(100% - 1.5px)"
        rx={radius}
        fill="none"
        stroke="rgba(255, 255, 255, 0.05)"
        strokeWidth="1"
      />
      <motion.rect
        x="0.75"
        y="0.75"
        width="calc(100% - 1.5px)"
        height="calc(100% - 1.5px)"
        rx={radius}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        pathLength={1}
        strokeDasharray="0.16 0.84"
        animate={{
          strokeDashoffset: [0, -1],
        }}
        transition={{
          repeat: Infinity,
          duration: duration,
          ease: "linear",
        }}
      />
    </svg>
  );
}
