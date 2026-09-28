declare module 'gsap/SplitText' {
  export class SplitText {
    readonly lines: HTMLElement[];
    readonly words: HTMLElement[];
    readonly chars: HTMLElement[];
    constructor(
      target: Element | Element[] | string,
      vars?: {
        type?: string;
        mask?: 'lines' | 'words' | 'chars';
        linesClass?: string;
        autoSplit?: boolean;
      },
    );
    revert(): void;
    static register(core: object): void;
  }
}
