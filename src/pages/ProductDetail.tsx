/**
 * Deprecated: the Product Detail page has been merged into /supplier-product-data.
 * This route now redirects with an anchor that scrolls the unified list to the
 * matching product card.
 */
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    if (!id || id === "new") {
      navigate("/supplier-product-data?new=1", { replace: true });
    } else {
      navigate(`/supplier-product-data#p-${id}`, { replace: true });
    }
  }, [id, navigate]);
  return null;
}
