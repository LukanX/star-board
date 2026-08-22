export type VisualAssetProps = {
  src: string | null;
  label: string;
  className?: string;
};

export function VisualAsset({ src, label, className = "" }: VisualAssetProps) {
  const stateClass = src
    ? "has-asset bg-[#141b25] bg-center bg-no-repeat"
    : "no-asset grid place-items-center bg-[#101721] bg-[repeating-linear-gradient(135deg,rgba(98,232,255,.08)_0_1px,transparent_1px_9px)] before:font-mono before:text-[7px] before:tracking-[.14em] before:text-[rgba(98,232,255,.55)] before:content-['NO_ARTWORK'] before:rotate-[-90deg]";
  return <div aria-label={label} className={`visual-asset ${className} ${stateClass}`} role={src ? "img" : undefined} style={src ? { backgroundImage: `url(${src})` } : undefined} />;
}

export default VisualAsset;