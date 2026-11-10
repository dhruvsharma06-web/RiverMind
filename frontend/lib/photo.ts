export interface CapturedPhoto {
  file: File;
  preview: string;
  capturedAt: string;
  lat: number;
  lon: number;
}
export function browserLocation(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new Error(
          "Location is unavailable in this browser. Use a browser with location access to submit proof.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () =>
        reject(
          new Error(
            "Location permission is required at photo capture. Allow location access in your browser, then take or select the photo again.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
export async function preparePhoto(
  file: File,
  position: { lat: number; lon: number },
  capturedAt: string,
): Promise<CapturedPhoto> {
  if (!["image/jpeg", "image/png"].includes(file.type))
    throw new Error("Choose a JPEG or PNG photo.");
  if (file.size > 8 * 1024 * 1024)
    throw new Error("Each original photo must be no larger than 8 MB.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(
      "This image could not be opened. Please choose a valid JPEG or PNG.",
    );
  });
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error(
      "This browser cannot prepare photos. Please use another browser.",
    );
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("Could not prepare the photo. Please try again.")),
      "image/jpeg",
      0.85,
    ),
  );
  return {
    file: new File([blob], "cleanup.jpg", { type: "image/jpeg" }),
    preview: canvas.toDataURL("image/jpeg", 0.85),
    capturedAt,
    ...position,
  };
}
