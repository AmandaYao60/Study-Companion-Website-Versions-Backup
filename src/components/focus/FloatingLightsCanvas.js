"use client";

import { useEffect, useRef } from "react";

const DEFAULT_PARTICLE_COUNT = 58;

const GOLD_COLORS = [
  [255, 239, 174],
  [255, 214, 116],
  [255, 247, 204],
];

const BLUE_COLORS = [
  [134, 238, 255],
  [105, 203, 255],
];

const randomBetween = (min, max) =>
  min + Math.random() * (max - min);

const createParticle = (width, height) => {
  const isBlue = Math.random() < 0.18;
  const depth = Math.random();

  return {
    x: Math.random() * width,
    y: Math.random() * height,

    radius: randomBetween(2.2, 4) * (0.65 + depth*0.8),

    baseAlpha: randomBetween(0.3, 0.82),
    alpha: 0,

    speedY: randomBetween(3, 11) * (0.45 + depth),

    driftAmount: randomBetween(3, 13),
    driftSpeed: randomBetween(0.18, 0.55),

    pulseSpeed: randomBetween(0.7, 1.8),
    phase: Math.random() * Math.PI * 2,

    depth,
    color: isBlue
      ? BLUE_COLORS[
          Math.floor(Math.random() * BLUE_COLORS.length)
        ]
      : GOLD_COLORS[
          Math.floor(Math.random() * GOLD_COLORS.length)
        ],
  };
};

export default function FloatingLightsCanvas({
  particleCount = DEFAULT_PARTICLE_COUNT,
  intensity = 1,
  speedMultiplier = 1,
  className = "",
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext("2d", {
      alpha: true,
      desynchronized: true,
    });

    if (!context) return undefined;

    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let animationFrameId = null;
    let previousTimestamp = performance.now();
    let particles = [];

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();

      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);

      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);

      context.setTransform(
        pixelRatio,
        0,
        0,
        pixelRatio,
        0,
        0
      );

      particles = Array.from(
        { length: particleCount },
        () => createParticle(width, height)
      );
    };

    const resetParticle = (particle) => {
      particle.x = Math.random() * width;
      particle.y = height + randomBetween(4, 45);
      particle.phase = Math.random() * Math.PI * 2;
    };

    const drawGlow = (particle, timestamp) => {
      const pulse = 0.68 + Math.sin(timestamp * 0.001 * particle.pulseSpeed + particle.phase) * 0.32;
      
      particle.alpha = Math.min(1, particle.baseAlpha * pulse * intensity);

      const drift =
        Math.sin(
          timestamp * 0.001 * particle.driftSpeed +
            particle.phase
        ) * particle.driftAmount;

      const drawX = particle.x + drift;
      const drawY = particle.y;

      const glowRadius =
        particle.radius * (3.3 + particle.depth * 1.5);

      const [red, green, blue] = particle.color;

      const gradient = context.createRadialGradient(
        drawX,
        drawY,
        0,
        drawX,
        drawY,
        glowRadius
      );

      gradient.addColorStop(
        0,
        `rgba(${red}, ${green}, ${blue}, ${
          particle.alpha
        })`
      );

      gradient.addColorStop(
        0.22,
        `rgba(${red}, ${green}, ${blue}, ${
          particle.alpha * 0.58
        })`
      );

      gradient.addColorStop(
        1,
        `rgba(${red}, ${green}, ${blue}, 0)`
      );

      context.beginPath();
      context.fillStyle = gradient;
      context.arc(
        drawX,
        drawY,
        glowRadius,
        0,
        Math.PI * 2
      );
      context.fill();

      context.beginPath();
      context.fillStyle = `rgba(255, 255, 238, ${
        particle.alpha * 0.85
      })`;
      context.arc(
        drawX,
        drawY,
        Math.max(0.45, particle.radius * 0.45),
        0,
        Math.PI * 2
      );
      context.fill();
    };

    const render = (timestamp) => {
      const deltaSeconds = Math.min(
        (timestamp - previousTimestamp) / 1000,
        0.05
      );

      previousTimestamp = timestamp;

      context.clearRect(0, 0, width, height);

      context.globalCompositeOperation = "lighter";

      const motionScale = reducedMotionQuery.matches
        ? 0
        : speedMultiplier;

      for (const particle of particles) {
        particle.y -=
          particle.speedY *
          motionScale *
          deltaSeconds;

        if (particle.y < -30) {
          resetParticle(particle);
        }

        drawGlow(particle, timestamp);
      }

      context.globalCompositeOperation = "source-over";

      animationFrameId =
        window.requestAnimationFrame(render);
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);

    resizeObserver.observe(canvas);
    resizeCanvas();

    animationFrameId =
      window.requestAnimationFrame(render);

    return () => {
      resizeObserver.disconnect();

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [particleCount, intensity, speedMultiplier]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}