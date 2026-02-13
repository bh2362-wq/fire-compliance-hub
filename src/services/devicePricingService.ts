import { supabase } from "@/integrations/supabase/client";

export interface DevicePriceList {
  id: string;
  name: string;
  customer_id: string | null;
  site_id: string | null;
  source_file_name: string | null;
  source_file_type: string | null;
  status: string;
  total_items: number;
  total_cost: number;
  total_sell: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SupplierPrice {
  name: string;
  url?: string;
  estimated_price: number;
}

export interface DevicePriceItem {
  id: string;
  price_list_id: string;
  model_number: string | null;
  description: string;
  device_type: string | null;
  location: string | null;
  quantity: number;
  cost_price: number;
  markup_percent: number;
  sell_price: number;
  labour_cost: number;
  ai_search_status: string;
  ai_price_results: SupplierPrice[];
  merged_from: string[] | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function createPriceList(params: {
  name: string;
  customerId?: string;
  siteId?: string;
  sourceFileName?: string;
  sourceFileType?: string;
}): Promise<{ data: DevicePriceList | null; error: Error | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error("Not authenticated") };

  const { data, error } = await supabase
    .from("device_price_lists")
    .insert({
      name: params.name,
      customer_id: params.customerId || null,
      site_id: params.siteId || null,
      source_file_name: params.sourceFileName || null,
      source_file_type: params.sourceFileType || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { data: null, error };
  return { data: data as DevicePriceList, error: null };
}

export async function addPriceItems(
  priceListId: string,
  items: Array<{
    model_number?: string;
    description: string;
    device_type?: string;
    location?: string;
    quantity: number;
  }>
): Promise<{ error: Error | null }> {
  const toInsert = items.map((item, i) => ({
    price_list_id: priceListId,
    model_number: item.model_number || null,
    description: item.description,
    device_type: item.device_type || null,
    location: item.location || null,
    quantity: item.quantity,
    sort_order: i,
  }));

  // Batch insert
  const batchSize = 100;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize);
    const { error } = await supabase.from("device_price_items").insert(batch);
    if (error) return { error };
  }

  // Update total_items
  await supabase
    .from("device_price_lists")
    .update({ total_items: items.length })
    .eq("id", priceListId);

  return { error: null };
}

export async function getPriceLists(): Promise<{ data: DevicePriceList[]; error: Error | null }> {
  const { data, error } = await supabase
    .from("device_price_lists")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { data: [], error };
  return { data: data as DevicePriceList[], error: null };
}

export async function getPriceListWithItems(id: string): Promise<{
  priceList: DevicePriceList | null;
  items: DevicePriceItem[];
  error: Error | null;
}> {
  const [listRes, itemsRes] = await Promise.all([
    supabase.from("device_price_lists").select("*").eq("id", id).single(),
    supabase
      .from("device_price_items")
      .select("*")
      .eq("price_list_id", id)
      .order("sort_order"),
  ]);

  if (listRes.error) return { priceList: null, items: [], error: listRes.error };

  return {
    priceList: listRes.data as DevicePriceList,
    items: (itemsRes.data || []) as unknown as DevicePriceItem[],
    error: null,
  };
}

export async function updatePriceItem(
  id: string,
  updates: Partial<{
    cost_price: number;
    markup_percent: number;
    sell_price: number;
    labour_cost: number;
    quantity: number;
    description: string;
    model_number: string;
    ai_search_status: string;
    ai_price_results: any;
  }>
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("device_price_items")
    .update(updates)
    .eq("id", id);
  return { error };
}

export async function mergeItems(
  priceListId: string,
  itemIds: string[],
  items: DevicePriceItem[]
): Promise<{ error: Error | null }> {
  const toMerge = items.filter((i) => itemIds.includes(i.id));
  if (toMerge.length < 2) return { error: new Error("Select at least 2 items to merge") };

  const primary = toMerge[0];
  const totalQty = toMerge.reduce((sum, i) => sum + i.quantity, 0);

  // Update primary with combined quantity
  await supabase
    .from("device_price_items")
    .update({
      quantity: totalQty,
      merged_from: toMerge.map((i) => i.id),
      sell_price: primary.cost_price * (1 + primary.markup_percent / 100) * totalQty + primary.labour_cost,
    })
    .eq("id", primary.id);

  // Delete the others
  const otherIds = itemIds.filter((id) => id !== primary.id);
  await supabase.from("device_price_items").delete().in("id", otherIds);

  return { error: null };
}

export async function deletePriceList(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("device_price_lists").delete().eq("id", id);
  return { error };
}

export async function searchDevicePrices(
  devices: Array<{ model_number?: string; description: string; quantity: number }>
): Promise<{ results: any[]; error: Error | null }> {
  const { data, error } = await supabase.functions.invoke("search-device-prices", {
    body: { devices },
  });

  if (error) return { results: [], error };
  if (data?.error) return { results: [], error: new Error(data.error) };
  return { results: data?.results || [], error: null };
}

export async function updatePriceListTotals(priceListId: string): Promise<void> {
  const { data: items } = await supabase
    .from("device_price_items")
    .select("cost_price, sell_price, quantity")
    .eq("price_list_id", priceListId);

  if (!items) return;

  const totalCost = items.reduce((s, i) => s + (Number(i.cost_price) || 0) * (i.quantity || 1), 0);
  const totalSell = items.reduce((s, i) => s + (Number(i.sell_price) || 0), 0);

  await supabase
    .from("device_price_lists")
    .update({ total_cost: totalCost, total_sell: totalSell, total_items: items.length })
    .eq("id", priceListId);
}
