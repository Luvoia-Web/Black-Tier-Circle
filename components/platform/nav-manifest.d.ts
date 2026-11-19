declare module '@/components/platform/nav-manifest.mjs' {
  export type ManifestItem = {
    readonly id: string;
    readonly href: string;
    readonly children?: readonly { readonly id: string; readonly href: string }[];
    readonly panels?: readonly string[];
  };
  export const ownerNav: readonly ManifestItem[];
  export const resellerNav: readonly ManifestItem[];
}
