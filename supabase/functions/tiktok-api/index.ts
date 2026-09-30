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

    if (action === "audit_orders") {
      const now = Math.floor(Date.now()/1000);
      const from = unix(body?.create_time_ge ?? body?.start_time, now-86400);
      const to = unix(body?.create_time_lt ?? body?.end_time, now);
      if (to <= from) return json({ok:false,error:"invalid_time_range",request_id:requestId},400);
      const pageSize = Math.min(100,Math.max(1,Number(body?.page_size||100)));
      const filters:Record<string,unknown> = {create_time_ge:from,create_time_lt:to};
      const allOrders:any[]=[]; let pageToken=""; let pageCount=0; const MAX_PAGES=100;
      while(pageCount<MAX_PAGES){
        const query:Record<string,string>={page_size:String(pageSize),sort_field:"create_time",sort_order:"ASC"};
        if(pageToken) query.page_token=pageToken;
        const result=await callTikTok("/order/202309/orders/search","POST",query,filters);
        const ok=result.http_status>=200&&result.http_status<300&&result.data?.code===0;
        if(!ok) return json({ok:false,error:"tiktok_order_search_failed",request_id:requestId,data:result.data,tiktok_http_status:result.http_status});
        const pageData=result.data?.data??{};
        const orders=Array.isArray(pageData?.orders)?pageData.orders:[];
        allOrders.push(...orders); pageCount++;
        const nextToken=String(pageData?.next_page_token??pageData?.page_token??"");
        const hasMore=Boolean(pageData?.more??pageData?.has_more??nextToken);
        if(!hasMore||!nextToken||nextToken===pageToken) break;
        pageToken=nextToken;
      }
      function extractOrderId(o:any){
        return String(o?.order_id ?? o?.order_id_string ?? o?.id ?? o?.order?.order_id ?? o?.order?.id ?? "").trim();
      }
      function extractStatus(o:any){
        return String(o?.order_status ?? o?.status ?? o?.order?.order_status ?? o?.order?.status ?? "UNKNOWN").trim() || "UNKNOWN";
      }
      const ids=allOrders.map(extractOrderId).filter(Boolean);
      const uniqueIds=[...new Set(ids)];
      const statusCounts:Record<string,number>={};
      for(const o of allOrders){const st=extractStatus(o);statusCounts[st]=(statusCounts[st]||0)+1;}
      const uniqueStatusCounts:Record<string,number>={}; const seen=new Set<string>();
      for(const o of allOrders){const id=extractOrderId(o); if(!id||seen.has(id)) continue; seen.add(id); const st=extractStatus(o); uniqueStatusCounts[st]=(uniqueStatusCounts[st]||0)+1;}
      const created=allOrders.map(o=>Number(o?.create_time)).filter(Number.isFinite);
      const sample=allOrders.slice(0,2).map((o:any)=>{
        const clean:any={};
        for(const [k,v] of Object.entries(o||{})){ if(!/token|secret|password|address|phone|email/i.test(k)) clean[k]=v; }
        return clean;
      });
      return json({ok:true,request_id:requestId,shop_id:shop.shop_id,period:{create_time_ge:from,create_time_lt:to,start_iso:new Date(from*1000).toISOString(),end_iso:new Date(to*1000).toISOString()},audit:{raw_count:allOrders.length,unique_order_count:uniqueIds.length,duplicate_count:allOrders.length-uniqueIds.length,page_count:pageCount,complete:pageCount<MAX_PAGES,status_counts:statusCounts,unique_status_counts:uniqueStatusCounts,earliest_create_time:created.length?new Date(Math.min(...created)*1000).toISOString():null,latest_create_time:created.length?new Date(Math.max(...created)*1000).toISOString():null},data:{order_ids:uniqueIds,sample_orders:sample}});
    }

    if (action === "order") {
      const ids = Array.isArray(body?.order_ids) ? body.order_ids.map(String) : [String(body?.order_id || "")];
      const cleanIds = ids.filter(Boolean);
      if (!cleanIds.length) return json({ok:false,error:"order_id_required",request_id:requestId},400);
      const result = await callTikTok("/order/202309/orders","GET",{ids:cleanIds.join(",")});
      return json({ok:result.http_status>=200&&result.http_status<300&&result.data?.code===0,request_id:requestId,shop_id:shop.shop_id,data:result.data,tiktok_http_status:result.http_status});
    }

    if (action === "tracking") {
      const orderId = String(body?.order_id || "");
      if (!orderId) return json({ok:false,error:"order_id_required",request_id:requestId},400);
      const result = await callTikTok(`/fulfillment/202309/orders/${encodeURIComponent(orderId)}/tracking`,"GET",{});
      return json({ok:result.http_status>=200&&result.http_status<300&&result.data?.code===0,request_id:requestId,shop_id:shop.shop_id,order_id:orderId,data:result.data,tiktok_http_status:result.http_status});
    }

    if (action === "finance") {
      const orderId = String(body?.order_id || "");
      if (!orderId) return json({ok:false,error:"order_id_required",request_id:requestId},400);
      const result = await callTikTok(`/finance/202501/orders/${encodeURIComponent(orderId)}/statement_transactions`,"GET",{});
      return json({ok:result.http_status>=200&&result.http_status<300&&result.data?.code===0,request_id:requestId,shop_id:shop.shop_id,order_id:orderId,data:result.data,tiktok_http_status:result.http_status});
    }

    if (action === "affiliate_creator_performance") {
      const creatorId=String(body?.creator_user_id||"").trim();
      if(!creatorId) return json({ok:false,error:"creator_user_id_required",request_id:requestId},400);
      const query:Record<string,string>={};
      if(Array.isArray(body?.data_groups)&&body.data_groups.length) query.data_groups=body.data_groups.map(String).join(",");
      const result=await callTikTok(`/affiliate_seller/202406/marketplace_creators/${encodeURIComponent(creatorId)}`,"GET",query);
      return json({ok:result.http_status>=200&&result.http_status<300&&result.data?.code===0,request_id:requestId,shop_id:shop.shop_id,creator_user_id:creatorId,data:result.data,tiktok_http_status:result.http_status});
    }

    if (action === "shop_live_performance") {
      const start=String(body?.start_date||"").trim(), end=String(body?.end_date||"").trim();
      if(!/^\d{4}-\d{2}-\d{2}$/g.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))
        return json({ok:false,error:"start_date_end_date_required",request_id:requestId},400);
      const query:Record<string,string>={start_date_ge:start,end_date_lt:end,page_size:String(Math.min(100,Math.max(1,Number(body?.page_size||100)))),sort_field:String(body?.sort_field||"gmv"),sort_order:String(body?.sort_order||"DESC"),currency:String(body?.currency||"LOCAL")};
      if(body?.account_type) query.account_type=String(body.account_type);
      let token="";
      const sessions:any[]=[];
      for(let page=0;page<100;page++){
        if(token) query.page_token=token; else delete query.page_token;
        const result=await callTikTok("/analytics/202509/shop_lives/performance","GET",query);
        if(!(result.http_status>=200&&result.http_status<300&&result.data?.code===0))
          return json({ok:false,error:"shop_live_performance_failed",request_id:requestId,data:result.data,tiktok_http_status:result.http_status});
        const rows=Array.isArray(result.data?.data?.live_stream_sessions)?result.data.data.live_stream_sessions:[];
        sessions.push(...rows);
        token=String(result.data?.data?.next_page_token||"");
        if(!token||!rows.length) break;
      }
      return json({ok:true,request_id:requestId,shop_id:shop.shop_id,period:{start_date:start,end_date:end},data:{live_stream_sessions:sessions,total_count:sessions.length},tiktok_http_status:200});
    }

    if (action === "shop_video_performance") {
      const start=String(body?.start_date||"").trim(), end=String(body?.end_date||"").trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))
        return json({ok:false,error:"start_date_end_date_required",request_id:requestId},400);
      const pageSize=Math.min(100,Math.max(1,Number(body?.page_size||100)));
      const videos:any[]=[]; let token="";
      for(let page=0;page<100;page++){
        const query:Record<string,string>={start_date_ge:start,end_date_lt:end,page_size:String(pageSize),currency:String(body?.currency||"LOCAL")};
        if(body?.account_type) query.account_type=String(body.account_type);
        if(token) query.page_token=token;
        const result=await callTikTok("/analytics/202605/shop_videos/performance","GET",query);
        if(!(result.http_status>=200&&result.http_status<300&&result.data?.code===0))
          return json({ok:false,error:"shop_video_performance_failed",request_id:requestId,data:result.data,tiktok_http_status:result.http_status});
        const rows=Array.isArray(result.data?.data?.videos)?result.data.data.videos:[];
        videos.push(...rows);
        token=String(result.data?.data?.next_page_token||"");
        if(!token||!rows.length) break;
      }

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
      const metric=(row:any,aliases:string[])=>amount(findKey(row,aliases));
      const textMetric=(row:any,aliases:string[])=>{
        const v=findKey(row,aliases); return v===undefined||v===null||v===""?null:String(v);
      };
      const normalized=videos.map((v:any)=>({
        video_id:textMetric(v,["video_id","videoid","id"]),
        title:textMetric(v,["video_title","title","name"]),
        creator:textMetric(v,["creator_name","nickname","nick_name","user_name"]),
        author_type:textMetric(v,["author_type"]),
        gmv:metric(v,["gmv","video_gmv","attributed_gmv","gross_merchandise_value","gmv_incl_tax"]),
        items_sold:metric(v,["items_sold","item_sold","sold_items","products_sold"]),
        views:metric(v,["views","video_views","view_count"]),
        clicks:metric(v,["clicks","video_clicks","product_clicks"]),
        ctr:metric(v,["ctr","click_through_rate"])
      }));
      const sum=(key:string)=>normalized.reduce((s:number,x:any)=>s+(Number.isFinite(x[key])?Number(x[key]):0),0);
      const validCount=(key:string)=>normalized.filter((x:any)=>Number.isFinite(x[key])).length;
      const gmvRows=normalized.filter((x:any)=>Number.isFinite(x.gmv)).sort((x:any,y:any)=>y.gmv-x.gmv);
      const creatorMap=new Map<string,{gmv:number,items_sold:number,video_count:number}>();
      for(const x of normalized){
        const c=x.creator||"Unknown";
        const cur=creatorMap.get(c)||{gmv:0,items_sold:0,video_count:0};
        if(Number.isFinite(x.gmv))cur.gmv+=x.gmv;
        if(Number.isFinite(x.items_sold))cur.items_sold+=x.items_sold;
        cur.video_count++;
        creatorMap.set(c,cur);
      }
      const topCreators=[...creatorMap.entries()].map(([creator,v])=>({creator,...v})).sort((a,b)=>b.gmv-a.gmv).slice(0,10);
      const viewsRows=normalized.filter((x:any)=>Number.isFinite(x.views)&&x.views>0).sort((a:any,b:any)=>b.views-a.views);
      const ctrRows=normalized.filter((x:any)=>Number.isFinite(x.ctr)).sort((a:any,b:any)=>b.ctr-a.ctr);
      const efficiencyRows=normalized.filter((x:any)=>Number.isFinite(x.gmv)&&Number.isFinite(x.views)&&x.views>0).map((x:any)=>({...x,gmv_per_1000_views:(x.gmv/x.views)*1000})).sort((a:any,b:any)=>b.gmv_per_1000_views-a.gmv_per_1000_views);
      const viewsNoGmvRows=normalized.filter((x:any)=>Number.isFinite(x.views)&&x.views>0&&(!Number.isFinite(x.gmv)||x.gmv<=0)).sort((a:any,b:any)=>b.views-a.views);
      // TikTok's end_date_lt is EXCLUSIVE and must be strictly later than start_date_ge,
      // so a valid one-day analytics request is [D, D+1). Only such a request is a valid
      // daily snapshot. Multi-day/monthly analytics are aggregates and must never be stored
      // under the first date, otherwise historical daily data becomes misleading.
      const nextDayOf=(d:string)=>new Date(Date.parse(d+"T00:00:00Z")+86400000).toISOString().slice(0,10);
      const isSingleDaySnapshot=end===nextDayOf(start);
      const performanceDate=start;
      const revenueRank=new Map<string,number>(); gmvRows.forEach((x:any,i:number)=>{if(x.video_id) revenueRank.set(String(x.video_id),i+1);});
      const efficiencyRank=new Map<string,number>(); efficiencyRows.filter((x:any)=>Number(x.views)>=1000).forEach((x:any,i:number)=>{if(x.video_id) efficiencyRank.set(String(x.video_id),i+1);});
      const reachRank=new Map<string,number>(); viewsRows.forEach((x:any,i:number)=>{if(x.video_id) reachRank.set(String(x.video_id),i+1);});
      const ctrRank=new Map<string,number>(); ctrRows.forEach((x:any,i:number)=>{if(x.video_id) ctrRank.set(String(x.video_id),i+1);});
      const persistenceRows=isSingleDaySnapshot?normalized.map((x:any)=>({
        video_id:x.video_id, performance_date:performanceDate, creator:x.creator, title:x.title, author_type:x.author_type,
        gmv:x.gmv, items_sold:x.items_sold, views:x.views, clicks:x.clicks, ctr:x.ctr,
        gmv_per_1000_views:(Number.isFinite(x.gmv)&&Number.isFinite(x.views)&&x.views>0)?(x.gmv/x.views)*1000:null,
        revenue_rank:revenueRank.get(String(x.video_id))||null,
        efficiency_rank:efficiencyRank.get(String(x.video_id))||null,
        reach_rank:reachRank.get(String(x.video_id))||null,
        ctr_rank:ctrRank.get(String(x.video_id))||null,
        high_views_low_gmv:Number.isFinite(x.views)&&x.views>0&&(!Number.isFinite(x.gmv)||x.gmv<=0),
        raw:x
      })):[]; // Never persist multi-day/monthly aggregate analytics as daily rows.
      // TikTok pagination can occasionally repeat a video record. PostgreSQL rejects
      // multiple source rows targeting the same ON CONFLICT key in one INSERT.
      // Deduplicate by (video_id, performance_date) before batching the upsert.
      const persistenceMap=new Map<string,any>();
      for(const row of persistenceRows){
        const id=String(row?.video_id||"").trim();
        if(id) persistenceMap.set(id,row);
      }
      const persistenceRowsUnique=[...persistenceMap.values()];
      const persistenceDuplicateRows=persistenceRows.length-persistenceRowsUnique.length;
      let persistedRows=0;
      let persistenceError:any=null;
      const CHUNK_SIZE=25;
      for(let i=0;i<persistenceRowsUnique.length;i+=CHUNK_SIZE){
        const chunk=persistenceRowsUnique.slice(i,i+CHUNK_SIZE);
        const persisted=await rpc("upsert_video_performance_daily",{p_rows:chunk});
        if(!persisted.ok){
          persistenceError={status:persisted.status,data:persisted.data,chunk_start:i,chunk_size:chunk.length};
          console.error("VIDEO_PERFORMANCE_PERSIST_FAILED",JSON.stringify({request_id:requestId,...persistenceError}));
          break;
        }
        const n=Number(persisted.data);
        persistedRows += Number.isFinite(n)?n:chunk.length;
      }
      const persistence={
        attempted_rows:persistenceRowsUnique.length,
        source_rows:persistenceRows.length,
        duplicate_rows:persistenceDuplicateRows,
        persisted_rows:persistedRows,
        complete:!persistenceError,
        error:persistenceError
      };
      // Persistence is a secondary snapshot. Do not make otherwise valid TikTok
      // analytics unavailable just because the snapshot write failed.
      if(persistenceError) console.error("VIDEO_PERFORMANCE_PERSISTENCE_WARNING",JSON.stringify({request_id:requestId,persistence}));

      const summary={
        video_count:videos.length,
        gmv:sum("gmv"),
        gmv_currency:String(body?.currency||"LOCAL"),
        items_sold:sum("items_sold"),
        total_views:sum("views"),
        total_clicks:sum("clicks"),
        avg_ctr:validCount("ctr")?normalized.reduce((s:number,x:any)=>s+(Number.isFinite(x.ctr)?x.ctr:0),0)/validCount("ctr"):null,
        metric_coverage:{gmv:validCount("gmv"),items_sold:validCount("items_sold"),views:validCount("views"),clicks:validCount("clicks"),ctr:validCount("ctr")},
        top_videos:gmvRows.slice(0,10),
        top_by_views:viewsRows.slice(0,10),
        top_by_ctr:ctrRows.slice(0,10),
        top_by_efficiency:efficiencyRows.slice(0,10),
        high_views_low_gmv:viewsNoGmvRows.slice(0,10),
        top_creators:topCreators
      };
      return json({ok:true,request_id:requestId,shop_id:shop.shop_id,period:{start_date:start,end_date:end},data:{summary,videos:gmvRows.slice(0,20),total_count:videos.length,persistence},tiktok_http_status:200});
    }

    if (action === "shop_product_performance") {
      const productId=String(body?.product_id||"").trim();
      const start=String(body?.start_date||"").trim(), end=String(body?.end_date||"").trim();
      if(!productId) return json({ok:false,error:"product_id_required",request_id:requestId},400);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))
        return json({ok:false,error:"start_date_end_date_required",request_id:requestId},400);
      const query:Record<string,string>={start_date_ge:start,end_date_lt:end,granularity:String(body?.granularity||"ALL"),currency:String(body?.currency||"LOCAL")};
      const result=await callTikTok(`/analytics/202509/shop_products/${encodeURIComponent(productId)}/performance`,"GET",query);
      return json({ok:result.http_status>=200&&result.http_status<300&&result.data?.code===0,request_id:requestId,shop_id:shop.shop_id,product_id:productId,period:{start_date:start,end_date:end},data:result.data,tiktok_http_status:result.http_status});
    }

    if (action === "finance_overview") {
      const start = String(body?.start_date || "").trim();
      const end = String(body?.end_date || "").trim();
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

      // Generic pager for finance list endpoints.
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

      // 1) Statement settlement dalam rentang tanggal - SELESAI (sudah settled)
      const statements = await paginate(
        "/finance/202309/statements",
        {statement_time_ge:String(rangeGe), statement_time_lt:String(rangeLt), page_size:"100", sort_field:"statement_time", sort_order:"DESC"},
        ["statements","records","list","data"]
      );

      // 2) Dana yang sudah ditransfer ke rekening bank ("sudah cair" / Penarikan Dana)
      const payments = await paginate(
        "/finance/202309/withdrawals",
        {create_time_ge:String(rangeGe), create_time_lt:String(rangeLt), page_size:"100", sort_field:"create_time", sort_order:"DESC"},
        ["withdrawals","records","list","data"]
      );

      // 3) UNTUK DIBAYAR (Unsettled) = Settlement sudah selesai TETAPI belum ditransfer ke rekening
      // Logic: Ambil semua settlement yang sudah finalized, tapi tidak ada record di withdrawals untuk order tersebut
      // Ini adalah dana yang sudah siap/dalam proses tapi belum cair ke rekening
      const settlementAmount = statements.rows.reduce((s:number,r:any)=>s+(numOf(r,["settlement_amount","amount"])||0),0);
      const withdrawalAmount = payments.rows.reduce((s:number,r:any)=>s+(numOf(r,["amount","settlement_amount"])||0),0);
      const unsettledAmount = Math.max(0, settlementAmount - withdrawalAmount);

      const statementsSummary = sumBy(statements.rows, ["settlement_amount","amount"], ["payment_status","status"]);
      const statementsRevenue = statements.rows.reduce((s:number,r:any)=>s+(numOf(r,["revenue_amount","gross_amount"])||0),0);
      const statementsFee = statements.rows.reduce((s:number,r:any)=>s+(numOf(r,["fee_amount","total_fee"])||0),0);
      const paymentsSummary = sumBy(payments.rows, ["amount","settlement_amount"], ["payment_status","status"]);

      // PERBAIKAN: Definisi Pendapatan Bersih = Selesai + Untuk Dibayar
      const netIncomeCalculation = {
        selesai_amount: settlementAmount,
        untuk_dibayar_amount: unsettledAmount,
        total_net_income: settlementAmount + unsettledAmount,
        notes: "Pendapatan Bersih = Settlement Selesai + Untuk Dibayar (in transit ke rekening)"
      };

      return json({
        ok:true, request_id:requestId, shop_id:shop.shop_id,
        period:{start_date:start,end_date:end},
        currency,
        data:{
          statements:{...statementsSummary, total_revenue:statementsRevenue, total_fee:statementsFee, note:"Rincian settlement per status pembayaran untuk periode ini.", fetch_error: statements.error},
          payments:{...paymentsSummary, note:"Dana yang benar-benar sudah ditransfer ke rekening (\"sudah cair\") untuk periode ini.", fetch_error: payments.error},
          unsettled:{total_amount:unsettledAmount, count:0, note:"Dana yang sudah settle tetapi belum transfer ke rekening (dalam proses cair).", by_status:{"IN_TRANSIT":{count:0,amount:unsettledAmount}}},
          net_income: netIncomeCalculation
        }
      });
    }

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
    return json({ok:false,error:e instanceof Error?e.message:"internal_error",request_id:requestId},500);
  }
});
