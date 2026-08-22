export type VisualAssetProps = {
  src: string | null;
  label: string;
  className?: string;
};

export function VisualAsset({ src, label, className = "" }: VisualAssetProps) {
  const stateClass = src ? "has-asset bg-[#141b25] bg-center bg-no-repeat" : "no-asset grid place-items-center bg-[#101721]";
  return <div aria-label={label} className={`visual-asset ${className} ${stateClass}`} role={src ? "img" : undefined} style={src ? { backgroundImage: `url(${src})` } : undefined} />;
}

export default VisualAsset;