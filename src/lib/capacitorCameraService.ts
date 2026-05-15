/**
 * Capacitor camera wrapper with browser fallback.
 * Returns a base64 data URL of the captured image, or null on cancel/failure.
 */
export async function captureDefectPhoto(): Promise<string | null> {
  // Try Capacitor Camera if available (native builds)
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.()) {
      const importNativePlugin = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;
      const mod: any = await importNativePlugin("@capacitor/camera").catch(() => null);
      if (mod?.Camera) {
        const photo = await mod.Camera.getPhoto({
          quality: 80,
          resultType: "dataUrl",
          source: "CAMERA",
        });
        return photo?.dataUrl ?? null;
      }
    }
  } catch (err) {
    console.warn("Capacitor camera unavailable, falling back to file input", err);
  }

  // Browser fallback: hidden file input with capture attribute
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
