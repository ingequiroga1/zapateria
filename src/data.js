import { removeDemoSupplier } from "./productFilters.js";
import { applyDemoReturn, demoSaleLines } from "./returnDomain.js";
import { createClient } from "@supabase/supabase-js";
import {
  applyDemoSale,
  applyDemoEntry,
  migrateDemoSuppliers,
  saveDemoProduct,
} from "./domain";
import { readConnectionConfig } from "./connectionConfig.js";
const DEMO_KEY = "piel.demo.v1";
export function getConfig() {
  return readConnectionConfig(import.meta.env);
}
export function makeClient(c) {
  return !c.error && !c.demo ? createClient(c.url, c.key) : null;
}
export const initialDemo = () => ({
  suppliers: [{ id: "demo-supplier", name: "Pieles del Bajío" }],
  products: [],
  entries: [],
});
export function readDemo() {
  try {
    const d = JSON.parse(localStorage.getItem(DEMO_KEY));
    return d?.entries && d?.products && d?.suppliers
      ? migrateDemoSuppliers(d)
      : initialDemo();
  } catch {
    return initialDemo();
  }
}
export function writeDemo(d) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(d));
  return d;
}
export async function loadData(client) {
  if (!client) return readDemo();
  const results = await Promise.all([
    client.from("suppliers").select("*").order("name"),
    client
      .from("products")
      .select("*,product_suppliers(supplier_id)")
      .order("name"),
    client
      .from("entries")
      .select("*,items:entry_items(*)")
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("sales")
      .select("*,items:sale_items(*)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  for (const r of results)
    if (r.error) {
      if (["PGRST200", "42P01"].includes(r.error.code))
        throw Error(
          "Actualiza tu base de datos con la migración 002 de productos y la 003 de ventas, incluidas en el proyecto.",
        );
      throw r.error;
    }
  return {
    suppliers: results[0].data,
    products: results[1].data.map((p) => ({
      ...p,
      supplier_ids: p.product_suppliers.map((r) => r.supplier_id),
    })),
    entries: results[2].data,
    sales: results[3].data,
  };
}
export async function addSupplier(client, name, userId) {
  if (!client) {
    const state = readDemo();
    const s = { id: crypto.randomUUID(), name };
    writeDemo({ ...state, suppliers: [...state.suppliers, s] });
    return s;
  }
  const { data, error } = await client
    .from("suppliers")
    .insert({ name, owner_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}
export async function uploadImage(client, file, userId) {
  if (!["image/jpeg", "image/png"].includes(file.type))
    throw Error("Elige una imagen JPG o PNG.");
  if (file.size > 5 * 1024 * 1024)
    throw Error("La imagen debe pesar máximo 5 MB.");
  if (!client)
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  const path =
    userId +
    "/" +
    crypto.randomUUID() +
    "." +
    (file.type === "image/png" ? "png" : "jpg");
  const { error } = await client.storage
    .from("product-images")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}
export async function imageUrl(client, path) {
  if (!path) return "";
  if (!client) return path;
  const { data, error } = await client.storage
    .from("product-images")
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
export async function confirmEntry(client, payload) {
  if (!client) {
    const result = applyDemoEntry(readDemo(), payload);
    writeDemo(result.state);
    return result.entry;
  }
  const { data, error } = await client.rpc("receive_merchandise", {
    p_id: payload.id,
    p_supplier_id: payload.supplier_id,
    p_date: payload.entry_date,
    p_reference: payload.reference,
    p_notes: payload.notes,
    p_items: payload.items.map(
      ({ kind, name, color, size, quantity, cost, price, image_path }) => ({
        kind,
        name,
        color,
        size,
        quantity: Number(quantity),
        cost: Number(cost),
        price: Number(price),
        image_path: image_path || null,
      }),
    ),
  });
  if (error) throw error;
  return data;
}

export async function registerProduct(client, product, supplierIds) {
  if (!client) {
    const r = saveDemoProduct(readDemo(), product, supplierIds);
    writeDemo(r.state);
    return r.product;
  }
  const { data, error } = await client.rpc("register_product", {
    p_id: product.id,
    p_product: {
      kind: product.kind,
      name: product.name,
      color: product.color,
      size: product.size,
      cost: Number(product.cost),
      price: Number(product.price),
      image_path: product.image_path || null,
    },
    p_supplier_ids: supplierIds,
  });
  if (error) throw error;
  return data;
}

export async function confirmSale(client, payload) {
  if (!client) {
    const result = applyDemoSale(readDemo(), payload);
    writeDemo(result.state);
    return result.sale;
  }
  const { data, error } = await client.rpc("register_sale", {
    p_id: payload.id,
    p_date: payload.sale_date,
    p_payment: payload.payment_method,
    p_items: payload.items.map((r) => ({
      product_id: r.product_id,
      quantity: Number(r.quantity),
      price: Number(r.price),
    })),
  });
  if (error) throw error;
  return data;
}

export async function loadReportData(client, from, to) {
  if (!client) {
    const sales = (readDemo().sales || []).filter(
      (s) => s.sale_date >= from && s.sale_date <= to,
    );
    return {
      sales,
      items: sales.flatMap((s) =>
        s.items.map((i) => ({ ...i, sale_id: s.id })),
      ),
    };
  }
  async function pages(query) {
    const all = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await query().range(offset, offset + 499);
      if (error) throw error;
      all.push(...data);
      if (data.length < 500) return all;
    }
  }
  const [sales, items] = await Promise.all([
    pages(() =>
      client
        .from("sales")
        .select("id,sale_date,total")
        .gte("sale_date", from)
        .lte("sale_date", to)
        .order("id"),
    ),
    pages(() =>
      client
        .from("sale_items")
        .select(
          "id,sale_id,product_id,kind,name,color,size,quantity,price,sales!inner(sale_date)",
        )
        .gte("sales.sale_date", from)
        .lte("sales.sale_date", to)
        .order("id"),
    ),
  ]);
  return { sales, items };
}

export async function allPages(query) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query().range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export async function getReturnContext(client, saleId) {
  if (!client) {
    const state = readDemo(),
      s = (state.sales || []).find((s) => s.id === saleId);
    if (!s) throw Error("Venta no encontrada.");
    return {
      sale: demoSaleLines(s),
      returns: (state.returns || []).filter((r) => r.sale_id === saleId),
    };
  }
  const { data: sale, error } = await client
    .from("sales")
    .select("*,items:sale_items(*)")
    .eq("id", saleId)
    .single();
  if (error) throw error;
  const returns = await allPages(() =>
    client
      .from("returns")
      .select("*,items:return_items(*)")
      .eq("sale_id", saleId)
      .order("id"),
  );
  return { sale, returns };
}
export async function findSales(client, query) {
  if (!client)
    return (readDemo().sales || [])
      .filter(
        (s) =>
          s.folio.toLowerCase().includes(query.toLowerCase()) ||
          s.sale_date === query,
      )
      .slice(0, 100);
  let req = client
    .from("sales")
    .select("id,folio,sale_date,total")
    .order("created_at", { ascending: false })
    .limit(100);
  if (/^\d{4}-\d{2}-\d{2}$/.test(query)) req = req.eq("sale_date", query);
  else if (query)
    req = req.ilike("folio", "%" + query.replace(/[%_,()]/g, "") + "%");
  const { data, error } = await req;
  if (error) throw error;
  return data;
}
export async function recentReturns(client) {
  if (!client) return (readDemo().returns || []).slice(0, 100);
  const { data, error } = await client
    .from("returns")
    .select("*,items:return_items(*)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}
export async function confirmReturn(client, payload) {
  if (!client) {
    const r = applyDemoReturn(readDemo(), payload);
    writeDemo(r.state);
    return r.returned;
  }
  const { data, error } = await client.rpc("register_return", {
    p_id: payload.id,
    p_sale_id: payload.sale_id,
    p_date: payload.return_date,
    p_reason: payload.reason,
    p_refund_method: payload.refund_method,
    p_notes: payload.notes,
    p_items: payload.items,
  });
  if (error) throw error;
  return data;
}
export async function returnReportData(client, from, to) {
  if (!client) {
    const returns = (readDemo().returns || []).filter(
      (r) => r.return_date >= from && r.return_date <= to,
    );
    return {
      returns,
      returnItems: returns.flatMap((r) =>
        r.items.map((i) => ({ ...i, return_id: r.id })),
      ),
    };
  }
  const [returns, returnItems] = await Promise.all([
    allPages(() =>
      client
        .from("returns")
        .select("id,return_date,total")
        .gte("return_date", from)
        .lte("return_date", to)
        .order("id"),
    ),
    allPages(() =>
      client
        .from("return_items")
        .select("*,returns!inner(return_date)")
        .gte("returns.return_date", from)
        .lte("returns.return_date", to)
        .order("id"),
    ),
  ]);
  return { returns, returnItems };
}

export async function deleteSupplier(client, id) {
  if (!client) {
    writeDemo(removeDemoSupplier(readDemo(), id));
    return;
  }
  const { error } = await client.rpc("delete_supplier", { p_id: id });
  if (error) {
    if (error.code === "PGRST202")
      throw Error(
        "Ejecuta la migración 005_supplier_delete.sql en Supabase para habilitar la eliminación.",
      );
    throw error;
  }
}
