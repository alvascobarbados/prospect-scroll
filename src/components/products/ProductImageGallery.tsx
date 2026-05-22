import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Package, Star, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  deleteImage,
  fetchProductImages,
  setPrimary,
  setRole,
  uploadImageFile,
  type ImageRole,
  type ProductImage,
} from "./helpers/productImages";
import { formatUpdated } from "./helpers/formatUpdated";

interface ProductImageGalleryProps {
  productId: string;
  productName: string;
  /** Hero image URL from products row (legacy fallback when product_images is empty). */
  legacyImageUrl?: string | null;
  /** Product updated_at — rendered as a small muted timestamp under the upload row. */
  updatedAt?: string | Date | null;
  onChanged?: () => void;
}

export function ProductImageGallery({
  productId,
  productName,
  legacyImageUrl,
  updatedAt,
  onChanged,
}: ProductImageGalleryProps) {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingRoleRef = useRef<ImageRole>("additional");

  const reload = async () => {
    setLoading(true);
    try {
      const rows = await fetchProductImages(productId);
      setImages(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load images");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const heroPrimary = images.find((i) => i.role === "hero" && i.is_primary) ?? null;
  const refPrimary = images.find((i) => i.role === "reference" && i.is_primary) ?? null;
  const thumbs = useMemo(
    () => images.filter((i) => !(i.is_primary && (i.role === "hero" || i.role === "reference"))),
    [images],
  );

  // Legacy fallback only if there are zero rows in product_images at all.
  const legacyHero =
    !heroPrimary && images.length === 0 && legacyImageUrl ? legacyImageUrl : null;

  const triggerUpload = (role: ImageRole) => {
    pendingRoleRef.current = role;
    fileRef.current?.click();
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      await uploadImageFile(productId, file, pendingRoleRef.current);
      await reload();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (img: ProductImage) => {
    if (!window.confirm("Delete this image?")) return;
    setBusy(true);
    try {
      await deleteImage(img);
      await reload();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSetPrimary = async (img: ProductImage) => {
    setBusy(true);
    try {
      await setPrimary(img);
      await reload();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSetRole = async (img: ProductImage, role: ImageRole, makePrimary: boolean) => {
    setBusy(true);
    try {
      await setRole(img, role, makePrimary);
      await reload();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 296 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <SlotCell
          label="Product Image"
          image={heroPrimary}
          legacyUrl={legacyHero}
          loading={loading}
          productName={productName}
          onUpload={() => triggerUpload("hero")}
          onClick={() => {
            const idx = heroPrimary
              ? images.findIndex((i) => i.id === heroPrimary.id)
              : -1;
            if (idx >= 0) setLightboxIdx(idx);
          }}
        />
        <SlotCell
          label="Reference"
          image={refPrimary}
          loading={loading}
          productName={productName}
          onUpload={() => triggerUpload("reference")}
          onClick={() => {
            const idx = refPrimary ? images.findIndex((i) => i.id === refPrimary.id) : -1;
            if (idx >= 0) setLightboxIdx(idx);
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
          minHeight: 44,
        }}
      >
        {thumbs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setLightboxIdx(images.findIndex((i) => i.id === t.id))}
            title={`${t.role}${t.is_primary ? " · primary" : ""}`}
            style={{
              width: 40,
              height: 40,
              padding: 0,
              borderRadius: 4,
              border: t.is_primary ? "1.5px solid #0E2849" : "0.5px solid #E5E7EB",
              overflow: "hidden",
              cursor: "pointer",
              background: "#F3F4F6",
            }}
          >
            <img
              src={t.url}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </button>
        ))}
        <button
          type="button"
          onClick={() => triggerUpload("additional")}
          disabled={busy}
          title="Add image"
          style={{
            width: 40,
            height: 40,
            borderRadius: 4,
            border: "1px dashed #C8CFD7",
            background: "transparent",
            color: "#6B7280",
            cursor: busy ? "wait" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Upload size={14} />
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void handleFile(f);
        }}
      />

      {lightboxIdx !== null && images[lightboxIdx] && (
        <Lightbox
          images={images}
          index={lightboxIdx}
          onIndex={setLightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onSetPrimary={handleSetPrimary}
          onSetRole={handleSetRole}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

function SlotCell({
  label,
  image,
  legacyUrl,
  loading,
  productName,
  onUpload,
  onClick,
}: {
  label: string;
  image: ProductImage | null;
  legacyUrl?: string | null;
  loading: boolean;
  productName: string;
  onUpload: () => void;
  onClick: () => void;
}) {
  const url = image?.url ?? legacyUrl ?? null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#6B7280",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        onClick={url ? onClick : onUpload}
        style={{
          background: "#F3F4F6",
          borderRadius: 6,
          width: 144,
          height: 144,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
          cursor: loading ? "wait" : "pointer",
        }}
        title={url ? "Click to view" : `Upload ${label.toLowerCase()}`}
      >
        {url ? (
          <img
            src={url}
            alt={`${productName} — ${label}`}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              color: "#9CA3AF",
              fontSize: 11,
            }}
          >
            <Package size={28} strokeWidth={1.5} />
            <span>no image</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Lightbox({
  images,
  index,
  onIndex,
  onClose,
  onSetPrimary,
  onSetRole,
  onDelete,
}: {
  images: ProductImage[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onSetPrimary: (img: ProductImage) => void | Promise<void>;
  onSetRole: (img: ProductImage, role: ImageRole, makePrimary: boolean) => void | Promise<void>;
  onDelete: (img: ProductImage) => void | Promise<void>;
}) {
  const img = images[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex(Math.min(images.length - 1, index + 1));
      if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onIndex]);

  if (!img) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14, 40, 73, 0.85)",
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "90vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: "white" }}>
          <button
            type="button"
            onClick={() => onIndex(Math.max(0, index - 1))}
            disabled={index === 0}
            style={iconBtnStyle(index === 0)}
            aria-label="Previous"
          >
            <ChevronLeft size={20} />
          </button>
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              overflow: "hidden",
              maxWidth: "70vw",
              maxHeight: "70vh",
            }}
          >
            <img
              src={img.url}
              alt=""
              style={{ display: "block", maxWidth: "70vw", maxHeight: "70vh", objectFit: "contain" }}
            />
          </div>
          <button
            type="button"
            onClick={() => onIndex(Math.min(images.length - 1, index + 1))}
            disabled={index === images.length - 1}
            style={iconBtnStyle(index === images.length - 1)}
            aria-label="Next"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            background: "white",
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          <span style={{ color: "#6B7280" }}>
            {index + 1} / {images.length}
          </span>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              background: "#E5EAF1",
              color: "#0E2849",
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          >
            {img.role}
            {img.is_primary ? " · primary" : ""}
          </span>
          <div style={{ width: 1, height: 16, background: "#E5E7EB", margin: "0 4px" }} />
          <RoleButton
            active={img.role === "hero" && img.is_primary}
            onClick={() => onSetRole(img, "hero", true)}
          >
            Set as Product
          </RoleButton>
          <RoleButton
            active={img.role === "reference" && img.is_primary}
            onClick={() => onSetRole(img, "reference", true)}
          >
            Set as Reference
          </RoleButton>
          {img.role !== "additional" && (
            <RoleButton onClick={() => onSetRole(img, "additional", false)}>
              Move to Additional
            </RoleButton>
          )}
          {!img.is_primary && img.role !== "additional" && (
            <RoleButton onClick={() => onSetPrimary(img)}>
              <Star size={11} /> Make primary
            </RoleButton>
          )}
          <button
            type="button"
            onClick={() => onDelete(img)}
            style={{
              marginLeft: 8,
              border: "none",
              background: "transparent",
              color: "#ef4444",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
            }}
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          width: 36,
          height: 36,
          borderRadius: 18,
          border: "none",
          background: "rgba(255,255,255,0.15)",
          color: "white",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}

function RoleButton({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 10px",
        borderRadius: 4,
        border: active ? "1px solid #0E2849" : "0.5px solid #C8CFD7",
        background: active ? "#0E2849" : "transparent",
        color: active ? "white" : "#0E2849",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {children}
    </button>
  );
}

function iconBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 36,
    height: 36,
    borderRadius: 18,
    border: "none",
    background: "rgba(255,255,255,0.15)",
    color: "white",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.3 : 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}
