/**
 * Deprecated: the Product Detail page has been merged into /products.
 * This route now redirects to /products with an anchor that scrolls
 * the unified list to the matching product card.
 */
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    if (!id || id === "new") {
      navigate("/products?new=1", { replace: true });
    } else {
      navigate(`/products#p-${id}`, { replace: true });
    }
  }, [id, navigate]);
  return null;
}
