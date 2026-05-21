import { useRef, useState } from "react";
import { Package, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ImageUploadCellProps {
  productId: string;
  imageUrl: string | null;
  productName: string;
  size?: number;
  onChanged?: () => void;
}

export function ImageUploadCell({
  productId,
  imageUrl,
  productName,
  size = 160,
  onChanged,
}: ImageUploadCellProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);

  const onPick = () => inputRef.current?.click();

  const onFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image must be smaller than 8MB");
      return;
    }
    setBusy(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${productId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("product-images")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (upErr) {
      setBusy(false);
      toast.error(`Upload failed: ${upErr.message}`);
      return;
    }
    const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
    const { error: updErr } = await supabase
      .from("products")
      .update({ image_url: pub.publicUrl })
      .eq("id", productId);
    setBusy(false);
    if (updErr) {
      toast.error(`Save failed: ${updErr.message}`);
      return;
    }
    onChanged?.();
  };

  return (
    <div
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "#F3F4F6",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        minHeight: size,
        aspectRatio: "1 / 1",
        alignSelf: "start",
        overflow: "hidden",
        position: "relative",
        cursor: busy ? "wait" : "pointer",
      }}
      title="Click to upload an image"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={productName}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6 }}
        />
      ) : (
        <Package size={36} color="#9CA3AF" strokeWidth={1.5} />
      )}
      {(hover || busy) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(14, 40, 73, 0.55)",
            color: "white",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          <Upload size={18} />
          {busy ? "Uploading…" : "Upload"}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onFile(f);
        }}
      />
    </div>
  );
}
