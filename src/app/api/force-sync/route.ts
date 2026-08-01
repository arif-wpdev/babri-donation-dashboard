import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWooCommerceClient } from "@/lib/woocommerce";
import { processWooCommerceOrder, recalculateDonorStats } from "@/lib/sync/process-order";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");
  
  if (action === "sync") {
    const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
    try {
      const org = await prisma.organization.findFirst();
      if (!org) return Response.json({ error: "No org found" }, { status: 400 });
      
      const client = createWooCommerceClient({
        wcBaseUrl: org.wcBaseUrl,
        wcConsumerKey: org.wcConsumerKey,
        wcConsumerSecret: org.wcConsumerSecret,
      });
      const response = await client.get("orders", { status: "any", per_page: 50, page });
      const orders = response.data;
      
      let added = 0;
      let updated = 0;
      for (const order of orders) {
        const res = await processWooCommerceOrder(order, org.id);
        if (res === "added") added++;
        if (res === "updated") updated++;
      }
      
      if (orders.length > 0) {
        await recalculateDonorStats(org.id);
      }
      
      return Response.json({ page, processed: orders.length, added, updated, hasMore: orders.length === 50 });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      return Response.json({ error: errorMessage }, { status: 500 });
    }
  }

  // HTML UI for auto-syncing
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Massive Sync Tool</title>
      <style>
        body { font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; line-height: 1.6; }
        .log { background: #f4f4f5; padding: 10px; height: 300px; overflow-y: auto; font-family: monospace; font-size: 12px; margin-top: 20px; border-radius: 8px; }
        button { background: #0D472B; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold; }
        button:disabled { background: #9ca3af; }
      </style>
    </head>
    <body>
      <h2>Background Sync Tool</h2>
      <p>Since there are 4,000 orders, syncing them all at once times out. Click the button below to sync them in batches of 50. Keep this page open until it finishes.</p>
      <button id="startBtn">Start Sync</button>
      <div id="log" class="log">Ready to start...<br></div>
      
      <script>
        const btn = document.getElementById("startBtn");
        const logDiv = document.getElementById("log");
        
        function log(msg) {
          logDiv.innerHTML += msg + "<br>";
          logDiv.scrollTop = logDiv.scrollHeight;
        }
        
        async function syncPage(page) {
          log("Fetching page " + page + " (50 orders)...");
          try {
            const res = await fetch("/api/force-sync?action=sync&page=" + page);
            const data = await res.json();
            
            if (data.error) {
              log("<span style='color:red'>Error: " + data.error + "</span>");
              btn.disabled = false;
              return;
            }
            
            log("<span style='color:green'>Success!</span> Added: " + data.added + ", Updated: " + data.updated);
            
            if (data.hasMore) {
              syncPage(page + 1);
            } else {
              log("<strong>All done! All orders have been synced.</strong>");
              btn.disabled = false;
            }
          } catch (e) {
            log("<span style='color:red'>Request failed: " + e.message + "</span>");
            btn.disabled = false;
          }
        }
        
        btn.onclick = () => {
          btn.disabled = true;
          log("Starting massive sync...");
          syncPage(1);
        };
      </script>
    </body>
    </html>
  `;
  
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
