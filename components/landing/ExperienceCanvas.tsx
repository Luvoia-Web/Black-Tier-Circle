/**
 * Mounts the Memory Crystal and the scroll timelines.
 * Loaded with next/dynamic and ssr: false.
 */

'use client';

import { useEffect, useRef } from 'react';
import { SplitText } from 'gsap/SplitText';
import { gsap, ScrollTrigger } from '@/lib/landing/gsap';
import { crystal, landingReducedMotion } from '@/lib/landing/crystal-state';
import { Experience, experienceHandle } from '@/components/landing/Experience';

gsap.registerPlugin(ScrollTrigger);
SplitText.register(gsap);

function setLive(on: boolean): void {
  crystal.active = on ? 1 : 0;
  experienceHandle.current?.setLive(on);
}

export default function ExperienceCanvas(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let experience: Experience | null = null;
    let playHero: (() => void) | null = null;
    try {
      experience = new Experience(canvas);
    } catch {
      canvas.dataset.webgl = 'off';
    }

    const reduced = landingReducedMotion();
    const root = document.querySelector('.btc-landing');
    const ctx = gsap.context(() => {
      if (reduced) {
        crystal.progress = 1;
        crystal.spin = 0;
        crystal.mesh = 0.35;
        gsap.set('.problem-b, .show-chapter:not(:first-child)', { autoAlpha: 1, x: 0, y: 0 });
        return;
      }

      const zones = gsap.utils.toArray<HTMLElement>('[data-crystal]');
      const active = new Set<string>();
      zones.forEach((zone) => {
        ScrollTrigger.create({
          trigger: zone,
          start: 'top bottom',
          end: 'bottom top',
          onToggle: (self) => {
            const id = zone.id || zone.dataset.crystal || 'zone';
            if (self.isActive) active.add(id);
            else active.delete(id);
            setLive(active.size > 0);
          },
        });
      });

      const desktop = gsap.matchMedia();

      desktop.add('(min-width: 900px)', () => {
        gsap.to('.hero-copy', {
          x: -90,
          opacity: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: '#hero',
            start: 'top top',
            end: '70% top',
            scrub: true,
          },
        });
        gsap.to(crystal, {
          offsetX: 3.5,
          ease: 'none',
          scrollTrigger: {
            trigger: '#hero',
            start: 'top top',
            end: 'bottom top',
            scrub: true,
          },
        });
      });

      desktop.add('(max-width: 899px)', () => {
        crystal.offsetX = 0;
        gsap.to('.hero-copy', {
          y: -40,
          opacity: 0.2,
          ease: 'none',
          scrollTrigger: {
            trigger: '#hero',
            start: 'top top',
            end: 'bottom top',
            scrub: true,
          },
        });
        gsap.to(crystal, {
          pull: 0.35,
          mesh: 0.7,
          ease: 'none',
          scrollTrigger: {
            trigger: '#showcase',
            start: 'top 70%',
            end: 'bottom top',
            scrub: true,
          },
        });
      });

      gsap.to('.scroll-ind', {
        autoAlpha: 0,
        ease: 'none',
        scrollTrigger: {
          trigger: '#hero',
          start: 'top top',
          end: '18% top',
          scrub: true,
        },
      });

      const problem = gsap.timeline({
        scrollTrigger: {
          trigger: '#problem',
          start: 'top top',
          end: '+=100%',
          pin: true,
          scrub: 0.6,
          anticipatePin: 1,
        },
      });
      problem
        .to(crystal, { progress: 0, offsetX: 0, scale: 1.18, mesh: 0.9, pull: 0, scatter: 0.35 }, 0)
        .to('.problem-a', { autoAlpha: 0, y: -36, duration: 0.35 }, 0.28)
        .to('.problem-b', { autoAlpha: 1, y: 0, duration: 0.35 }, 0.48)
        .to(crystal, { progress: 1, scale: 1.05, scatter: 0, mesh: 0.62 }, 0.5);

      const wide = window.matchMedia('(min-width: 900px)').matches;
      if (wide) {
      const finePointer = true;
      const show = gsap.timeline({
        scrollTrigger: {
          trigger: '#showcase',
          start: 'top top',
          end: '+=300%',
          pin: finePointer,
          scrub: 0.45,
          anticipatePin: 1,
          ...(finePointer
            ? {
                snap: {
                  snapTo: 'labels',
                  duration: { min: 0.18, max: 0.45 },
                  delay: 0.06,
                  ease: 'power1.inOut',
                },
              }
            : {}),
          onUpdate: (self) => {
            const index = self.progress < 0.34 ? 0 : self.progress < 0.67 ? 1 : 2;
            document.querySelectorAll<HTMLElement>('.show-dot').forEach((dot, i) => {
              dot.classList.toggle('is-on', i === index);
            });
          },
        },
      });

      show
        .addLabel('chapter1', 0)
        .to(crystal, { pull: 1, scatter: 0, progress: 1, offsetX: 0.35, scale: 1.08, mesh: 0.7 }, 0)
        .to('#ch1', { autoAlpha: 0, x: -28, duration: 0.45 }, 0.85)
        .fromTo('#ch2', { autoAlpha: 0, x: 36 }, { autoAlpha: 1, x: 0, duration: 0.45 }, 0.85)
        .addLabel('chapter2', 1.15)
        .to(crystal, { pull: 0, offsetX: -0.45, mesh: 0.8, scale: 1.02 }, 1.15)
        .to('#ch2', { autoAlpha: 0, x: -28, duration: 0.45 }, 2)
        .fromTo('#ch3', { autoAlpha: 0, x: 36 }, { autoAlpha: 1, x: 0, duration: 0.45 }, 2)
        .addLabel('chapter3', 2.3)
        .to(crystal, { scatter: 0.85, pull: 0, offsetX: 0.15 }, 2.3)
        .to(crystal, { scatter: 0, scale: 1.12, mesh: 0.55 }, 2.7);
      }

      gsap.to(crystal, {
        offsetX: 0,
        scale: 1.62,
        mesh: 1,
        pull: 0,
        scatter: 0,
        progress: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: '#finale',
          start: 'top bottom',
          end: 'top top',
          scrub: true,
        },
      });

      gsap.utils.toArray<HTMLElement>('[data-split]').forEach((el) => {
        const split = new SplitText(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
        gsap.from(split.lines, {
          y: 60,
          opacity: 0,
          duration: 1,
          stagger: 0.06,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 84%',
            toggleActions: 'play none none none',
          },
        });
      });

      const heroTween = gsap.from('.hero-line', {
        y: 60,
        opacity: 0,
        duration: 1.05,
        stagger: 0.08,
        ease: 'power3.out',
        paused: true,
      });
      playHero = (): void => {
        heroTween.play();
      };
      if (document.documentElement.classList.contains('mem-revealed')) {
        playHero();
      } else {
        window.addEventListener('mem-reveal', playHero, { once: true });
      }

      gsap.utils.toArray<HTMLElement>('.reveal-group').forEach((group) => {
        const items = group.querySelectorAll(':scope > .reveal');
        gsap.from(items, {
          y: 50,
          opacity: 0,
          duration: 0.85,
          stagger: 0.08,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: group,
            start: 'top 82%',
            toggleActions: 'play none none none',
          },
        });
      });

      gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
        const target = Number(el.dataset.count ?? '0');
        const suffix = el.dataset.suffix ?? '';
        const prefix = el.dataset.prefix ?? '';
        const proxy = { v: 0 };
        gsap.to(proxy, {
          v: target,
          duration: 1.5,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            toggleActions: 'play none none none',
          },
          onUpdate: () => {
            el.textContent = `${prefix}${Math.round(proxy.v)}${suffix}`;
          },
        });
      });

      gsap.utils.toArray<HTMLElement>('.step-line').forEach((line) => {
        gsap.from(line, {
          scaleX: 0,
          transformOrigin: 'left center',
          duration: 0.9,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: line,
            start: 'top 85%',
            toggleActions: 'play none none none',
          },
        });
      });
    }, root ?? undefined);

    const refresh = (): void => {
      ScrollTrigger.refresh();
    };
    document.fonts.ready.then(refresh).catch(() => undefined);

    return () => {
      if (playHero) window.removeEventListener('mem-reveal', playHero);
      ctx.revert();
      experience?.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="mem-canvas" aria-hidden="true" />;
}
