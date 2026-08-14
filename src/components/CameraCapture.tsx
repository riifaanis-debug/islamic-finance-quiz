import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toCompressedDataUrl } from "@/lib/image";

type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
};

export function CameraCapture({ open, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      setError("تعذر فتح الكاميرا. تأكد من السماح بالوصول إليها.");
    }
  }, []);

  useEffect(() => {
    if (open && !preview) {
      void start();
    }
    return () => {
      if (!open) stop();
    };
  }, [open, preview, start, stop]);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
      stop();
    }
  }, [open, stop]);

  const shoot = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) return;
    stop();
    setPreview(await toCompressedDataUrl(blob));
  };

  const retake = async () => {
    setPreview(null);
    await start();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-foreground/95 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-3 text-background">
        <span className="text-sm font-medium">تصوير السؤال</span>
        <button
          onClick={() => {
            stop();
            onClose();
          }}
          aria-label="إغلاق الكاميرا"
          className="rounded-full bg-background/15 p-2"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {preview ? (
          <img
            src={preview}
            alt="معاينة صورة السؤال"
            className="size-full object-contain"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="size-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="h-[62%] w-full max-w-2xl rounded-2xl border-2 border-dashed border-background/70" />
            </div>
            <p className="absolute inset-x-0 bottom-4 text-center text-sm text-background/90">
              ضع السؤال والاختيارات داخل الإطار
            </p>
          </>
        )}
        {error && (
          <p className="absolute inset-x-0 top-1/2 px-6 text-center text-sm text-background">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 bg-background px-4 py-5">
        {preview ? (
          <>
            <Button variant="outline" size="lg" onClick={retake}>
              <RefreshCw className="size-4" />
              إعادة تصوير
            </Button>
            <Button
              size="lg"
              className="flex-1 max-w-xs"
              onClick={() => onCapture(preview)}
            >
              <Sparkles className="size-4" />
              حل السؤال
            </Button>
          </>
        ) : (
          <Button
            size="lg"
            className="h-16 w-16 rounded-full p-0"
            onClick={shoot}
            aria-label="التقاط الصورة"
            disabled={!!error}
          >
            <Camera className="size-6" />
          </Button>
        )}
      </div>
    </div>
  );
}
