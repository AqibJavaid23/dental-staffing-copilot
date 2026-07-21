export default function BrandLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <div className="brand-loader">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/icon-color.png" alt="Loading" />
      </div>
      {label && <p className="text-sm text-zinc-500">{label}</p>}
    </div>
  );
}