/**
 * Invoice agent adapter. UI never calls the edge function directly — it goes
 * through `getInvoiceAgent()` so the runtime can move (edge, Cloud Run) without
 * touching components.
 */
import { supabase } from "@/shared/integrations/supabase/client";
import type { IInvoiceAgentProvider, InvoiceDraftResult } from "../types";

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let details = error.message;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.text === "function") {
        const text = await ctx.text();
        const parsed = JSON.parse(text);
        details = parsed?.error || text || details;
      }
    } catch {
      /* keep original message */
    }
    throw new Error(details);
  }
  return data as T;
}

export const edgeInvoiceAgent: IInvoiceAgentProvider = {
  id: "edge-invoice-agent",

  async draftInvoice(prompt: string): Promise<InvoiceDraftResult> {
    const data = await invoke<InvoiceDraftResult & { ok: boolean; error?: string }>("invoice-agent", { prompt });
    if (!data?.ok) throw new Error(data?.error || "The assistant could not draft this invoice.");
    return data;
  },

  async sendInvoice(invoiceId: string) {
    const data = await invoke<{ ok: boolean; error?: string; publicUrl?: string; status?: string }>(
      "square-service",
      { action: "sendInvoice", invoiceId },
    );
    if (!data?.ok) throw new Error(data?.error || "Square rejected this invoice.");
    return data;
  },

  async refreshInvoice(invoiceId: string) {
    const data = await invoke<{ ok: boolean; error?: string; status?: string }>("square-service", {
      action: "refreshInvoice",
      invoiceId,
    });
    if (!data?.ok) throw new Error(data?.error || "Could not refresh this invoice.");
    return data;
  },

  async cancelInvoice(invoiceId: string) {
    const data = await invoke<{ ok: boolean; error?: string }>("square-service", {
      action: "cancelInvoice",
      invoiceId,
    });
    if (!data?.ok) throw new Error(data?.error || "Could not cancel this invoice.");
    return data;
  },

  async markSentManually(invoiceId: string) {
    const data = await invoke<{ ok: boolean; error?: string; status?: string }>("square-service", {
      action: "markSentManually",
      invoiceId,
    });
    if (!data?.ok) throw new Error(data?.error || "Could not issue this invoice.");
    return data;
  },

  async markPaidManually(invoiceId: string, reference?: string) {
    const data = await invoke<{ ok: boolean; error?: string; status?: string }>("square-service", {
      action: "markPaidManually",
      invoiceId,
      reference,
    });
    if (!data?.ok) throw new Error(data?.error || "Could not mark this invoice paid.");
    return data;
  },


  async deleteInvoice(invoiceId: string) {
    const data = await invoke<{ ok: boolean; error?: string }>("square-service", {
      action: "deleteInvoice",
      invoiceId,
    });
    if (!data?.ok) throw new Error(data?.error || "Could not delete this invoice.");
    return data;
  },

  async syncService(serviceId: string) {
    const data = await invoke<{ ok: boolean; error?: string; squareId?: string }>("square-service", {
      action: "syncService",
      serviceId,
    });
    if (!data?.ok) throw new Error(data?.error || "Could not sync this service to Square.");
    return data;
  },

  async deleteService(serviceId: string) {
    const data = await invoke<{ ok: boolean; error?: string }>("square-service", {
      action: "deleteService",
      serviceId,
    });
    if (!data?.ok) throw new Error(data?.error || "Could not delete this service.");
    return data;
  },


  async getStatus() {
    const data = await invoke<{ ok: boolean; configured?: boolean; environment?: string }>("square-service", {
      action: "status",
    });
    return { configured: Boolean(data?.configured), environment: data?.environment || "sandbox" };
  },
};
