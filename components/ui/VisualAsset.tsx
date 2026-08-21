export type VisualAssetProps = {
  src: string | null;
  label: string;
  className?: string;
};

export function VisualAsset({ src, label, className = "" }: VisualAssetProps) {
  return <div aria-label={label} className={`visual-asset ${className} ${src ? "has-asset" : "no-asset"}`} role={src ? "img" : undefined} style={src ? { backgroundImage: `url(${src})` } : undefined} />;
}

export default VisualAsset;