import { supabase } from "@/integrations/supabase/client";

export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  xero_contact_id: string | null;
  status: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderLineItem {
  id: string;
  purchase_order_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  account_code: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  status: string;
  order_date: string;
  expected_delivery_date: string | null;
  delivery_address: string | null;
  reference: string | null;
  notes: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  vat_rate: number;
  xero_purchase_order_id: string | null;
  xero_status: string | null;
  synced_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  supplier?: Supplier;
  line_items?: PurchaseOrderLineItem[];
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("status", "active")
    .order("name");

  if (error) throw error;
  return (data || []) as Supplier[];
}

export async function createSupplier(supplier: Partial<Supplier>, userId: string): Promise<Supplier> {
  const insertData = {
    name: supplier.name!,
    contact_name: supplier.contact_name || null,
    email: supplier.email || null,
    phone: supplier.phone || null,
    address: supplier.address || null,
    city: supplier.city || null,
    postcode: supplier.postcode || null,
    xero_contact_id: supplier.xero_contact_id || null,
    notes: supplier.notes || null,
    created_by: userId,
  };
  
  const { data, error } = await supabase
    .from("suppliers")
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;
  return data as Supplier;
}

export async function updateSupplier(id: string, supplier: Partial<Supplier>): Promise<Supplier> {
  const { data, error } = await supabase
    .from("suppliers")
    .update(supplier)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Supplier;
}

export async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(`
      *,
      supplier:suppliers(*)
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as PurchaseOrder[];
}

export async function fetchPurchaseOrderById(id: string): Promise<PurchaseOrder | null> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(`
      *,
      supplier:suppliers(*),
      line_items:purchase_order_line_items(*)
    `)
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as unknown as PurchaseOrder;
}

export async function getNextPoNumber(): Promise<string> {
  const { data, error } = await supabase.rpc("get_next_po_number");
  if (error) throw error;
  return data as string;
}

export async function createPurchaseOrder(
  po: Partial<PurchaseOrder>,
  lineItems: Partial<PurchaseOrderLineItem>[],
  userId: string
): Promise<PurchaseOrder> {
  // Get next PO number
  const poNumber = await getNextPoNumber();

  // Calculate totals
  const subtotal = lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
  const vatRate = po.vat_rate || 20;
  const vatAmount = subtotal * (vatRate / 100);
  const totalAmount = subtotal + vatAmount;

  // Create purchase order
  const insertData = {
    po_number: poNumber,
    supplier_id: po.supplier_id!,
    order_date: po.order_date || new Date().toISOString().split("T")[0],
    expected_delivery_date: po.expected_delivery_date || null,
    delivery_address: po.delivery_address || null,
    reference: po.reference || null,
    notes: po.notes || null,
    subtotal,
    vat_amount: vatAmount,
    total_amount: totalAmount,
    vat_rate: vatRate,
    created_by: userId,
  };

  const { data: poData, error: poError } = await supabase
    .from("purchase_orders")
    .insert(insertData)
    .select()
    .single();

  if (poError) throw poError;

  // Create line items
  if (lineItems.length > 0) {
    const itemsToInsert = lineItems.map((item, index) => ({
      description: item.description!,
      quantity: item.quantity || 1,
      unit_price: item.unit_price || 0,
      total_price: item.total_price || 0,
      account_code: item.account_code || null,
      purchase_order_id: poData.id,
      sort_order: index,
    }));

    const { error: itemsError } = await supabase
      .from("purchase_order_line_items")
      .insert(itemsToInsert);

    if (itemsError) throw itemsError;
  }

  return poData as PurchaseOrder;
}

export async function updatePurchaseOrder(
  id: string,
  po: Partial<PurchaseOrder>,
  lineItems?: Partial<PurchaseOrderLineItem>[]
): Promise<PurchaseOrder> {
  // Build update data
  const updateData: Record<string, unknown> = {};
  if (po.status !== undefined) updateData.status = po.status;
  if (po.order_date !== undefined) updateData.order_date = po.order_date;
  if (po.expected_delivery_date !== undefined) updateData.expected_delivery_date = po.expected_delivery_date;
  if (po.delivery_address !== undefined) updateData.delivery_address = po.delivery_address;
  if (po.reference !== undefined) updateData.reference = po.reference;
  if (po.notes !== undefined) updateData.notes = po.notes;
  if (po.vat_rate !== undefined) updateData.vat_rate = po.vat_rate;
  if (po.xero_purchase_order_id !== undefined) updateData.xero_purchase_order_id = po.xero_purchase_order_id;
  if (po.xero_status !== undefined) updateData.xero_status = po.xero_status;
  if (po.synced_at !== undefined) updateData.synced_at = po.synced_at;

  // Calculate totals if line items provided
  if (lineItems) {
    const subtotal = lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
    const vatRate = po.vat_rate || 20;
    const vatAmount = subtotal * (vatRate / 100);
    const totalAmount = subtotal + vatAmount;
    updateData.subtotal = subtotal;
    updateData.vat_amount = vatAmount;
    updateData.total_amount = totalAmount;
  }

  const { data, error } = await supabase
    .from("purchase_orders")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  // Update line items if provided
  if (lineItems) {
    // Delete existing items
    await supabase
      .from("purchase_order_line_items")
      .delete()
      .eq("purchase_order_id", id);

    // Insert new items
    if (lineItems.length > 0) {
      const itemsToInsert = lineItems.map((item, index) => ({
        description: item.description!,
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        total_price: item.total_price || 0,
        account_code: item.account_code || null,
        purchase_order_id: id,
        sort_order: index,
      }));

      await supabase
        .from("purchase_order_line_items")
        .insert(itemsToInsert);
    }
  }

  return data as PurchaseOrder;
}

export async function deletePurchaseOrderFromXero(
  xero_purchase_order_id: string
): Promise<{ success: boolean; message: string; xero_status: string }> {
  const { data, error } = await supabase.functions.invoke("xero-delete-purchase-order", {
    body: {
      xero_purchase_order_id,
    },
  });

  if (error) throw error;
  if (data.error) throw new Error(data.error);

  return data;
}

export async function deletePurchaseOrder(id: string, xero_purchase_order_id?: string | null): Promise<void> {
  // If synced to Xero, delete/void there first
  if (xero_purchase_order_id) {
    await deletePurchaseOrderFromXero(xero_purchase_order_id);
  }

  // First delete line items
  await supabase
    .from("purchase_order_line_items")
    .delete()
    .eq("purchase_order_id", id);

  // Then delete the PO
  const { error } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function copyPurchaseOrder(
  originalPo: PurchaseOrder,
  userId: string
): Promise<PurchaseOrder> {
  // Get next PO number
  const poNumber = await getNextPoNumber();

  // Calculate totals from original line items
  const lineItems = originalPo.line_items || [];
  const subtotal = lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
  const vatRate = originalPo.vat_rate || 20;
  const vatAmount = subtotal * (vatRate / 100);
  const totalAmount = subtotal + vatAmount;

  // Create new purchase order with new number
  const insertData = {
    po_number: poNumber,
    supplier_id: originalPo.supplier_id,
    order_date: new Date().toISOString().split("T")[0], // Today's date
    expected_delivery_date: null, // Reset expected delivery
    delivery_address: originalPo.delivery_address || null,
    reference: originalPo.reference ? `Copy of ${originalPo.reference}` : null,
    notes: originalPo.notes || null,
    subtotal,
    vat_amount: vatAmount,
    total_amount: totalAmount,
    vat_rate: vatRate,
    status: "draft", // Always start as draft
    created_by: userId,
  };

  const { data: poData, error: poError } = await supabase
    .from("purchase_orders")
    .insert(insertData)
    .select()
    .single();

  if (poError) throw poError;

  // Copy line items
  if (lineItems.length > 0) {
    const itemsToInsert = lineItems.map((item, index) => ({
      description: item.description,
      quantity: item.quantity || 1,
      unit_price: item.unit_price || 0,
      total_price: item.total_price || 0,
      account_code: item.account_code || null,
      purchase_order_id: poData.id,
      sort_order: index,
    }));

    const { error: itemsError } = await supabase
      .from("purchase_order_line_items")
      .insert(itemsToInsert);

    if (itemsError) throw itemsError;
  }

  return poData as PurchaseOrder;
}

export async function syncPurchaseOrderToXero(
  purchaseOrder: PurchaseOrder
): Promise<{ xero_purchase_order_id: string; xero_status: string }> {
  if (!purchaseOrder.supplier?.xero_contact_id) {
    throw new Error("Supplier must be linked to Xero to sync purchase order");
  }

  const { data, error } = await supabase.functions.invoke("xero-create-purchase-order", {
    body: {
      supplier_xero_contact_id: purchaseOrder.supplier.xero_contact_id,
      po_number: purchaseOrder.po_number,
      order_date: purchaseOrder.order_date,
      expected_delivery_date: purchaseOrder.expected_delivery_date,
      reference: purchaseOrder.reference,
      line_items: purchaseOrder.line_items?.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        account_code: item.account_code,
      })) || [],
    },
  });

  if (error) throw error;
  if (data.error) throw new Error(data.error);

  // Update local record with Xero IDs
  await supabase
    .from("purchase_orders")
    .update({
      xero_purchase_order_id: data.xero_purchase_order_id,
      xero_status: data.xero_status,
      synced_at: new Date().toISOString(),
      status: "sent",
    })
    .eq("id", purchaseOrder.id);

  return data;
}

export async function fetchXeroSuppliers(): Promise<Partial<Supplier>[]> {
  const { data, error } = await supabase.functions.invoke("xero-suppliers");

  if (error) throw error;
  if (data.error) throw new Error(data.error);

  return data.suppliers || [];
}

export async function importSupplierFromXero(
  xeroSupplier: Partial<Supplier>,
  userId: string
): Promise<Supplier> {
  // Check if already imported
  const { data: existing } = await supabase
    .from("suppliers")
    .select("id")
    .eq("xero_contact_id", xeroSupplier.xero_contact_id)
    .single();

  if (existing) {
    throw new Error("Supplier already imported from Xero");
  }

  return createSupplier(xeroSupplier, userId);
}

export async function updatePurchaseOrderStatusInXero(
  xero_purchase_order_id: string,
  status: "DRAFT" | "SUBMITTED" | "AUTHORISED" | "BILLED" | "DELETED"
): Promise<{ xero_status: string }> {
  const { data, error } = await supabase.functions.invoke("xero-update-purchase-order-status", {
    body: {
      xero_purchase_order_id,
      status,
    },
  });

  if (error) throw error;
  if (data.error) throw new Error(data.error);

  return data;
}

export const PO_STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  sent: { label: "Sent", variant: "default" },
  received: { label: "Received", variant: "default" },
  paid: { label: "Paid", variant: "outline" },
  cancelled: { label: "Voided", variant: "destructive" },
};