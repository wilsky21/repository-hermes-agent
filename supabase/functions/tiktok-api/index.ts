import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store"},
});

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function tiktokSignature(secret: string, path: string, params: Record<string,string>, body="") {
  const keys = Object.keys(params).filter(k=>k!=="sign" && k!=="access_token").sort();
  const sortedQuery = keys.map(k=>k+params[k]).join("");
  return hmacSha256Hex(secret, secret + path + sortedQuery + body + secret);
}

function unix(value: unknown, fallback?: number) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "number") return Math.floor(value);
  const n = Number(value);
  if (Number.isFinite(n)) return Math.floor(n);
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new Error("invalid_time");
  return Math.floor(d.getTime()/1000);
}

function isoFromSeconds(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n*1000).toISOString() : null;
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const logPrefix = `[TIKTOK-API:${requestId}]`;
  
  if (req.method !== "POST") return json({ok:false,error:"method_not_allowed",request_id:requestId},405);
  try {
    const body = await req.json().catch(()=>({}));
    const action = String(body?.action || "");
    
    console.log(`${logPrefix} Action: ${action}`);
    
    const appKey = Deno.env.get("TIKTOK_APP_KEY");
    const appSecret = Deno.env.get("TIKTOK_APP_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!appKey || !appSecret || !supabaseUrl || !serviceKey)
      return json({ok:false,error:"configuration_incomplete",request_id:requestId},503);

    const rpc = async (name:string, payload:Record<string,unknown>) => {
      const r = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`,{
        method:"POST",
        headers:{"content-type":"application/json","apikey":serviceKey,"authorization":`Bearer ${serviceKey}`},
        body:JSON.stringify(payload),
      });
      const t=await r.text(); let data:unknown=null; try {data=t?JSON.parse(t):null;} catch {}
      return {ok:r.ok,status:r.status,data};
    };

    if (action === "health") return json({ok:true,service:"tiktok-api",status:"ready",request_id:requestId,timestamp:new Date().toISOString()});
    const allowed = ["health","orders","audit_orders","order","finance","tracking","affiliate_creator_performance","shop_live_performance","shop_product_performance","shop_video_performance","finance_overview"];
    if (!allowed.includes(action)) return json({ok:false,error:"unsupported_action",allowed_actions:allowed,request_id:requestId},400);

    const auth = await rpc("tiktok_get_authorization", {p_shop_id: body?.shop_id ?? null});
    if (!auth.ok || !Array.isArray(auth.data) || auth.data.length===0)
      return json({ok:false,error:"tiktok_authorization_not_found",request_id:requestId},503);

    let shop = auth.data[0] as Record<string,unknown>;
    let accessToken = String(shop.access_token || "");
    const shopCipher = String(shop.shop_cipher || "");
    if (!accessToken || !shopCipher) return json({ok:false,error:"tiktok_credentials_incomplete",request_id:requestId},503);

    const refreshToken = async () => {
      const rt = String(shop.refresh_token || "");
      if (!rt) return false;
      const u = new URL("https://auth.tiktok-shops.com/api/v2/token/refresh");
      u.searchParams.set("app_key",appKey);
      u.searchParams.set("app_secret",appSecret);
      u.searchParams.set("refresh_token",rt);
      u.searchParams.set("grant_type","refresh_token");
      const resp = await fetch(u.toString(),{method:"GET",headers:{"content-type":"application/json"}});
      const data = await resp.json().catch(()=>null);
      if (resp.status<200 || resp.status>=300 || data?.code!==0) return false;
      const d = data?.data ?? data;
      const newAccess = String(d?.access_token || "");
      const newRefresh = String(d?.refresh_token || rt);
      if (!newAccess) return false;
      const granted = Array.isArray(d?.granted_scopes) ? d.granted_scopes.map(String) : null;
      const accessExp = Number(d?.access_token_expire_in ?? d?.expires_in ?? 0);
      const refreshExp = Number(d?.refresh_token_expire_in ?? 0);
      await rpc("tiktok_update_tokens", {
        p_shop_id:String(shop.shop_id),
        p_access_token:newAccess,
        p_refresh_token:newRefresh,
        p_access_token_expires_at:isoFromSeconds(accessExp ? Math.floor(Date.now()/1000)+accessExp : 0),
        p_refresh_token_expires_at:isoFromSeconds(refreshExp ? Math.floor(Date.now()/1000)+refreshExp : 0),
        p_granted_scopes:granted,
      });
      accessToken = newAccess;
      shop = {...shop,access_token:newAccess,refresh_token:newRefresh,granted_scopes:granted ?? shop.granted_scopes};
      return true;
    };

    const callTikTok = async (path:string, method:"GET"|"POST", query:Record<string,string>, payload?:unknown, allowRefresh=true) => {
      const timestamp = Math.floor(Date.now()/1000).toString();
      const params = {...query, app_key:appKey, timestamp, shop_cipher:shopCipher};
      const requestBody = method==="POST" ? JSON.stringify(payload ?? {}) : "";
      const sign = await tiktokSignature(appSecret,path,params,requestBody);
      const u = new URL("https://open-api.tiktokglobalshop.com"+path);
      for (const [k,v] of Object.entries({...params,sign})) u.searchParams.set(k,v);
      const resp = await fetch(u.toString(),{method,headers:{"content-type":"application/json","x-tts-access-token":accessToken},body:method==="POST"?requestBody:undefined});
      const data = await resp.json().catch(()=>null);
      const expired = data?.code===105002 || resp.status===401;
      if (expired && allowRefresh && await refreshToken()) return callTikTok(path,method,query,payload,false);
      return {http_status:resp.status,data};
    };

    // FINANCE OVERVIEW dengan endpoint unsettled yang benar [11]
    if (action === "finance_overview") {
      const start = String(body?.start_date || "").trim();
      const end = String(body?.end_date || "").trim();
      console.log(`${logPrefix} finance_overview: start_date=${start}, end_date=${end}`);
      
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end))
        return json({ok:false,error:"start_date_end_date_required",request_id:requestId},400);
      
      const dayStartUnix = (d:string) => Math.floor(new Date(d+"T00:00:00+07:00").getTime()/1000);
      const rangeGe = dayStartUnix(start);
      const rangeLt = dayStartUnix(end) + 86400;
      const currency = String(body?.currency || "LOCAL");

      const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
      const findKey=(obj:any,aliases:string[]):any=>{
        const wanted=new Set(aliases.map(norm));
        const seen=new Set<any>();
        const walk=(x:any):any=>{
          if(!x||typeof x!=="object"||seen.has(x)) return undefined;
          seen.add(x);
          if(Array.isArray(x)){for(const y of x){const z=walk(y);if(z!==undefined)return z;}return undefined;}
          for(const [k,v] of Object.entries(x)){if(wanted.has(norm(k)))return v;}
          for(const v of Object.values(x)){const z=walk(v);if(z!==undefined)return z;}
          return undefined;
        };
        return walk(obj);
      };
      
      const amount=(v:any):number|null=>{
        if(v===null||v===undefined)return null;
        if(typeof v==="object") return amount((v as any).amount??(v as any).value);
        const n=Number(v); return Number.isFinite(n)?n:null;
      };
      
      const textOf=(row:any,aliases:string[])=>{const v=findKey(row,aliases); return v===undefined||v===null||v===""?null:String(v);};
      const numOf=(row:any,aliases:string[])=>amount(findKey(row,aliases));

      const paginate = async (path:string, baseQuery:Record<string,string>, arrayAliases:string[], cap=20) => {
        const rows:any[]=[]; let token=""; let pages=0; let lastErr:any=null;
        for(let i=0;i<cap;i++){
          const query:Record<string,string>={...baseQuery}; if(token) query.page_token=token;
          let result;
          try{ result = await callTikTok(path,"GET",query); }
          catch(e){ lastErr={exception:String(e instanceof Error?e.message:e)}; break; }
          const ok = result.http_status>=200 && result.http_status<300 && result.data?.code===0;
          if(!ok){ lastErr={http_status:result.http_status,data:result.data}; break; }
          const pageData = result.data?.data ?? {};
          let arr = findKey(pageData, arrayAliases);
          if (!Array.isArray(arr) && Array.isArray(pageData)) arr = pageData;
          if (!Array.isArray(arr) && pageData && typeof pageData === "object") {
            const arrayValued = Object.values(pageData).filter((v)=>Array.isArray(v));
            if (arrayValued.length === 1) arr = arrayValued[0];
          }
          const list = Array.isArray(arr) ? arr : [];
          rows.push(...list); pages++;
          console.log(`${logPrefix} Page ${pages}: got ${list.length} rows`);
          const nextToken = String(pageData?.next_page_token ?? pageData?.page_token ?? "");
          if(!nextToken || !list.length || nextToken===token) break;
          token = nextToken;
        }
        return {rows, pages, error: rows.length? null : lastErr};
      };

      const sumBy = (rows:any[], amountAliases:string[], statusAliases:string[]) => {
        const byStatus:Record<string,{count:number, amount:number}> = {};
        let total=0;
        for(const r of rows){
          const amt = numOf(r, amountAliases) ?? 0;
          const st = textOf(r, statusAliases) || "UNKNOWN";
          total += amt;
          byStatus[st] = byStatus[st] || {count:0, amount:0};
          byStatus[st].count++; byStatus[st].amount += amt;
        }
        return {total_amount: total, count: rows.length, by_status: byStatus};
      };

      console.log(`${logPrefix} Fetching statements (selesai/settled)...`);
      const statements = await paginate(
        "/finance/202309/statements",
        {statement_time_ge:String(rangeGe), statement_time_lt:String(rangeLt), page_size:"100", sort_field:"statement_time", sort_order:"DESC"},
        ["statements","records","list","data"]
      );
      
      console.log(`${logPrefix} Fetching unsettled transactions (untuk dibayar)...`);
      const unsettled = await paginate(
        "/finance/202507/orders/unsettled",
        {search_time_ge:String(rangeGe), search_time_lt:String(rangeLt), page_size:"100", sort_field:"order_create_time", sort_order:"DESC"},
        ["transactions","records","list","data"]
      );
      
      console.log(`${logPrefix} Fetching withdrawals (sudah dicairkan)...`);
      const withdrawals = await paginate(
        "/finance/202309/withdrawals",
        {create_time_ge:String(rangeGe), create_time_lt:String(rangeLt), page_size:"100", sort_field:"create_time", sort_order:"DESC"},
        ["withdrawals","records","list","data"]
      );

      const statementsSummary = sumBy(statements.rows, ["settlement_amount","amount"], ["payment_status","status"]);
      const statementsRevenue = statements.rows.reduce((s:number,r:any)=>s+(numOf(r,["revenue_amount","gross_amount"])||0),0);
      const statementsFee = statements.rows.reduce((s:number,r:any)=>s+(numOf(r,["fee_amount","total_fee"])||0),0);
      const withdrawalsSummary = sumBy(withdrawals.rows, ["amount","settlement_amount"], ["payment_status","status"]);

      // PERBAIKAN: Ambil unsettled dari endpoint /finance/202507/orders/unsettled [11]
      const unsettledAmount = unsettled.rows.reduce((s:number,r:any)=>s+(numOf(r,["est_settlement_amount","settlement_amount","amount"])||0),0);

      const selesaiAmount = statementsSummary.total_amount;
      const sudahDicairkanAmount = withdrawalsSummary.total_amount;
      const belumBisaDicairkanAmount = unsettledAmount;

      console.log(`${logPrefix} Finance components:`);
      console.log(`${logPrefix}   - Selesai (Available): ${selesaiAmount}`);
      console.log(`${logPrefix}   - Sudah Dicairkan (Withdrawn): ${sudahDicairkanAmount}`);
      console.log(`${logPrefix}   - Belum Bisa Dicairkan (Unsettled): ${belumBisaDicairkanAmount}`);

      const netIncomeCalculation = {
        yang_bisa_dicairkan: selesaiAmount,
        yang_sudah_dicairkan: sudahDicairkanAmount,
        yang_belum_bisa_dicairkan: belumBisaDicairkanAmount,
        total_net_income: selesaiAmount + belumBisaDicairkanAmount,
        notes: "3 Komponen: Yang bisa dicairkan (available) + Yang sudah dicairkan (withdrawn) + Yang belum bisa dicairkan (unsettled) dari /finance/202507/orders/unsettled"
      };

      return json({
        ok:true, request_id:requestId, shop_id:shop.shop_id,
        period:{start_date:start,end_date:end},
        currency,
        data:{
          statements:{...statementsSummary, total_revenue:statementsRevenue, total_fee:statementsFee, note:"Settlement selesai untuk periode ini.", fetch_error: statements.error},
          withdrawals:{...withdrawalsSummary, note:"Dana yang sudah ditransfer ke rekening.", fetch_error: withdrawals.error},
          unsettled:{total_amount:belumBisaDicairkanAmount, count:unsettled.rows.length, note:"Dana yang belum bisa dicairkan dari /finance/202507/orders/unsettled.", by_status:{"PENDING":{count:unsettled.rows.length,amount:belumBisaDicairkanAmount}}, fetch_error: unsettled.error},
          net_income: netIncomeCalculation,
          three_components: {
            yang_bisa_dicairkan: selesaiAmount,
            yang_sudah_dicairkan: sudahDicairkanAmount,
            yang_belum_bisa_dicairkan: belumBisaDicairkanAmount
          }
        }
      });
    }

    // Default orders handler
    const now = Math.floor(Date.now()/1000);
    const from = unix(body?.create_time_ge ?? body?.start_time, now-86400);
    const to = unix(body?.create_time_lt ?? body?.end_time, now);
    if (to <= from) return json({ok:false,error:"invalid_time_range",request_id:requestId},400);
    const pageSize = Math.min(100,Math.max(1,Number(body?.page_size||100)));
    const filters:Record<string,unknown> = {create_time_ge:from,create_time_lt:to};
    if (body?.update_time_ge!==undefined) filters.update_time_ge=unix(body.update_time_ge);
    if (body?.update_time_lt!==undefined) filters.update_time_lt=unix(body.update_time_lt);
    if (body?.order_status) filters.order_status=String(body.order_status);
    if (body?.shipping_type) filters.shipping_type=String(body.shipping_type);
    if (body?.buyer_user_id) filters.buyer_user_id=String(body.buyer_user_id);
    if (body?.is_buyer_request_cancel!==undefined) filters.is_buyer_request_cancel=Boolean(body.is_buyer_request_cancel);
    if (Array.isArray(body?.warehouse_ids)) filters.warehouse_ids=body.warehouse_ids.map(String);

    const allOrders:any[]=[]; const pages:any[]=[]; let pageToken=body?.page_token?String(body.page_token):""; let pageCount=0; const MAX_PAGES=100;
    while(pageCount<MAX_PAGES){
      const query:Record<string,string>={page_size:String(pageSize),sort_field:String(body?.sort_field||"create_time"),sort_order:String(body?.sort_order||"ASC")};
      if(pageToken) query.page_token=pageToken;
      const result=await callTikTok("/order/202309/orders/search","POST",query,filters);
      const ok=result.http_status>=200&&result.http_status<300&&result.data?.code===0;
      if(!ok) return json({ok:false,request_id:requestId,shop_id:shop.shop_id,period:{create_time_ge:from,create_time_lt:to},pagination:{pages:pageCount,orders:allOrders.length,complete:false},data:result.data,tiktok_http_status:result.http_status});
      const pageData=result.data?.data??{}; const orders=Array.isArray(pageData?.orders)?pageData.orders:[];
      allOrders.push(...orders); pageCount++;
      const nextToken=String(pageData?.next_page_token??pageData?.page_token??"");
      const hasMore=Boolean(pageData?.more??pageData?.has_more??nextToken);
      pages.push({page:pageCount,count:orders.length,has_more:hasMore});
      if(!hasMore||!nextToken||nextToken===pageToken) break;
      pageToken=nextToken;
    }
    return json({ok:true,request_id:requestId,shop_id:shop.shop_id,period:{create_time_ge:from,create_time_lt:to},pagination:{pages:pageCount,orders:allOrders.length,complete:pageCount<MAX_PAGES},data:{orders:allOrders,total_count:allOrders.length,pages},tiktok_http_status:200});
  } catch(e) {
    console.error(`${logPrefix} Error:`, e);
    return json({ok:false,error:e instanceof Error?e.message:"internal_error",request_id:requestId},500);
  }
});
