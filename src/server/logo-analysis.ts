import sharp from "sharp";

/**
 * Determines whether an uploaded logo's own visible (non-transparent) ink is
 * light-colored — used to pick a backdrop that contrasts with it (a white
 * card for a dark logo, a dark card for a light one) wherever it's shown,
 * instead of assuming every uploaded logo is dark the way a plain <img>
 * with no backdrop does.
 *
 * Downsamples to keep this cheap, then averages the relative luminance of
 * every pixel weighted by its own alpha — a pixel that's mostly transparent
 * barely counts, so the large transparent margin most logo exports have
 * doesn't wash out the color of the actual artwork.
 */
export async function computeLogoIsLight(imageBuffer: Buffer): Promise<boolean> {
  const { data, info } = await sharp(imageBuffer)
    .resize(32, 32, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let weightedLuminance = 0;
  let totalWeight = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const alpha = data[i + 3];
    const weight = alpha / 255;
    if (weight === 0) continue;
    const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    weightedLuminance += luminance * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return false; // fully transparent image — fall back to the "dark logo" default
  return weightedLuminance / totalWeight > 150;
}
