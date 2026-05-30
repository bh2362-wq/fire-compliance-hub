import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Inline links to site / customer detail pages. Used inside tables and lists
 * so users can jump straight to the site or customer file from anywhere the
 * name is shown (visits, invoices, quotes, POs, credit control, defects…).
 *
 * - `stopPropagation` prevents the parent row's `onClick` (which usually
 *   opens an edit dialog) from firing when the user wants to navigate.
 * - Falls back to a plain span when the id is missing so we never render a
 *   dead link.
 */

interface NameLinkProps {
  id?: string | null;
  name?: string | null;
  className?: string;
  fallback?: string;
}

const baseClass =
  "hover:text-primary hover:underline underline-offset-2 transition-colors cursor-pointer";

export const SiteLink = ({ id, name, className, fallback = "Unknown Site" }: NameLinkProps) => {
  const label = name || fallback;
  if (!id) return <span className={className}>{label}</span>;
  return (
    <Link
      to={`/dashboard/sites/${id}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(baseClass, className)}
      title={`Open site file: ${label}`}
    >
      {label}
    </Link>
  );
};

export const CustomerLink = ({ id, name, className, fallback = "Unknown Customer" }: NameLinkProps) => {
  const label = name || fallback;
  if (!id) return <span className={className}>{label}</span>;
  return (
    <Link
      to={`/dashboard/customers/${id}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(baseClass, className)}
      title={`Open customer file: ${label}`}
    >
      {label}
    </Link>
  );
};
