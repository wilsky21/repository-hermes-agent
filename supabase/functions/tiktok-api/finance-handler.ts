// Simplified finance_overview handler dengan better debugging
// Fokus: Pastikan 3 endpoint (statements, unsettled, withdrawals) mengembalikan data dengan benar

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

  console.log(`[TIKTOK-API] Time range: ${rangeGe} - ${rangeLt}`);

  // Simple amount extractor
  const getAmount = (obj:any):number => {
    if(!obj || typeof obj !== "object") return 0;
    
    // Try common field names
    const fields = ["settlement_amount","est_settlement_amount","amount","total_amount"];
    for(const f of fields) {
      if(typeof obj[f] === "number" && obj[f] > 0) return obj[f];
      const n = Number(obj[f]);
      if(Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  };

  const paginate = async (path:string, baseQuery:Record<string,string>) => {
    const rows:any[] = [];
    let token = "";
    let pageCount = 0;
    
    for(let i=0;i<20;i++){
      const query:Record<string,string> = {...baseQuery};
      if(token) query.page_token = token;
      
      console.log(`[TIKTOK-API] Fetching ${path} page ${i+1}, query=${JSON.stringify(query)}`);
      
      const result = await callTikTok(path,"GET",query);
      const ok = result.http_status>=200 && result.http_status<300 && result.data?.code===0;
      
      if(!ok) {
        console.error(`[TIKTOK-API] ${path} error: status=${result.http_status}, code=${result.data?.code}`);
        return {rows, error: {http_status:result.http_status, data:result.data}, pageCount};
      }
      
      const pageData = result.data?.data ?? {};
      
      // Find array in response
      let list:any[] = [];
      if(Array.isArray(pageData)) {
        list = pageData;
      } else {
        // Try common array field names
        for(const key of ["records","transactions","withdrawals","statements","orders"]) {
          if(Array.isArray(pageData[key])) {
            list = pageData[key];
            break;
          }
        }
      }
      
      // If still no array, try to find any array in the object
      if(list.length === 0) {
        for(const v of Object.values(pageData)) {
          if(Array.isArray(v)) {
            list = v;
            break;
          }
        }
      }
      
      console.log(`[TIKTOK-API] ${path} page ${i+1}: found ${list.length} items`);
      rows.push(...list);
      pageCount++;
      
      const nextToken = String(pageData?.next_page_token ?? "");
      if(!nextToken || !list.length) break;
      token = nextToken;
    }
    
    return {rows, error: null, pageCount};
  };

  console.log(`[TIKTOK-API] Starting parallel fetch from 3 endpoints...`);
  
  const [statementsResult, unsettledResult, withdrawalsResult] = await Promise.all([
    paginate("/finance/202309/statements", {statement_time_ge:String(rangeGe), statement_time_lt:String(rangeLt), page_size:"100", sort_field:"statement_time", sort_order:"DESC"}),
    paginate("/finance/202507/orders/unsettled", {search_time_ge:String(rangeGe), search_time_lt:String(rangeLt), page_size:"100", sort_field:"order_create_time", sort_order:"DESC"}),
    paginate("/finance/202309/withdrawals", {create_time_ge:String(rangeGe), create_time_lt:String(rangeLt), page_size:"100", sort_field:"create_time", sort_order:"DESC"})
  ]);

  console.log(`[TIKTOK-API] Results: statements=${statementsResult.rows.length} rows, unsettled=${unsettledResult.rows.length} rows, withdrawals=${withdrawalsResult.rows.length} rows`);

  // Calculate totals
  const selesaiAmount = statementsResult.rows.reduce((sum:number, r:any) => sum + getAmount(r), 0);
  const unsettledAmount = unsettledResult.rows.reduce((sum:number, r:any) => sum + getAmount(r), 0);
  const sudahDicairkanAmount = withdrawalsResult.rows.reduce((sum:number, r:any) => sum + getAmount(r), 0);

  console.log(`[TIKTOK-API] Final amounts: selesai=${selesaiAmount}, unsettled=${unsettledAmount}, dicairkan=${sudahDicairkanAmount}`);

  return json({
    ok:true, request_id:requestId, shop_id:shop.shop_id,
    period:{start_date:start,end_date:end},
    currency,
    data:{
      statements:{total_amount:selesaiAmount, count:statementsResult.rows.length, error:statementsResult.error},
      unsettled:{total_amount:unsettledAmount, count:unsettledResult.rows.length, error:unsettledResult.error},
      withdrawals:{total_amount:sudahDicairkanAmount, count:withdrawalsResult.rows.length, error:withdrawalsResult.error},
      three_components: {
        yang_bisa_dicairkan: selesaiAmount,
        yang_belum_bisa_dicairkan: unsettledAmount,
        yang_sudah_dicairkan: sudahDicairkanAmount
      }
    }
  });
}
