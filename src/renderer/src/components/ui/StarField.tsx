import { useEffect, useRef } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";

export function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    type Star = {
      x: number;
      y: number;
      r: number;
      opacity: number;
      speed: number;
      phase: number;
      color: string;
      glow: number;
      layer: number;
    };

    type ShootingStar = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      length: number;
    };

    let animId = 0;
    let W = 0;
    let H = 0;
    const stars: Star[] = [];
    const shootingStars: ShootingStar[] = [];

    // Pointer parallax  -  far layers barely move, near layers move more.
    const pointer = { x: 0, y: 0 }; // target offset, -1..1
    const parallax = { x: 0, y: 0 }; // eased current offset

    const colors = [
      "255, 255, 255",
      "190, 220, 255",
      "160, 200, 255",
      "200, 170, 255",
      "255, 200, 180",
      "180, 255, 230",
    ];

    const seed = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars.length = 0;
      // Density scaled to area but capped so ultrawide/4K stays performant.
      const count = Math.min(460, Math.floor((W * H) / 3200));
      for (let i = 0; i < count; i++) {
        const layer = Math.random() < 0.08 ? 2 : Math.random() < 0.25 ? 1 : 0;
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r:
            layer === 2
              ? Math.random() * 2 + 1
              : layer === 1
                ? Math.random() * 1.2 + 0.4
                : Math.random() * 0.7 + 0.2,
          opacity:
            layer === 2 ? Math.random() * 0.4 + 0.5 : Math.random() * 0.5 + 0.1,
          speed: Math.random() * 0.02 + 0.005,
          phase: Math.random() * Math.PI * 2,
          color: colors[Math.floor(Math.random() * colors.length)],
          glow:
            layer === 2
              ? Math.random() * 8 + 3
              : layer === 1 && Math.random() > 0.6
                ? Math.random() * 4 + 2
                : 0,
          layer,
        });
      }
    };

    const spawnShootingStar = () => {
      const fromTop = Math.random() < 0.6;
      const x = fromTop ? Math.random() * W : W + 10;
      const y = fromTop ? -10 : Math.random() * H * 0.4;
      const angle = Math.PI * 0.2 + Math.random() * Math.PI * 0.35;
      const speed = 8 + Math.random() * 7;
      shootingStars.push({
        x,
        y,
        vx: -Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 35 + Math.random() * 35,
        length: 60 + Math.random() * 100,
      });
    };

    // Static single frame for reduced-motion: stars at rest, no twinkle/parallax.
    const drawStatic = () => {
      ctx.clearRect(0, 0, W, H);
      for (const s of stars) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.color},${Math.min(1, s.opacity)})`;
        ctx.fill();
      }
    };

    let t = 0;
    let frameCount = 0;
    let nextShoot = 180 + Math.random() * 350;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      t += 0.016;
      frameCount++;

      // Ease the parallax toward the pointer target (subtle, ≤ ~10px near layer).
      parallax.x += (pointer.x - parallax.x) * 0.05;
      parallax.y += (pointer.y - parallax.y) * 0.05;

      for (const s of stars) {
        const twinkle = Math.sin(t * s.speed * 60 + s.phase);
        const op = s.opacity + twinkle * (s.layer === 2 ? 0.3 : 0.15);
        const finalOp = Math.max(0.03, Math.min(1, op));
        const depth = s.layer + 1;
        const dx = parallax.x * depth * 4;
        const dy = parallax.y * depth * 4;

        if (s.glow > 0) {
          ctx.shadowBlur = s.glow * (0.8 + twinkle * 0.2);
          ctx.shadowColor = `rgba(${s.color}, ${finalOp * 0.6})`;
        }

        ctx.beginPath();
        ctx.arc(s.x + dx, s.y + dy, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.color},${finalOp})`;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Shooting stars
      if (frameCount >= nextShoot) {
        spawnShootingStar();
        nextShoot = frameCount + 250 + Math.random() * 500;
      }

      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const ss = shootingStars[i];
        ss.x += ss.vx;
        ss.y += ss.vy;
        ss.life++;

        const progress = ss.life / ss.maxLife;
        const alpha =
          progress < 0.1
            ? progress * 10
            : Math.max(0, 1 - (progress - 0.1) / 0.9);

        if (alpha <= 0 || ss.x < -150 || ss.y > H + 150) {
          shootingStars.splice(i, 1);
          continue;
        }

        const mag = Math.sqrt(ss.vx * ss.vx + ss.vy * ss.vy);
        const tailX = ss.x - (ss.vx / mag) * ss.length * alpha;
        const tailY = ss.y - (ss.vy / mag) * ss.length * alpha;

        const gradient = ctx.createLinearGradient(ss.x, ss.y, tailX, tailY);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.9})`);
        gradient.addColorStop(0.3, `rgba(190, 210, 255, ${alpha * 0.4})`);
        gradient.addColorStop(1, "rgba(190, 210, 255, 0)");

        ctx.beginPath();
        ctx.moveTo(ss.x, ss.y);
        ctx.lineTo(tailX, tailY);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(ss.x, ss.y, 1.8, 0, Math.PI * 2);
        ctx.shadowBlur = 12;
        ctx.shadowColor = `rgba(190, 210, 255, ${alpha})`;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animId = requestAnimationFrame(draw);
    };

    seed();

    if (reducedMotion) {
      drawStatic();
      const onResizeStatic = () => {
        seed();
        drawStatic();
      };
      window.addEventListener("resize", onResizeStatic);
      return () => window.removeEventListener("resize", onResizeStatic);
    }

    draw();

    // Debounced resize (re-seeding every event is expensive).
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(seed, 150);
    };
    window.addEventListener("resize", onResize);

    // Pointer parallax  -  desktop / fine pointers only.
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const onPointer = (e: PointerEvent) => {
      pointer.x = (e.clientX / W - 0.5) * 2;
      pointer.y = (e.clientY / H - 0.5) * 2;
    };
    if (finePointer) window.addEventListener("pointermove", onPointer);

    // Pause when the tab is hidden to save battery.
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animId);
        animId = 0;
      } else if (animId === 0) {
        draw();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(animId);
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      if (finePointer) window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden="true"
    />
  );
}
