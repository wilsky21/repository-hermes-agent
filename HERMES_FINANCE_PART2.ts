// PART 2: Hermes Finance Summary Handler dengan format 3 komponen
// Update bagian finance_summary di hermes untuk menampilkan 3 komponen dengan benar

if (name === "finance_summary") {
  const date = isoDateOnly(args?.date); 
  let start = isoDateOnly(args?.start_date), end = isoDateOnly(args?.end_date);
  if (date) { start = date; end = date; } 
  if (!end) { end = isoDateOnly(new Date())!; } 
  if (!start) { start = addDays(end, -6); }
  
  console.log(`[HERMES-FINANCE] Calling finance_overview: start=${start}, end=${end}`);
  
  try {
    const result = await callTikTok("finance_overview", { start_date: start, end_date: end });
    console.log(`[HERMES-FINANCE] Response received`);
    
    if (result?.period) { result.period.timezone = TZ; }
    
    const data = result?.data || {};
    const fmtRp = (n: any) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
    
    const yang_bisa_dicairkan = data.three_components?.yang_bisa_dicairkan || 0;
    const yang_belum_bisa_dicairkan = data.three_components?.yang_belum_bisa_dicairkan || 0;
    const yang_sudah_dicairkan = data.three_components?.yang_sudah_dicairkan || 0;

    const answer = "💰 LAPORAN KEUANGAN TIKTOK SHOP\n\n" +
      "Periode: " + start + " → " + end + " WIB\n\n" +
      "📊 RINGKASAN PENDAPATAN BERSIH\n" +
      "├─ Yang bisa dicairkan: " + fmtRp(yang_bisa_dicairkan) + "\n" +
      "├─ Yang belum bisa dicairkan: " + fmtRp(yang_belum_bisa_dicairkan) + "\n" +
      "└─ Yang sudah dicairkan: " + fmtRp(yang_sudah_dicairkan) + "\n\n" +
      "✅ SETTLEMENT SELESAI\n" +
      "Total: " + fmtRp(yang_bisa_dicairkan) + " (" + Math.round(data.statements?.count || 0) + " transaksi)\n\n" +
      "⏳ UNTUK DIBAYAR (In Transit)\n" +
      "Total: " + fmtRp(yang_belum_bisa_dicairkan) + " (" + Math.round(data.unsettled?.count || 0) + " transaksi)\n" +
      "Status: Menunggu transfer ke rekening bank.\n\n" +
      "💳 SUDAH DICAIRKAN\n" +
      "Total: " + fmtRp(yang_sudah_dicairkan) + " (" + Math.round(data.withdrawals?.count || 0) + " transaksi)";
    
    if (chatId) await saveConversation(chatId, userMessage, answer, workingContext, "finance_summary", "finance_question");
    await logHermesToolRun(chatId, requestId, "finance_question", "finance_summary", "tiktok_api", args, result, "success");
    return json({ ok: true, request_id: requestId, answer });
    
  } catch (e) {
    console.error(`[HERMES-FINANCE] Error:`, e);
    return json({ ok: false, error: String(e), answer: "Maaf, gagal mengambil data keuangan", request_id: requestId }, 500);
  }
}
