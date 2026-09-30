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
  if (req.method !== "POST") return json({ok:false,error:"method_not_allowed",request_id:requestId},405);
  try {
    const body = await req.json().catch(()=>({}));
    const action = String(body?.action || "");
    
    console.log(`[TIKTOK-API] Action: ${action}`);
    
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

    if (action === "finance_overview") {
      const start = String(body?.start_date || "").trim();
      const end = String(body?.end_date || "").trim();
      console.log(`[TIKTOK-API] finance_overview: start_date=${start}, end_date=${end}`);
      
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end))
        return json({ok:false,error:"start_date_end_date_required",request_id:requestId},400);
      
      const dayStartUnix = (d:string) => Math.floor(new Date(d+"T00:00:00+07:00").getTime()/1000);
      const rangeGe = dayStartUnix(start);
      const rangeLt = dayStartUnix(end) + 86400;
      const currency = String(body?.currency || "LOCAL");

      const numOf = (row:any, aliases:string[]) => {
        const findKey = (obj:any, aliases:string[]):any => {
          const norm = (v:any) => String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
          const wanted = new Set(aliases.map(norm));
          const seen = new Set<any>();
          const walk = (x:any):any => {
            if(!x||typeof x!=="object"||seen.has(x)) return undefined;
            seen.add(x);
            if(Array.isArray(x)){for(const y of x){const z=walk(y);if(z!==undefined)return z;}return undefined;}
            for(const [k,v] of Object.entries(x)){if(wanted.has(norm(k)))return v;}
            for(const v of Object.values(x)){const z=walk(v);if(z!==undefined)return z;}
            return undefined;
          };
          return walk(obj);
        };
        const v = findKey(row, aliases);
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      const paginate = async (path:string, baseQuery:Record<string,string>) => {
        const rows:any[] = [];
        let token = "";
        for(let i=0;i<20;i++){
          const query:Record<string,string> = {...baseQuery};
          if(token) query.page_token = token;
          const result = await callTikTok(path,"GET",query);
          const ok = result.http_status>=200 && result.http_status<300 && result.data?.code===0;
          if(!ok) return {rows, error: {http_status:result.http_status, data:result.data}};
          
          const pageData = result.data?.data ?? {};
          let arr = Object.values(pageData).find(v=>Array.isArray(v));
          const list = Array.isArray(arr) ? arr : [];
          rows.push(...list);
          
          const nextToken = String(pageData?.next_page_token ?? "");
          if(!nextToken || !list.length) break;
          token = nextToken;
        }
        return {rows, error: null};
      };

      console.log(`[TIKTOK-API] Fetching statements, unsettled, withdrawals...`);
      const [statements, unsettled, withdrawals] = await Promise.all([
        paginate("/finance/202309/statements", {statement_time_ge:String(rangeGe), statement_time_lt:String(rangeLt), page_size:"100", sort_field:"statement_time", sort_order:"DESC"}),
        paginate("/finance/202507/orders/unsettled", {search_time_ge:String(rangeGe), search_time_lt:String(rangeLt), page_size:"100", sort_field:"order_create_time", sort_order:"DESC"}),
        paginate("/finance/202309/withdrawals", {create_time_ge:String(rangeGe), create_time_lt:String(rangeLt), page_size:"100", sort_field:"create_time", sort_order:"DESC"})
      ]);

      const selesaiAmount = statements.rows.reduce((s:number,r:any) => s + (numOf(r, ["settlement_amount","amount"]) || 0), 0);
      const unsettledAmount = unsettled.rows.reduce((s:number,r:any) => s + (numOf(r, ["est_settlement_amount","settlement_amount","amount"]) || 0), 0);
      const sudahDicairkanAmount = withdrawals.rows.reduce((s:number,r:any) => s + (numOf(r, ["amount"]) || 0), 0);

      console.log(`[TIKTOK-API] Finance: Selesai=${selesaiAmount}, Unsettled=${unsettledAmount}, Dicairkan=${sudahDicairkanAmount}`);

      return json({
        ok:true, request_id:requestId, shop_id:shop.shop_id,
        period:{start_date:start,end_date:end},
        currency,
        data:{
          statements:{total_amount:selesaiAmount, count:statements.rows.length},
          unsettled:{total_amount:unsettledAmount, count:unsettled.rows.length},
          withdrawals:{total_amount:sudahDicairkanAmount, count:withdrawals.rows.length},
          three_components: {
            yang_bisa_dicairkan: selesaiAmount,
            yang_belum_bisa_dicairkan: unsettledAmount,
            yang_sudah_dicairkan: sudahDicairkanAmount
          }
        }
      });
    }

    const now = Math.floor(Date.now()/1000);
    const from = unix(body?.create_time_ge ?? body?.start_time, now-86400);
    const to = unix(body?.create_time_lt ?? body?.end_time, now);
    if (to <= from) return json({ok:false,error:"invalid_time_range",request_id:requestId},400);
    return json({ok:true,request_id:requestId,shop_id:shop.shop_id,data:{message:"default_handler"}});
  } catch(e) {
    console.error(`[TIKTOK-API] Error:`, e);
    return json({ok:false,error:e instanceof Error?e.message:"internal_error",request_id:requestId},500);
  }
});
