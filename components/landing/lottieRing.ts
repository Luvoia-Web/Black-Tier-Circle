/**
 * @file components/landing/lottieRing.ts
 *
 * A single gold ring pulse used as the hover micro-animation on feature cards.
 */

export const lottieRing = {
  v: '5.7.4',
  fr: 30,
  ip: 0,
  op: 60,
  w: 100,
  h: 100,
  nm: 'ring',
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'ring',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [50, 50, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            { t: 0, s: [72, 72, 100], i: { x: [0.45], y: [1] }, o: { x: [0.55], y: [0] } },
            { t: 30, s: [100, 100, 100], i: { x: [0.45], y: [1] }, o: { x: [0.55], y: [0] } },
            { t: 60, s: [72, 72, 100] },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          nm: 'circle',
          it: [
            { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [62, 62] } },
            {
              ty: 'st',
              c: { a: 0, k: [0.631, 0.384, 0.027, 1] },
              o: { a: 0, k: 100 },
              w: { a: 0, k: 4 },
              lc: 2,
              lj: 2,
            },
            {
              ty: 'tr',
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
            },
          ],
        },
      ],
      ip: 0,
      op: 60,
      st: 0,
    },
  ],
} as const;
