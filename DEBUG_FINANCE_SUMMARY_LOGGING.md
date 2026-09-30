// HERMES DEBUG LOGGING - Tambahkan di bagian finance_summary tool handler
if (name === "finance_summary") {
  const date = isoDateOnly(args?.date); 
  let start = isoDateOnly(args?.start_date), end = isoDateOnly(args?.end_date);
  if (date) { start = date; end = date; } 
  if (!end) { end = isoDateOnly(new Date())!; } 
  if (!start) { start = addDays(end, -6); }
  
  console.log(`[HERMES-FINANCE-SUMMARY] Tool called: date=${date}, start=${start}, end=${end}`);
  console.log(`[HERMES-FINANCE-SUMMARY] Chat ID: ${chatId}`);
  
  try {
    const result = await callTikTok("finance_overview", { start_date: start, end_date: end });
    console.log(`[HERMES-FINANCE-SUMMARY] TikTok API response received:`, JSON.stringify(result).substring(0, 500));
    
    if (result?.period) { result.period.timezone = TZ; }
    
    // Format response untuk display user
    const data = result?.data || {};
    console.log(`[HERMES-FINANCE-SUMMARY] Extracted data:`, JSON.stringify(data).substring(0, 500));
    
    const fmtRp = (n: any) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
    const fmtNum = (n: any) => Math.round(Number(n) || 0).toLocaleString("id-ID");
    
    const statements = data.statements || { total_amount: 0, count: 0, by_status: {} };
    const payments = data.payments || { total_amount: 0, count: 0, by_status: {} };
    const unsettled = data.unsettled || { total_amount: 0, count: 0 };
    const netIncome = data.net_income || { selesai_amount: 0, untuk_dibayar_amount: 0, total_net_income: 0 };

    console.log(`[HERMES-FINANCE-SUMMARY] Parsed values:`, {
      statements_total: statements.total_amount,
      payments_total: payments.total_amount,
      unsettled_total: unsettled.total_amount,
      net_income: netIncome.total_net_income
    });

    // Build user-friendly response
    const answer = "💰 LAPORAN KEUANGAN TIKTOK SHOP\n" +
      "\nPeriode: " + start + " → " + end + " WIB\n" +
      "\n📊 RINGKASAN PENDAPATAN BERSIH\n" +
      "├─ Selesai (Settled): " + fmtRp(netIncome.selesai_amount) + "\n" +
      "├─ Untuk Dibayar (In Transit): " + fmtRp(netIncome.untuk_dibayar_amount) + "\n" +
      "└─ Total Pendapatan Bersih: " + fmtRp(netIncome.total_net_income) + "\n" +
      "\n✅ SETTLEMENT SELESAI\n" +
      "Total: " + fmtRp(statements.total_amount) + " (" + fmtNum(statements.count) + " transaksi)\n" +
      (statements.total_revenue !== undefined ? "Pendapatan Kotor: " + fmtRp(statements.total_revenue) + "\n" : "") +
      (statements.total_fee !== undefined ? "Fee Platform: -" + fmtRp(statements.total_fee) + "\n" : "") +
      "Rincian per Status:\n" + 
      Object.entries(statements.by_status || {}).map(([k, v]: any) => 
        "  • " + String(k) + ": " + fmtRp(v.amount) + " (" + fmtNum(v.count) + "x)"
      ).join("\n") + "\n" +
      "\n💳 DANA SUDAH CAIR (Penarikan Berhasil)\n" +
      "Total: " + fmtRp(payments.total_amount) + " (" + fmtNum(payments.count) + " transaksi)\n" +
      "Rincian per Status:\n" + 
      Object.entries(payments.by_status || {}).map(([k, v]: any) => 
        "  • " + String(k) + ": " + fmtRp(v.amount) + " (" + fmtNum(v.count) + "x)"
      ).join("\n") + "\n" +
      "\n⏳ DANA DALAM PROSES (Belum Cair ke Rekening)\n" +
      "Total: " + fmtRp(unsettled.total_amount) + "\n" +
      "Status: Menunggu transfer ke rekening bank.\n" +
      "\n═════════════════════════════\n" +
      "Catatan: Pendapatan Bersih = Selesai + Untuk Dibayar. Dana yang belum cair adalah bagian dari settlement selesai yang masih dalam proses transfer ke rekening.";
    
    console.log(`[HERMES-FINANCE-SUMMARY] Formatted answer length: ${answer.length}`);
    console.log(`[HERMES-FINANCE-SUMMARY] Will return answer to user`);
    
    const toolResult = { ok: true, request_id: "", period: result.period, data, formatted_answer: answer };
    
    if (chatId) await saveConversation(chatId, userMessage, answer, workingContext, "finance_summary", "finance_summary");
    await logHermesToolRun(chatId, requestId, lastIntent || name, name, "tiktok_api", args, toolResult, "success");
    return json({ ok: true, request_id: requestId, answer });
    
  } catch (e) {
    console.error(`[HERMES-FINANCE-SUMMARY] Error occurred:`, e instanceof Error ? e.message : e);
    console.error(`[HERMES-FINANCE-SUMMARY] Full error:`, e);
    return json({ ok: false, error: String(e), answer: "Error mengambil data keuangan", request_id: requestId }, 500);
  }
}
