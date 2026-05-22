/**
 * Single source of truth for the Supplier Product Data sheet's column layout.
 * Used by the sticky header, every card row, and grouped variant rows so that
 * Identity / Product Details / Packing / Pricing all start at the same x on
 * every card.
 *
 * Last track is a `1fr` SPACER — no content, no divider — that absorbs leftover
 * width on the right so the Pricing column sizes itself to its widest table
 * (incl. an optional "Ground $" column) and never stretches.
 */
export const SHEET_GRID_TEMPLATE =
  "296px 280px 260px 240px max-content 1fr";
//  Images   Identity Details  Packing  Pricing(content)  Spacer

export const SHEET_COL_GAP = 32;

export const SHEET_ROW_PADDING = "14px 18px";
