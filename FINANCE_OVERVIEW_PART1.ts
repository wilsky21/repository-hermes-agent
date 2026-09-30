// PART 1: Finance Overview Handler dengan endpoint /finance/202507/orders/unsettled
// File ini hanya berisi handler untuk finance_overview action

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

  const paginate = async (path:string, baseQuery:Record<string,string>, arrayAliases:string[]) => {
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

  // Fetch statements (selesai/available)
  const statements = await paginate(
    "/finance/202309/statements",
    {statement_time_ge:String(rangeGe), statement_time_lt:String(rangeLt), page_size:"100", sort_field:"statement_time", sort_order:"DESC"},
    ["statements"]
  );

  // Fetch unsettled (untuk dibayar) - ENDPOINT YANG BENAR [1]
  const unsettled = await paginate(
    "/finance/202507/orders/unsettled",
    {search_time_ge:String(rangeGe), search_time_lt:String(rangeLt), page_size:"100", sort_field:"order_create_time", sort_order:"DESC"},
    ["transactions"]
  );

  // Fetch withdrawals (sudah dicairkan)
  const withdrawals = await paginate(
    "/finance/202309/withdrawals",
    {create_time_ge:String(rangeGe), create_time_lt:String(rangeLt), page_size:"100", sort_field:"create_time", sort_order:"DESC"},
    ["withdrawals"]
  );

  // Calculate amounts
  const selesaiAmount = statements.rows.reduce((s:number,r:any) => s + (numOf(r, ["settlement_amount","amount"]) || 0), 0);
  const unsettledAmount = unsettled.rows.reduce((s:number,r:any) => s + (numOf(r, ["est_settlement_amount","settlement_amount","amount"]) || 0), 0);
  const sudahDicairkanAmount = withdrawals.rows.reduce((s:number,r:any) => s + (numOf(r, ["amount"]) || 0), 0);

  console.log(`[TIKTOK-API] Finance: Selesai=${selesaiAmount}, Unsettled=${unsettledAmount}, Dicairkan=${sudahDicairkanAmount}`);

  return json({
    ok:true, request_id:requestId, shop_id:shop.shop_id,
    period:{start_date:start,end_date:end},
    currency,
    data:{
      statements:{total_amount:selesaiAmount, count:statements.rows.length, note:"Available untuk tarik"},
      unsettled:{total_amount:unsettledAmount, count:unsettled.rows.length, note:"Untuk dibayar dari /finance/202507/orders/unsettled"},
      withdrawals:{total_amount:sudahDicairkanAmount, count:withdrawals.rows.length, note:"Sudah dicairkan"},
      three_components: {
        yang_bisa_dicairkan: selesaiAmount,
        yang_belum_bisa_dicairkan: unsettledAmount,
        yang_sudah_dicairkan: sudahDicairkanAmount
      }
    }
  });
}
