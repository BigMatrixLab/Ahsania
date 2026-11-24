import type Konva from "konva";
import { RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Image as KonvaImage, Layer, Rect as KonvaRect, Stage, Transformer } from "react-konva";
import { clampRect, rotatedSize, scaleRect, type Rect, type Rotation } from "../imaging/geometry";
import { preparePage, rotateToCanvas, type PreparedPage } from "../imaging/render";
import { Notice } from "../ui/Notice";
import { primaryButton, quietButton, secondaryButton } from "../ui/styles";

const TEAL = "#195a3b"; // the canvas cannot read Tailwind's colours (brand-700)
const FRAME = "#2b8658"; // brand-500: readable on both pale paper and dark film
const FRAME_INSET = 12;

interface Props {
  bitmap: ImageBitmap;
  onCancel: () => void;
  onDone: (page: PreparedPage) => void;
}

export function CropEditor({ bitmap, onCancel, onDone }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<Konva.Rect>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [displayWidth, setDisplayWidth] = useState(0);
  const [crop, setCrop] = useState<Rect | null>(null); // stage pixels; null = whole image
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setDisplayWidth(Math.min(el.clientWidth, 900));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const preview = useMemo(() => rotateToCanvas(bitmap, rotation, 1200), [bitmap, rotation]);
  const stageWidth = displayWidth;
  const stageHeight = displayWidth > 0 ? Math.round((preview.height * displayWidth) / preview.width) : 0;
  // Set in from the edge so the corner handles can be seen and grabbed; untouched, the whole photo is still used.
  const frame = crop ?? { x: FRAME_INSET, y: FRAME_INSET, w: stageWidth - 2 * FRAME_INSET, h: stageHeight - 2 * FRAME_INSET };

  useEffect(() => setCrop(null), [rotation, stageWidth]);
  useEffect(() => {
    if (transformerRef.current && frameRef.current) {
      transformerRef.current.nodes([frameRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [stageWidth, stageHeight, rotation]);

  async function done() {
    setBusy(true);
    setError(null);
    try {
      const full = rotatedSize(bitmap.width, bitmap.height, rotation);
      const cropInFullPixels = crop === null ? null : clampRect(scaleRect(crop, full.width / stageWidth), full.width, full.height);
      onDone(await preparePage(bitmap, rotation, cropInFullPixels));
    } catch {
      setError("Could not prepare this page. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const turn = (delta: 90 | 270) => setRotation(((rotation + delta) % 360) as Rotation);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-ink-900">Crop and straighten</h2>
      <p className="text-sm text-ink-700">Drag the frame's corners so only the document is inside.</p>
      <div ref={containerRef} className="w-full overflow-hidden rounded-xl border border-ink-200 bg-ink-900">
        {stageWidth > 0 && (
          <Stage width={stageWidth} height={stageHeight}>
            <Layer>
              <KonvaImage image={preview} width={stageWidth} height={stageHeight} />
              <KonvaRect
                ref={frameRef}
                x={frame.x}
                y={frame.y}
                width={frame.w}
                height={frame.h}
                stroke={FRAME}
                strokeWidth={3}
                draggable
                onDragEnd={(e) => setCrop({ ...frame, x: e.target.x(), y: e.target.y() })}
                onTransformEnd={(e) => {
                  const node = e.target;
                  const w = Math.max(20, node.width() * node.scaleX());
                  const h = Math.max(20, node.height() * node.scaleY());
                  node.scaleX(1);
                  node.scaleY(1);
                  setCrop({ x: node.x(), y: node.y(), w, h });
                }}
              />
              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                keepRatio={false}
                enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
                anchorSize={24}
                anchorCornerRadius={12}
                anchorStroke={TEAL}
                anchorFill="#ffffff"
                borderEnabled={false}
              />
            </Layer>
          </Stage>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap justify-center gap-1 rounded-xl border border-ink-200 bg-white p-1">
        <button type="button" onClick={() => turn(270)} className={quietButton}>
          <RotateCcw aria-hidden="true" className="size-4" />
          Rotate left
        </button>
        <button type="button" onClick={() => turn(90)} className={quietButton}>
          <RotateCw aria-hidden="true" className="size-4" />
          Rotate right
        </button>
        <button type="button" onClick={() => setCrop(null)} className={quietButton}>
          Reset crop
        </button>
      </div>
      <div className="flex gap-2 border-t border-ink-200 pt-4">
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
        <button type="button" disabled={busy || stageWidth === 0} onClick={() => void done()} className={`${primaryButton} flex-1`}>
          {busy ? "Preparing…" : "Use this page"}
        </button>
      </div>
    </div>
  );
}
