/**
 *  Brand marks for the two tradable assets.
 *
 *  Inline SVG rather than remote images or an icon font: this renders during a
 *  live demo on a conference network, and a coin logo that 404s is worse than
 *  no logo at all. It also keeps the marks crisp at the 24px used in list rows
 *  and the 42px used in headers, from one definition.
 */
export function CoinIcon({ asset, size = 42 }: { asset: string; size?: number }) {
  const eth = asset.toUpperCase() === "ETH";
  return (
    <span
      className={`asset-icon ${asset.toLowerCase()}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" width={size} height={size} role="presentation">
        <circle cx="16" cy="16" r="16" fill={eth ? "#627EEA" : "#F7931A"} />
        {eth ? (
          <g fill="#fff" fillRule="evenodd">
            {/* The standard four-facet diamond: the lighter faces are the far
                side of the solid, which is what reads as a gem rather than a
                flat arrow at small sizes. */}
            <path d="M16 4v8.87l7.5 3.35z" fillOpacity=".6" />
            <path d="M16 4 8.5 16.22 16 12.87z" />
            <path d="M16 21.97v6.03l7.5-10.38z" fillOpacity=".6" />
            <path d="M16 28v-6.03L8.5 17.62z" />
            <path d="m16 20.57 7.5-4.35-7.5-3.34z" fillOpacity=".2" />
            <path d="m8.5 16.22 7.5 4.35v-7.69z" fillOpacity=".6" />
          </g>
        ) : (
          <path
            fill="#fff"
            d="M22.5 14.14c.3-2.02-1.24-3.1-3.34-3.83l.68-2.73-1.66-.42-.66 2.66c-.44-.11-.89-.21-1.34-.31l.67-2.68-1.66-.41-.68 2.73c-.36-.08-.71-.16-1.06-.25v-.01l-2.29-.57-.44 1.78s1.23.28 1.2.3c.67.17.79.61.77.96l-.78 3.11c.05.01.11.03.18.06l-.18-.05-1.09 4.36c-.08.2-.29.51-.76.39.02.02-1.2-.3-1.2-.3l-.83 1.9 2.16.54c.4.1.8.21 1.19.31l-.69 2.76 1.66.41.68-2.73c.45.12.89.24 1.32.34l-.68 2.72 1.66.41.69-2.75c2.83.54 4.96.32 5.86-2.24.72-2.06-.04-3.25-1.53-4.03 1.08-.25 1.9-.96 2.12-2.43zm-3.79 5.32c-.51 2.06-3.98.95-5.1.67l.91-3.66c1.13.28 4.75.84 4.19 2.99zm.52-5.35c-.47 1.87-3.35.92-4.29.69l.83-3.32c.94.23 3.95.67 3.46 2.63z"
          />
        )}
      </svg>
    </span>
  );
}
