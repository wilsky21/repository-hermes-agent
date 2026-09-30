import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const TZ="Asia/Jakarta";
function normalizeUserDateTypos(text:string):string{
  return String(text||"").replace(/\b(\d{1,2})\s+(september|oktober|november|desember|januari|februari|maret|april|mei|juni|juli|agustus)\s+20206\b/gi,"$1 $2 2026");
}
function isoDateOnly(v:unknown):string|null{if(!v)return null;const s=String(v).trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const d=new Date(s);if(Number.isNaN(d.getTime()))return null;return new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(d);}
function dayRangeJakarta(date:string){const start=new Date(date+"T00:00:00+07:00");return{start:Math.floor(start.getTime()/1000),end:Math.floor(start.getTime()/1000)+86400};}
function jakartaToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function addDays(date:string,n:number){const d=new Date(date+"T00:00:00+07:00");d.setDate(d.getDate()+n);return new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(d);}
function videoAvailableDate(){return addDays(jakartaToday(),-1);}
function parseJakartaDateTime(v:unknown):number|null{if(!v)return null;const s=String(v).trim();const normalized=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)?s.replace(" ","T")+"+07:00":s;const d=new Date(normalized);return Number.isNaN(d.getTime())?null:Math.floor(d.getTime()/1000);}
async function callTikTok(action:string,payload:Record<string,unknown>){const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get(["SUPABASE","SERVICE","ROLE","KEY"].join("_"));if(!base||!key)throw new Error("backend_configuration_incomplete");const r=await fetch(base+"/functions/v1/tiktok-api",{method:"POST",headers:{"content-type":"application/json","apikey":key,"authorization":"Bearer "+key},body:JSON.stringify({action,...payload})});const data=await r.json().catch(()=>null);if(!r.ok||!data?.ok){const detail=data?.data?.message||data?.data?.error?.message||data?.data?.code||data?.error||data?.message||"tiktok_api_error";throw new Error("tiktok_api_error:"+String(detail).slice(0,300));}return data;}
const tools=[{type:"function",function:{name:"video_history",description:"Baca snapshot historis performa video yang sudah tersimpan di Supabase. Gunakan untuk pertanyaan historis, perbandingan tanggal, Video ID, kode V01-V05, atau creator.",parameters:{type:"object",properties:{video_id:{type:"string"},video_ref:{type:"string"},creator:{type:"string"},date:{type:"string"},start_date:{type:"string"},end_date:{type:"string"},limit:{type:"integer",minimum:1,maximum:100}},additionalProperties:false}}},{type:"function",function:{name:"shop_live_performance",description:"Ambil performa LIVE TikTok Shop.",parameters:{type:"object",properties:{date:{type:"string"},start_date:{type:"string"},end_date:{type:"string"}},additionalProperties:false}}},{type:"function",function:{name:"shop_product_performance",description:"Ambil analytics performa produk TikTok Shop.",parameters:{type:"object",properties:{product_id:{type:"string"},date:{type:"string"},start_date:{type:"string"},end_date:{type:"string"}},required:["product_id"],additionalProperties:false}}},{type:"function",function:{name:"video_analytics",description:"Ambil analytics performa video TikTok Shop berdasarkan tanggal atau periode.",parameters:{type:"object",properties:{date:{type:"string"},start_date:{type:"string"},end_date:{type:"string"}},additionalProperties:false}}},{type:"function",function:{name:"affiliate_creator_performance",description:"Ambil performa affiliate creator tertentu.",parameters:{type:"object",properties:{creator_user_id:{type:"string"}},required:["creator_user_id"],additionalProperties:false}}},
{type:"function",function:{name:"list_order_ids",description:"Ambil HANYA daftar Order ID unik untuk tanggal/periode tertentu, tanpa detail order lain. Gunakan saat user meminta semua Order ID agar output tetap ringan dan semua digit ID dipertahankan.",parameters:{type:"object",properties:{date:{type:"string"},start_date:{type:"string"},end_date:{type:"string"}},additionalProperties:false}}},
{type:"function",function:{name:"reconcile_orders",description:"Rekonsiliasi jumlah order API TikTok dengan angka Seller Center yang diberikan user. Gunakan saat user membandingkan angka API vs Seller Center atau ingin mencari penyebab selisih. Tidak boleh menganggap angka Seller Center benar; tampilkan selisih dan atribut order yang tersedia.",parameters:{type:"object",properties:{date:{type:"string"},start_date:{type:"string"},end_date:{type:"string"},seller_center_count:{type:"integer",minimum:0}},required:["seller_center_count"],additionalProperties:false}}},
{type:"function",function:{name:"sales_summary",description:"Ringkasan penjualan TikTok Shop berdasarkan tanggal/periode. Gunakan untuk pertanyaan seperti ringkasan penjualan, penjualan hari ini, penjualan kemarin, total penjualan, omzet transaksi, performa penjualan, atau ringkasan order. Mengambil order API dan merangkum jumlah order unik, nilai transaksi dari payment.total_amount yang tersedia, breakdown status, dan rentang waktu. Jangan menyebut nilai sebagai GMV/settlement bersih kecuali sumber memang menyediakannya.",parameters:{type:"object",properties:{date:{type:"string"},start_date:{type:"string"},end_date:{type:"string"}},additionalProperties:false}}},{type:"function",function:{name:"audit_orders",description:"Audit jumlah order TikTok Shop berdasarkan tanggal/periode. Wajib dipakai untuk pertanyaan JUMLAH/TOTAL order. Menghasilkan raw count, unique order count, duplikat, jumlah per status, rentang waktu, dan order ID unik.",parameters:{type:"object",properties:{date:{type:"string"},start_date:{type:"string"},end_date:{type:"string"}},additionalProperties:false}}},
{type:"function",function:{name:"get_orders",description:"Ambil daftar order TikTok Shop GUDARA berdasarkan tanggal/periode/status/waktu. Gunakan untuk meminta daftar atau detail SEMUA order pada tanggal atau periode. Untuk permintaan detail order berdasarkan tanggal atau periode dari pesan atau konteks sebelumnya, gunakan get_orders dan jangan meminta Order ID.",parameters:{type:"object",properties:{date:{type:"string"},start_date:{type:"string"},end_date:{type:"string"},start_datetime:{type:"string"},end_datetime:{type:"string"},status:{type:"string"},page_size:{type:"integer",minimum:1,maximum:100}},additionalProperties:false}}},
{type:"function",function:{name:"get_order",description:"Hanya gunakan untuk detail satu atau beberapa order ketika Order ID disebut jelas. Untuk detail order berdasarkan tanggal atau periode, gunakan get_orders.",parameters:{type:"object",properties:{order_id:{type:"string"},order_ids:{type:"array",items:{type:"string"}}},additionalProperties:false}}},
{type:"function",function:{name:"get_tracking",description:"Ambil tracking/logistik terbaru untuk satu order TikTok.",parameters:{type:"object",properties:{order_id:{type:"string"}},required:["order_id"],additionalProperties:false}}},
{type:"function",function:{name:"get_finance",description:"Ambil statement transaksi/settlement finansial untuk satu order TikTok.",parameters:{type:"object",properties:{order_id:{type:"string"}},required:["order_id"],additionalProperties:false}}}
,{type:"function",function:{name:"sales_trend",description:"Analisis tren penjualan TikTok Shop dari waktu ke waktu: rincian harian (jumlah order unik, nilai transaksi, breakdown status per hari) untuk satu rentang tanggal, ATAU perbandingan dua periode (mis. minggu ini vs minggu lalu, bulan ini vs bulan lalu) dengan persentase perubahan. WAJIB dipakai untuk pertanyaan naik/turun, tren, atau membandingkan performa penjualan antar periode.",parameters:{type:"object",properties:{start_date:{type:"string"},end_date:{type:"string"},compare_start_date:{type:"string"},compare_end_date:{type:"string"}},additionalProperties:false}}},
{type:"function",function:{name:"finance_summary",description:"Laporan keuangan TikTok Shop untuk suatu periode: pendapatan dari order yang belum settle (unsettled), rincian settlement (pendapatan kotor, fee platform, nilai settlement) per status, dan dana yang benar-benar sudah ditransfer ke rekening (payment/\"sudah cair\") per status. Gunakan untuk pertanyaan pendapatan bersih, net income, uang sudah cair/belum cair, settlement, payout, atau penghasilan marketplace.",parameters:{type:"object",properties:{date:{type:"string"},start_date:{type:"string"},end_date:{type:"string"}},additionalProperties:false}}}
,{type:"function",function:{name:"memory_write",description:"Simpan memory jangka panjang Hermes hanya untuk preferensi eksplisit, koreksi, aturan bisnis, definisi metrik, alias penting, atau lesson durable. Jangan simpan percakapan biasa atau angka transaksi sementara.",parameters:{type:"object",properties:{memory_type:{type:"string",enum:["preference","business_rule","correction","fact","workflow","definition","alias","lesson"]},memory_key:{type:"string"},content:{type:"string"},scope:{type:"string",enum:["global","chat"]},confidence:{type:"number",minimum:0,maximum:1},importance:{type:"integer",minimum:1,maximum:10},tags:{type:"array",items:{type:"string"}},value:{type:"object"}},required:["memory_type","memory_key","content"],additionalProperties:false}}}
];
async function runTool(name:string,args:any){
if(name==="memory_write")return writeLongTermMemory(String(args?.chat_id||""),args);
if(name==="shop_live_performance"){const date=isoDateOnly(args?.date);let start=isoDateOnly(args?.start_date),end=isoDateOnly(args?.end_date);if(date){start=date;end=date;}if(!start){start=isoDateOnly(new Date())!;end=start;}if(!end)end=start;return callTikTok("shop_live_performance",{start_date:start,end_date:end});} if(name==="video_analytics"){const date=isoDateOnly(args?.date);let start=isoDateOnly(args?.start_date),end=isoDateOnly(args?.end_date);if(date){start=date;end=addDays(date,1);}else if(start){end=addDays(end||start,1);}else{start=videoAvailableDate();end=addDays(start,1);}return callTikTok("shop_video_performance",{start_date:start,end_date:end,page_size:100});} if(name==="shop_product_performance"){const date=isoDateOnly(args?.date);let start=isoDateOnly(args?.start_date),end=isoDateOnly(args?.end_date);if(date){start=date;end=date;}if(!start){start=isoDateOnly(new Date())!;end=start;}if(!end)end=start;return callTikTok("shop_product_performance",{product_id:String(args?.product_id||""),start_date:start,end_date:end});} if(name==="affiliate_creator_performance"){return callTikTok("affiliate_creator_performance",{creator_user_id:String(args?.creator_user_id||"")});} if(name==="video_history"){
  const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get(["SUPABASE","SERVICE","ROLE","KEY"].join("_"));
  if(!base||!key)throw new Error("backend_configuration_incomplete");
  let start=isoDateOnly(args?.start_date),end=isoDateOnly(args?.end_date),date=isoDateOnly(args?.date);
  if(date){start=date;end=date;}
  if(!start){start=videoAvailableDate();end=start;}
  if(!end)end=start;
  let videoId=String(args?.video_id||"").trim();
  const ref=String(args?.video_ref||"").trim().toUpperCase();
  const creator=String(args?.creator||"").trim();
  const callRpc=async(s:string,e:string,vid:string|null,cre:string|null,limit:number)=>{
    const r=await fetch(base+"/rest/v1/rpc/get_video_performance_history",{method:"POST",headers:{apikey:key,authorization:"Bearer "+key,"content-type":"application/json"},body:JSON.stringify({p_start_date:s,p_end_date:e,p_video_id:vid,p_creator:cre,p_limit:limit})});
    const d=await r.json().catch(()=>null); if(!r.ok)throw new Error("video_history_db_error:"+String(d?.message||d?.hint||r.status).slice(0,300)); return Array.isArray(d)?d:[];
  };
  if(!videoId && /^V\d{1,3}$/.test(ref)){
    const rank=Math.max(1,Number(ref.slice(1)));
    const rows=await callRpc(start,start,null,null,Math.max(rank,5));
    videoId=String(rows[rank-1]?.video_id||"");
  }
  const rows=await callRpc(start,end,videoId||null,creator||null,Math.min(100,Math.max(1,Number(args?.limit||100))));
  return {ok:true,period:{timezone:TZ,start_date:start,end_date:end},query:{video_id:videoId||null,video_ref:ref||null,creator:creator||null},count:rows.length,rows};
}
if(name==="list_order_ids"){
  const date=isoDateOnly(args?.date); let start=isoDateOnly(args?.start_date),end=isoDateOnly(args?.end_date);
  if(date){start=date;end=date;} if(!start){start=isoDateOnly(new Date())!;end=start;} if(!end)end=start;
  const r1=dayRangeJakarta(start),r2=dayRangeJakarta(end);
  const result=await callTikTok("audit_orders",{create_time_ge:r1.start,create_time_lt:r2.end,page_size:100});
  const ids=Array.isArray(result?.data?.order_ids)?result.data.order_ids.map((x:any)=>String(x).trim()).filter(Boolean):[];
  return {ok:true,timezone:TZ,start_date:start,end_date:end,count:ids.length,order_ids:[...new Set(ids)]};
}
if(name==="reconcile_orders"){
  const date=isoDateOnly(args?.date); let start=isoDateOnly(args?.start_date),end=isoDateOnly(args?.end_date);
  if(date){start=date;end=date;} if(!start){start=isoDateOnly(new Date())!;end=start;} if(!end)end=start;
  const r1=dayRangeJakarta(start),r2=dayRangeJakarta(end);
  const result=await callTikTok("orders",{create_time_ge:r1.start,create_time_lt:r2.end,page_size:100});
  const orders=Array.isArray(result?.data?.orders)?result.data.orders:[];
  const id=(o:any)=>String(o?.id??o?.order_id??o?.order_id_string??"").trim();
  const status=(o:any)=>String(o?.status??o?.order_status??"UNKNOWN").trim()||"UNKNOWN";
  const get=(o:any,...keys:string[])=>{for(const k of keys){if(o?.[k]!==undefined&&o?.[k]!==null)return o[k];}return null;};
  const fields=orders.map((o:any)=>({
    order_id:id(o),status:status(o),create_time:o?.create_time??null,
    is_buyer_request_cancel:get(o,"is_buyer_request_cancel"),
    cancel_reason:get(o,"cancel_reason","cancel_reason_text"),
    shipping_type:get(o,"shipping_type"),
    fulfillment_type:get(o,"fulfillment_type"),
    payment_total:o?.payment?.total_amount??null,
    line_item_count:Array.isArray(o?.line_items)?o.line_items.length:null
  })).filter((x:any)=>x.order_id);
  const buckets:Record<string,any[]>={};
  for(const x of fields){
    const key=x.status+(x.is_buyer_request_cancel===true?"|buyer_cancel":"");
    (buckets[key]??=[]).push(x.order_id);
  }
  const seller=Number(args?.seller_center_count);
  return {ok:true,period:{timezone:TZ,start_date:start,end_date:end,local_start:start+"T00:00:00+07:00",local_end:end+"T00:00:00+07:00"},api:{raw_count:orders.length,unique_order_count:new Set(fields.map((x:any)=>x.order_id)).size},seller_center_count:seller,difference:orders.length-seller,candidate_buckets:Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,{count:v.length,order_ids:v}])),order_summaries:fields};
}
if(name==="sales_summary"){
  const date=isoDateOnly(args?.date); let start=isoDateOnly(args?.start_date),end=isoDateOnly(args?.end_date);
  if(date){start=date;end=date;} if(!start){start=isoDateOnly(new Date())!;end=start;} if(!end)end=start;
  const r1=dayRangeJakarta(start),r2=dayRangeJakarta(end);
  const result=await callTikTok("orders",{create_time_ge:r1.start,create_time_lt:r2.end,page_size:100});
  const orders=Array.isArray(result?.data?.orders)?result.data.orders:[];
  const id=(o:any)=>String(o?.id??o?.order_id??o?.order_id_string??"").trim();
  const status=(o:any)=>String(o?.status??o?.order_status??"UNKNOWN").trim()||"UNKNOWN";
  const unique=new Map<string,any>(); for(const o of orders){const oid=id(o); if(oid&&!unique.has(oid))unique.set(oid,o);}
  const statusCounts:Record<string,number>={}; let transactionValue=0; let valuedOrderCount=0;
  for(const o of unique.values()){
    const s=status(o); statusCounts[s]=(statusCounts[s]||0)+1;
    const v=Number(o?.payment?.total_amount); if(Number.isFinite(v)){transactionValue+=v; valuedOrderCount++;}
  }
  return {ok:true,period:{timezone:TZ,start_date:start,end_date:end,local_start:start+"T00:00:00+07:00",local_end:end+"T00:00:00+07:00"},summary:{raw_order_count:orders.length,unique_order_count:unique.size,duplicate_count:orders.length-unique.size,transaction_value_idr:transactionValue,valued_order_count:valuedOrderCount,unvalued_order_count:unique.size-valuedOrderCount,status_counts:statusCounts}};
}
if(name==="audit_orders"){
  const date=isoDateOnly(args?.date); let start=isoDateOnly(args?.start_date),end=isoDateOnly(args?.end_date);
  if(date){start=date;end=date;} if(!start){start=isoDateOnly(new Date())!;end=start;} if(!end)end=start;
  const r1=dayRangeJakarta(start),r2=dayRangeJakarta(end);
  const result=await callTikTok("audit_orders",{create_time_ge:r1.start,create_time_lt:r2.end,page_size:100});
  if(result?.period){ result.period.timezone=TZ; result.period.local_start=start+"T00:00:00+07:00"; result.period.local_end=end+"T00:00:00+07:00"; }
  return result;
}
if(name==="get_order"){const ids=Array.isArray(args?.order_ids)?args.order_ids:[args?.order_id];return callTikTok("order",{order_ids:ids.filter(Boolean)});}
if(name==="get_tracking")return callTikTok("tracking",{order_id:String(args.order_id)});
if(name==="get_finance")return callTikTok("finance",{order_id:String(args.order_id)});
if(name==="get_orders"){
  const date=isoDateOnly(args?.date);let start=isoDateOnly(args?.start_date),end=isoDateOnly(args?.end_date);
  if(date){start=date;end=date;}if(!start){start=isoDateOnly(new Date())!;end=start;}if(!end)end=start;
  const exactStart=parseJakartaDateTime(args?.start_datetime),exactEnd=parseJakartaDateTime(args?.end_datetime);
  const r1=dayRangeJakarta(start),r2=dayRangeJakarta(end);const createGe=exactStart??r1.start,createLt=exactEnd??r2.end;
  if(createLt<=createGe)throw new Error("invalid_time_range");
  return callTikTok("orders",{create_time_ge:createGe,create_time_lt:createLt,order_status:args?.status||undefined,page_size:Math.min(100,Math.max(1,Number(args?.page_size||100)))});
}
if(name==="sales_trend"){
  const clampRange=(s:string,e:string)=>{const days=Math.round((new Date(e+"T00:00:00Z").getTime()-new Date(s+"T00:00:00Z").getTime())/86400000)+1;return Math.max(1,Math.min(31,days));};
  let start=isoDateOnly(args?.start_date),end=isoDateOnly(args?.end_date);
  if(!end)end=isoDateOnly(new Date())!;
  if(!start)start=addDays(end,-6);
  if(new Date(start+"T00:00:00Z").getTime()>new Date(end+"T00:00:00Z").getTime())[start,end]=[end,start];
  const days=clampRange(start,end); end=addDays(start,days-1);
  const dailyBreakdown=async(s:string,e:string)=>{
    const r1=dayRangeJakarta(s),r2=dayRangeJakarta(e);
    const result=await callTikTok("orders",{create_time_ge:r1.start,create_time_lt:r2.end+86400,page_size:100});
    const orders=Array.isArray(result?.data?.orders)?result.data.orders:[];
    const id=(o:any)=>String(o?.id??o?.order_id??o?.order_id_string??"").trim();
    const status=(o:any)=>String(o?.status??o?.order_status??"UNKNOWN").trim()||"UNKNOWN";
    const localDate=(o:any)=>{const t=Number(o?.create_time);if(!Number.isFinite(t))return null;return new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(t*1000));};
    const unique=new Map<string,any>(); for(const o of orders){const oid=id(o); if(oid&&!unique.has(oid))unique.set(oid,o);}
    const byDate=new Map<string,{count:number,value:number,status_counts:Record<string,number>}>();
    for(const o of unique.values()){
      const d=localDate(o); if(!d) continue;
      const row=byDate.get(d)||{count:0,value:0,status_counts:{}};
      row.count++;
      const v=Number(o?.payment?.total_amount); if(Number.isFinite(v)) row.value+=v;
      const st=status(o); row.status_counts[st]=(row.status_counts[st]||0)+1;
      byDate.set(d,row);
    }
    const rows=[...byDate.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,r])=>({date,unique_orders:r.count,transaction_value_idr:r.value,status_counts:r.status_counts}));
    const totals={unique_orders:unique.size,transaction_value_idr:rows.reduce((s,r)=>s+r.transaction_value_idr,0)};
    return {rows,totals,raw_count:orders.length,duplicate_count:orders.length-unique.size};
  };
  const compareStart=isoDateOnly(args?.compare_start_date),compareEnd0=isoDateOnly(args?.compare_end_date);
  const periodA=await dailyBreakdown(start,end);
  if(compareStart&&compareEnd0){
    const cDays=clampRange(compareStart,compareEnd0); const compareEnd=addDays(compareStart,cDays-1);
    const periodB=await dailyBreakdown(compareStart,compareEnd);
    const pct=(x:number,y:number)=>y===0?(x===0?0:null):Number((((x-y)/y)*100).toFixed(1));
    return {ok:true,timezone:TZ,period_a:{start_date:start,end_date:end,...periodA},period_b:{start_date:compareStart,end_date:compareEnd,...periodB},change:{unique_orders_pct:pct(periodA.totals.unique_orders,periodB.totals.unique_orders),transaction_value_pct:pct(periodA.totals.transaction_value_idr,periodB.totals.transaction_value_idr)}};
  }
  return {ok:true,timezone:TZ,start_date:start,end_date:end,...periodA};
}
if(name==="finance_summary"){
  const date=isoDateOnly(args?.date); let start=isoDateOnly(args?.start_date),end=isoDateOnly(args?.end_date);
  if(date){start=date;end=date;} if(!end){end=isoDateOnly(new Date())!;} if(!start){start=addDays(end,-6);}
  console.log(`[HERMES-FINANCE-SUMMARY] Calling tiktok-api with start_date=${start}, end_date=${end}`);
  const result=await callTikTok("finance_overview",{start_date:start,end_date:end});
  console.log(`[HERMES-FINANCE-SUMMARY] TikTok API response:`, JSON.stringify(result).substring(0,500));
  if(result?.period){result.period.timezone=TZ;}
  return result;
}
throw new Error("unsupported_tool");
}

function extractDateFromText(text:string):string|null{
  const s=normalizeUserDateTypos(String(text||""));
  const m=s.match(/\b(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(20\d{2})\b/i);
  if(!m)return null;
  const months:any={januari:1,februari:2,maret:3,april:4,mei:5,juni:6,juli:7,agustus:8,september:9,oktober:10,november:11,desember:12};
  const month=months[String(m[2]).toLowerCase()],day=Number(m[1]),year=Number(m[3]);
  const d=new Date(Date.UTC(year,month-1,day));
  if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return null;
  return String(year).padStart(4,"0")+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
}

function isDateBasedOrderDetailRequest(text:string):boolean{
  const s=String(text||"").toLowerCase();
  return /(detail|rincian|uraian).*(order|pesanan)|(order|pesanan).*(detail|rincian|uraian)|berikan detail order|berikan detail pesanan|tampilkan detail order|tampilkan detail pesanan/.test(s);
}

function isFinanceQuestion(text:string):boolean{
  const s=String(text||"").toLowerCase();
  return /\b(uang|cair|settlement|fee|netto|bersih|pajak|profit|margin|earning|revenue|payout|tarik|deposit|balance|hutang|finansial|keuangan|pendapatan)\b/i.test(s);
}

function needsStoreTools(messages:any[]){return true;}
async function searchLongTermMemory(chatId:string,query:string){const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get(["SUPABASE","SERVICE","ROLE","KEY"].join("_"));if(!base||!key||!chatId||!query)return [];try{const r=await fetch(base+"/functions/v1/hermes-memory",{method:"POST",headers:{apikey:key,authorization:"Bearer "+key,"content-type":"application/json"},body:JSON.stringify({action:"search",chat_id:chatId,query,limit:8,threshold:0.60})});const d=await r.json().catch(()=>null);return r.ok&&Array.isArray(d?.results)?d.results:[]}catch(e){console.error("HERMES_LONG_TERM_MEMORY_SEARCH_ERROR",String(e));return []}}
async function writeLongTermMemory(chatId:string,args:any){const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get(["SUPABASE","SERVICE","ROLE","KEY"].join("_"));if(!base||!key)throw new Error("backend_configuration_incomplete");const r=await fetch(base+"/functions/v1/hermes-memory",{method:"POST",headers:{apikey:key,authorization:"Bearer "+key,"content-type":"application/json"},body:JSON.stringify({...args,action:"create",chat_id:chatId})});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error("memory_write_error:"+String(d?.error||r.status).slice(0,300));return d}
async function logHermesToolRun(chatId:string,requestId:string,intent:string,toolName:string,sourceName:string,args:any,result:any,status:string,errorMessage:string|null=null){const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get(["SUPABASE","SERVICE","ROLE","KEY"].join("_"));if(!base||!key)return;try{await fetch(base+"/rest/v1/rpc/hermes_log_tool_run",{method:"POST",headers:{apikey:key,authorization:"Bearer "+key,"content-type":"application/json"},body:JSON.stringify({p_chat_id:chatId||null,p_request_id:requestId,p_intent:intent||null,p_tool_name:toolName,p_source_name:sourceName||null,p_parameters:args||{},p_result_summary:result?.summary||result?.data?.summary||{},p_row_count:Array.isArray(result?.data?.orders)?result.data.orders.length:(Array.isArray(result?.orders)?result.orders.length:null),p_status:status,p_error_message:errorMessage,p_started_at:new Date().toISOString(),p_finished_at:new Date().toISOString(),p_latency_ms:null})})}catch(e){console.error("HERMES_TOOL_LOG_ERROR",String(e))}}
async function conversationHistory(chatId:string){
  const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get(["SUPABASE","SERVICE","ROLE","KEY"].join("_"));
  if(!base||!key||!chatId)return {messages:[],context:{}};
  try{
    const headers={apikey:key,authorization:"Bearer "+key};
    const c=await fetch(base+"/rest/v1/hermes_conversations?chat_id=eq."+encodeURIComponent(chatId)+"&select=summary,context,last_tool,last_user_intent&limit=1",{headers});
    const conversations=await c.json().catch(()=>[]);
    const row=Array.isArray(conversations)&&conversations[0]?conversations[0]:{};
    const url=base+"/rest/v1/hermes_messages?chat_id=eq."+encodeURIComponent(chatId)+"&select=role,content,created_at&order=created_at.desc&limit=20";
    const r=await fetch(url,{headers});
    if(!r.ok)return {messages:[],context:row.context||{}};
    const rows=await r.json().catch(()=>[]);
    const messages=Array.isArray(rows)?rows.reverse().map((x:any)=>({role:String(x.role),content:String(x.content)})):[];
    return {messages,context:row.context||{},last_tool:row.last_tool||null,last_user_intent:row.last_user_intent||null};
  }catch{return {messages:[],context:{}};}
}
async function saveConversation(chatId:string,userText:string,assistantText:string,context:any,lastTool:string|null,lastIntent:string|null){
  const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get(["SUPABASE","SERVICE","ROLE","KEY"].join("_"));
  if(!base||!key||!chatId)return;
  try{
    const headers={apikey:key,authorization:"Bearer "+key,"content-type":"application/json"};
    await fetch(base+"/rest/v1/hermes_conversations",{method:"POST",headers:{...headers,"prefer":"resolution=merge-duplicates"},body:JSON.stringify({chat_id:chatId,updated_at:new Date().toISOString(),context:context||{},last_tool:lastTool,last_user_intent:lastIntent})});
    await fetch(base+"/rest/v1/hermes_messages",{method:"POST",headers:{...headers,"prefer":"return=minimal"},body:JSON.stringify([{chat_id:chatId,role:"user",content:userText},{chat_id:chatId,role:"assistant",content:assistantText}])});
  }catch(e){console.error("HERMES_MEMORY_SAVE_ERROR",String(e));}
}
function contextMessage(c:any){
  if(!c||typeof c!=="object"||!Object.keys(c).length)return null;
  return {role:"system",content:"KONTEKS AKTIF HERMES (gunakan hanya jika relevan, jangan tampilkan metadata ini ke user): "+JSON.stringify(c)};
}
function contextFromTool(name:string,args:any,result:any){
  const c:any={last_tool:name};
  if(args?.date)c.date=args.date;
  if(args?.start_date)c.start_date=args.start_date;
  if(args?.end_date)c.end_date=args.end_date;
  if(args?.start_datetime)c.start_datetime=args.start_datetime;
  if(args?.end_datetime)c.end_datetime=args.end_datetime;
  if(args?.status)c.status=args.status;
  if(args?.product_id)c.product_id=args.product_id;
  if(args?.creator_user_id)c.creator_user_id=args.creator_user_id;
  if(args?.seller_center_count!==undefined)c.seller_center_count=args.seller_center_count;
  if(result?.period)c.period=result.period;
  if(result?.summary)c.last_summary=result.summary;
  if(result?.data?.order_ids)c.order_ids=result.data.order_ids.slice(0,100);
  if(result?.order_ids)c.order_ids=result.order_ids.slice(0,100);
  return c;
}
async function llm(messages:any[]){
const key=Deno.env.get("NINE_ROUTER_API_KEY"),model="combo-wils",apiUrl=(()=>{const raw=(Deno.env.get("NINE_ROUTER_API_URL")||"https://9router.com/v1/chat/completions").replace(/\/$/,"");return /\/chat\/completions$/.test(raw)?raw:raw+"/chat/completions";})();
if(!key){console.error("HERMES_LLM_ERROR","NINE_ROUTER_API_KEY_not_configured");throw new Error("NINE_ROUTER_API_KEY_not_configured");}
let resp:Response;
try{resp=await fetch(apiUrl,{method:"POST",headers:{authorization:"Bearer "+key,"content-type":"application/json"},body:JSON.stringify({model,messages,...(needsStoreTools(messages)?{tools,tool_choice:"auto"}:{}),temperature:.2,max_tokens:6000,stream:false})});}
catch(e){console.error("HERMES_LLM_FETCH_ERROR",String(e instanceof Error?e.message:e));throw new Error("9router_network_error");}
const raw=await resp.text();let data:any=null;try{data=JSON.parse(raw)}catch{}
if(!resp.ok){const detail=String(data?.error?.message||data?.message||raw||"9router_error").slice(0,300);console.error("HERMES_LLM_HTTP_ERROR",JSON.stringify({status:resp.status,model,detail}));throw new Error("9router_http_"+resp.status+":"+detail);}
if(!data?.choices?.[0]?.message){console.error("HERMES_LLM_INVALID_RESPONSE",JSON.stringify({model,detail:raw.slice(0,300)}));throw new Error("9router_invalid_response");}
return data;}
Deno.serve(async req=>{const requestId=crypto.randomUUID();if(req.method!=="POST")return json({ok:false,error:"method_not_allowed",request_id:requestId},405);try{const body=await req.json().catch(()=>({})),rawUserMessage=String(body?.message||body?.user_message||"").trim(),userMessage=normalizeUserDateTypos(rawUserMessage),chatId=String(body?.chat_id||"").trim();if(!userMessage)return json({ok:false,error:"message_required",request_id:requestId},400);
const system=["Kamu adalah Hermes, AI business assistant GUDARA.ID.","Jawab Bahasa Indonesia seperti asisten manusia yang memahami percakapan sehari-hari pemilik toko.","User boleh memakai bahasa santai, singkatan, typo, kalimat pendek, pertanyaan tidak lengkap, atau istilah seperti jualan, laku, orderan, pesanan, duit, uang, omzet, cuan, pembeli, kirim, paket, resi, barang, produk, stok, yang paling laku, hari ini, kemarin, tadi, minggu ini, bulan ini. Pahami MAKSUD user, jangan memaksa istilah teknis.","Gunakan konteks pesan sebelumnya. Jika user merujuk tanggal tersebut, tanggal tadi, detail ordernya, berikan detail order, kemarin, hari ini, atau pertanyaan lanjutan lain, WAJIB gunakan konteks sebelumnya bila tersedia. Jangan meminta tanggal lagi jika konteks sebelumnya sudah jelas.","🔴 RULE PENTING - UNTUK PERTANYAAN KEUANGAN/UANG [FORCE TOOL CALL]:","Jika user bertanya apapun tentang: uang, cair, settlement, fee, netto, bersih, pajak, profit, margin, earning, revenue, payout, tarik, deposit, balance, hutang, atau angka finansial apapun:","  → WAJIB panggil `finance_summary` tool LANGSUNG","  → JANGAN jawab dari memory atau cache","  → JANGAN coba hitung manual","  → Selalu ambil data LIVE dari TikTok API melalui tiktok-api gateway","Untuk SEMUA pertanyaan yang membutuhkan data toko atau TikTok Shop, gunakan tool yang sesuai. Jangan pernah menjawab tanpa tool untuk data toko. Jangan pernah mengarang data order, produk, pembayaran, status, atau ringkasan yang tidak diberikan oleh tool.","Pemetaan maksud: jumlah/berapa banyak orderan/pesanan masuk = audit_orders; ringkasan jualan/penjualan/omzet/berapa yang laku/performa = sales_summary; semua/daftar Order ID = list_order_ids; detail order tertentu = get_order; posisi paket/udah sampai mana/resi = get_tracking; fee/settlement/pencairan/uang yang diterima/GMV finansial per order = get_finance; perbandingan API vs Seller Center = reconcile_orders. performa LIVE/siaran/live shopping = shop_live_performance; performa produk/produk mana yang bagus = shop_product_performance; performa video/konten video/video mana yang bagus atau menghasilkan = video_analytics; performa video historis/perbandingan video/tanggal Video ID/kode V01-V05 = video_history; performa affiliate/creator tertentu = affiliate_creator_performance; analisis tren penjualan naik/turun atau membandingkan performa penjualan antar periode (minggu ini vs minggu lalu, bulan ini vs bulan lalu) = sales_trend; pendapatan bersih/net income/uang sudah cair/belum cair/settlement toko/payout/penghasilan marketplace = finance_summary.","Untuk sales_trend dan finance_summary, WAJIB sajikan jawaban dalam bentuk tabel rincian (per hari, per status, atau per kategori sesuai data yang tersedia), bukan hanya satu angka ringkasan, karena user lebih suka rincian lengkap.","Pertahankan Order ID persis dan jangan memotong digit.","Jangan mengarang data toko. Jika data konflik atau tidak lengkap, jelaskan dengan jujur.","Jangan pernah menampilkan token, secret, credential, atau detail keamanan backend."].join("\n");
const history=chatId?await conversationHistory(chatId):{messages:[],context:{}};
const prior=history.messages||[];
const activeContext=history.context||{};
const longTermMemory=chatId?await searchLongTermMemory(chatId,userMessage):[];
const memoryMsg=longTermMemory.length?{role:"system",content:"LONG-TERM MEMORY HERMES (gunakan hanya jika relevan; jangan tampilkan metadata ini ke user): "+JSON.stringify(longTermMemory)}:null;
const ctxMsg=contextMessage(activeContext);
let messages:any[]=[{role:"system",content:system},...(memoryMsg?[memoryMsg]:[]),...(ctxMsg?[ctxMsg]:[]),...prior,{role:"user",content:userMessage}];
let lastTool:string|null=history.last_tool||null;
let lastIntent:string|null=history.last_user_intent||null;
let workingContext:any={...activeContext};

// FORCE TOOL CALL untuk finance questions
if(isFinanceQuestion(userMessage)){
  console.log(`[HERMES] Finance question detected: "${userMessage}"`);
  try{
    const date=isoDateOnly(new Date());
    console.log(`[HERMES] Calling finance_summary tool with date=${date}`);
    const toolResult=await runTool("finance_summary",{date});
    console.log(`[HERMES] finance_summary tool result:`, JSON.stringify(toolResult).substring(0,500));
    lastTool="finance_summary";
    lastIntent="finance_question";
    workingContext={...workingContext,...contextFromTool("finance_summary",{date},toolResult)};
    await logHermesToolRun(chatId,requestId,"finance_question","finance_summary","tiktok_api",{date},toolResult,"success");
    
    const data=toolResult?.data||{};
    const fmtRp=(n:any)=>"Rp "+Math.round(Number(n)||0).toLocaleString("id-ID");
    const statements=data.statements||{total_amount:0,count:0,by_status:{}};
    const payments=data.payments||{total_amount:0,count:0,by_status:{}};
    const unsettled=data.unsettled||{total_amount:0,count:0};
    const netIncome=data.net_income||{selesai_amount:0,untuk_dibayar_amount:0,total_net_income:0};
    
    const answer="💰 LAPORAN KEUANGAN TIKTOK SHOP\n\nPeriode: "+date+" WIB\n\n📊 RINGKASAN PENDAPATAN BERSIH\n├─ Selesai (Settled): "+fmtRp(netIncome.selesai_amount)+"\n├─ Untuk Dibayar (In Transit): "+fmtRp(netIncome.untuk_dibayar_amount)+"\n└─ Total Pendapatan Bersih: "+fmtRp(netIncome.total_net_income)+"\n\n✅ SETTLEMENT SELESAI\nTotal: "+fmtRp(statements.total_amount)+" ("+statements.count+" transaksi)\n"+(statements.total_revenue!==undefined?"Pendapatan Kotor: "+fmtRp(statements.total_revenue)+"\n":"")+"\n💳 DANA SUDAH CAIR\nTotal: "+fmtRp(payments.total_amount)+" ("+payments.count+" transaksi)\n\n⏳ DANA DALAM PROSES\nTotal: "+fmtRp(unsettled.total_amount)+"\nStatus: Menunggu transfer ke rekening bank.";
    
    if(chatId)await saveConversation(chatId,userMessage,answer,workingContext,"finance_summary","finance_question");
    return json({ok:true,request_id:requestId,answer});
  }catch(e){
    console.error("[HERMES] Error on finance_summary tool:",e);
    return json({ok:false,error:String(e),answer:"Maaf, gagal mengambil data keuangan live dari TikTok API",request_id:requestId},500);
  }
}

for(let i=0;i<6;i++){const completion=await llm(messages),msg=completion?.choices?.[0]?.message;if(!msg)throw new Error("invalid_llm_response");messages.push(msg);const calls=msg.tool_calls||[];if(!calls.length){const answer=String(msg.content||"").trim();if(chatId&&answer)await saveConversation(chatId,userMessage,answer,workingContext,lastTool,lastIntent);return json({ok:true,request_id:requestId,answer});}
for(const call of calls){const name=String(call?.function?.name||"");let args:any={};try{args=JSON.parse(call?.function?.arguments||"{}")}catch{}if(name==="video_analytics"){if(/\b(hari ini|sekarang)\b/i.test(userMessage)){args={};}else if(/\bkemarin\b/i.test(userMessage)&&!extractDateFromText(userMessage)){args={date:videoAvailableDate()};}}lastTool=name;lastIntent=name;try{if(name==="memory_write")args.chat_id=chatId;const toolResult=await runTool(name,args);workingContext={...workingContext,...contextFromTool(name,args,toolResult)};await logHermesToolRun(chatId,requestId,lastIntent||name,name,name==="memory_write"?"hermes-memory":name==="video_history"?"supabase_normalized":"tiktok_api",args,toolResult,"success");messages.push({role:"tool",tool_call_id:call.id,content:JSON.stringify(toolResult)});}catch(e){await logHermesToolRun(chatId,requestId,lastIntent||name,name,name==="memory_write"?"hermes-memory":name==="video_history"?"supabase_normalized":"tiktok_api",args,{ok:false},"error",String(e instanceof Error?e.message:e));messages.push({role:"tool",tool_call_id:call.id,content:JSON.stringify({ok:false,error:String(e instanceof Error?e.message:e)})});}}}
return json({ok:false,error:"max_tool_iterations",request_id:requestId},500);
}catch(e){
const err=String(e instanceof Error?e.message:"internal_error");
console.error("HERMES_REQUEST_ERROR",JSON.stringify({request_id:requestId,error:err}));
const userError=err.startsWith("9router_")?"9Router error: "+err.replace(/^9router_/,"")+"\n\nSaya sedang perbaiki koneksi model Hermes.":err.startsWith("tiktok_api_error:")?"TikTok Shop mengembalikan error analytics: "+err.replace(/^tiktok_api_error:/,"")+"\n\nSaya tidak akan mengarang data.":"Hermes mengalami kendala saat mengambil data.";
return json({ok:false,error:err,answer:userError,request_id:requestId},500);
}});
