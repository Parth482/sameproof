"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, Crop, ImageUp, Keyboard, ScanBarcode, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type DetectorResult = { rawValue?: string };
type DetectorConstructor = new (options?: { formats?: string[] }) => {
  detect(source: CanvasImageSource): Promise<DetectorResult[]>;
};

export function EvidenceCapture({
  onDetected,
}: {
  onDetected: (value: string, source: "barcode" | "image", reference?: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopScannerRef = useRef<(() => void) | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [fileName, setFileName] = useState<string>();
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 100, height: 100 });
  const [message, setMessage] = useState("Point the camera at a GTIN barcode, or upload an image.");
  const [busy, setBusy] = useState(false);

  const stopCamera = useCallback(() => {
    stopScannerRef.current?.();
    stopScannerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function startCamera() {
    setBusy(true);
    setMessage("Requesting camera access…");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera capture is not supported by this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) throw new Error("The camera preview could not be created.");
      video.srcObject = stream;
      await video.play();

      const NativeDetector = (globalThis as typeof globalThis & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
      if (NativeDetector) {
        const detector = new NativeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
        let active = true;
        const scan = async () => {
          if (!active || !videoRef.current) return;
          try {
            const [result] = await detector.detect(videoRef.current);
            if (result?.rawValue) {
              onDetected(result.rawValue, "barcode", "camera");
              setMessage(`Barcode ${result.rawValue} detected.`);
              stopCamera();
              return;
            }
          } catch {
            // A frame without a barcode is expected; keep scanning.
          }
          requestAnimationFrame(scan);
        };
        stopScannerRef.current = () => { active = false; };
        requestAnimationFrame(scan);
      } else {
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 250 });
        const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (!result) return;
          onDetected(result.getText(), "barcode", "camera-fallback");
          setMessage(`Barcode ${result.getText()} detected with the compatibility scanner.`);
          stopCamera();
        });
        stopScannerRef.current = () => controls.stop();
      }
      setMessage("Scanning… Keep the barcode inside the frame.");
    } catch (error) {
      stopCamera();
      setMessage(error instanceof Error ? `${error.message} Use upload or manual entry below.` : "Camera capture failed. Use upload or manual entry below.");
    } finally {
      setBusy(false);
    }
  }

  function chooseFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Choose an image file such as PNG, JPEG or WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMessage("That image is larger than 8 MB. Resize it and try again.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setCrop({ x: 0, y: 0, width: 100, height: 100 });
    setMessage("Adjust the crop if needed, then scan the selected area.");
  }

  async function scanUpload() {
    if (!previewUrl || !canvasRef.current) return;
    setBusy(true);
    try {
      const image = new Image();
      image.src = previewUrl;
      await image.decode();
      const sourceX = Math.round((crop.x / 100) * image.naturalWidth);
      const sourceY = Math.round((crop.y / 100) * image.naturalHeight);
      const sourceWidth = Math.max(1, Math.round((crop.width / 100) * image.naturalWidth));
      const sourceHeight = Math.max(1, Math.round((crop.height / 100) * image.naturalHeight));
      const canvas = canvasRef.current;
      const scale = Math.min(1, 1400 / Math.max(sourceWidth, sourceHeight));
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas processing is unavailable.");
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

      let rawValue: string | undefined;
      const NativeDetector = (globalThis as typeof globalThis & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
      if (NativeDetector) {
        const [result] = await new NativeDetector().detect(canvas);
        rawValue = result?.rawValue;
      }
      if (!rawValue) {
        try {
          rawValue = new BrowserMultiFormatReader().decodeFromCanvas(canvas).getText();
        } catch {
          // The manual fallback below is an intentional part of the journey.
        }
      }
      if (!rawValue) throw new Error("No readable barcode was found in the crop.");
      onDetected(rawValue, "image", fileName);
      setMessage(`Barcode ${rawValue} detected from ${fileName}.`);
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : "Image scanning failed"} Confirm the GTIN manually below.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" className="button-secondary justify-start" onClick={cameraOpen ? stopCamera : startCamera} disabled={busy}>
          {cameraOpen ? <X size={18} /> : <Camera size={18} />} {cameraOpen ? "Close camera" : "Scan with camera"}
        </button>
        <label className="button-secondary justify-start">
          <ImageUp size={18} aria-hidden="true" /> Upload barcode or screenshot
          <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} />
        </label>
      </div>
      <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-900"><ShieldCheck className="mt-0.5 shrink-0" size={16} />Images stay in this browser for local cropping and barcode detection. SameProof saves only the facts you choose to continue with.</p>

      {cameraOpen && (
        <div className="relative overflow-hidden rounded-2xl bg-slate-950">
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline aria-label="Live barcode camera preview" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-[20%_10%] rounded-xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(15,23,42,.45)]" />
        </div>
      )}

      {previewUrl && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-xl bg-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL is user-selected evidence */}
            <img src={previewUrl} alt="Uploaded evidence preview" className="max-h-64 max-w-full object-contain" />
            <span aria-hidden="true" className="pointer-events-none absolute border-2 border-blue-400 bg-blue-400/10 shadow-[0_0_0_999px_rgba(15,23,42,.38)]" style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${Math.min(crop.width, 100 - crop.x)}%`, height: `${Math.min(crop.height, 100 - crop.y)}%` }} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(["x", "y", "width", "height"] as const).map((key) => (
              <label key={key} className="text-xs font-semibold capitalize text-slate-700">
                {key} {crop[key]}%
                <input className="mt-1 w-full accent-blue-600" type="range" min={key === "width" || key === "height" ? 10 : 0} max={100} value={crop[key]} onChange={(event) => setCrop((current) => ({ ...current, [key]: Number(event.target.value) }))} />
              </label>
            ))}
          </div>
          <button type="button" className="button-primary mt-3 w-full sm:w-auto" onClick={scanUpload} disabled={busy}><Crop size={17} /> Crop, resize and scan</button>
          <canvas ref={canvasRef} className="sr-only" aria-hidden="true" />
        </div>
      )}

      <div className="flex items-start gap-3 rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-950" role="status" aria-live="polite">
        {message.includes("manual") ? <Keyboard className="mt-0.5 shrink-0" size={18} /> : <ScanBarcode className="mt-0.5 shrink-0" size={18} />}
        <span>{message}</span>
      </div>
    </div>
  );
}
