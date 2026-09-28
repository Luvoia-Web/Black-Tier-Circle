/**
 * @file app/(landing)/page.tsx
 *
 * Public MemoryOS homepage. The WebGL canvas is client-only.
 */

import dynamic from 'next/dynamic';
import { MemoryNav } from '@/components/landing/MemoryNav';
import { MemoryPreloader } from '@/components/landing/MemoryPreloader';
import { MemoryTop } from '@/components/landing/MemoryTop';
import { MemoryMiddle } from '@/components/landing/MemoryMiddle';
import { MemoryBottom } from '@/components/landing/MemoryBottom';

const ExperienceCanvas = dynamic(() => import('@/components/landing/ExperienceCanvas'), {
  ssr: false,
});

export default function LandingPage(): JSX.Element {
  return (
    <>
      <ExperienceCanvas />
      <MemoryPreloader />
      <MemoryNav />
      <main id="content">
        <MemoryTop />
        <MemoryMiddle />
        <MemoryBottom />
      </main>
    </>
  );
}
