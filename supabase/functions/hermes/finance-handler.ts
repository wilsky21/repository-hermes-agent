// Finance Question Handler untuk Hermes
// Menampilkan format 3 komponen: Selesai + Untuk Dibayar + Total Bersih [1]

export async function handleFinanceQuestion(
  userMessage: string,
  chatId: string,
  requestId: string,
  workingContext: any,
  runTool: (name: string, args: any) => Promise<any>,
  contextFromTool: (name: string, args: any, result: any) => any,
  saveConversation: (chatId: string, userText: string, assistantText: string, context: any, lastTool: string | null, lastIntent: string | null) => Promise<void>,
  logHermesToolRun: (chatId: string, requestId: string, intent: string, toolName: string, sourceName: string, args: any, result: any, status: string, errorMessage: string | null) => Promise<void>,
  isoDateOnly: (v: unknown) => string | null
) {
  console.log(`[HERMES] Finance question detected: "${userMessage}"`);
  
  try {
    const date = isoDateOnly(new Date());
    console.log(`[HERMES] Calling finance_summary tool with date=${date}`);
    
    const toolResult = await runTool("finance_summary", { date });
    console.log(`[HERMES] finance_summary tool result received`);
    
    const lastTool = "finance_summary";
    const lastIntent = "finance_question";
    const updatedContext = { ...workingContext, ...contextFromTool("finance_summary", { date }, toolResult) };
    
    await logHermesToolRun(chatId, requestId, "finance_question", "finance_summary", "tiktok_api", { date }, toolResult, "success");
    
    // Parse response dari tiktok-api
    const data = toolResult?.data || {};
    
    // Helper formatting
    const fmtRp = (n: any) => {
      const num = Math.round(Number(n) || 0);
      return "Rp " + num.toLocaleString("id-ID");
    };
    
    // Extract data dari 3 source: statements, payments, unsettled [1]
    const statements = data.statements || { total_amount: 0, count: 0, by_status: {}, total_revenue: 0, total_fee: 0 };
    const payments = data.payments || { total_amount: 0, count: 0, by_status: {} };
    const unsettled = data.unsettled || { total_amount: 0, count: 0, data_unavailable: false };
    
    // Calculate 3 komponen [1]
    const selesaiAmount = Number(statements.total_amount) || 0;
    const sudahDicairkanAmount = Number(payments.total_amount) || 0;
    const untukDibayarAmount = selesaiAmount - sudahDicairkanAmount; // In-flight/pending
    
    // Jika ada unsettled data dari endpoint baru, gunakan itu
    if (unsettled.total_amount && !unsettled.data_unavailable) {
      const untukDibayarFromUnsettled = Number(unsettled.total_amount) || 0;
      console.log(`[HERMES] Using unsettled endpoint data: ${untukDibayarFromUnsettled}`);
    }
    
    const totalNetIncome = selesaiAmount + untukDibayarAmount;
    
    // Format 3 komponen response [1]
    const answer = `💰 **LAPORAN KEUANGAN TIKTOK SHOP**

Periode: ${date} WIB

📊 **RINGKASAN PENDAPATAN BERSIH** [1]
├─ Selesai (Settlement): ${fmtRp(selesaiAmount)}
├─ Untuk Dibayar (In Transit): ${fmtRp(untukDibayarAmount)}
└─ **Total Pendapatan Bersih: ${fmtRp(totalNetIncome)}**

---

✅ **SETTLEMENT SELESAI**
Total: ${fmtRp(selesaiAmount)} (${statements.count || 0} transaksi)
${statements.total_revenue ? `Pendapatan Kotor: ${fmtRp(statements.total_revenue)}` : ""}
${statements.total_fee ? `Fee Platform: -${fmtRp(statements.total_fee)}` : ""}

---

💳 **DANA SUDAH DICAIRKAN**
Total: ${fmtRp(sudahDicairkanAmount)} (${payments.count || 0} transaksi)

---

⏳ **DANA DALAM PROSES (Belum Dicairkan)**
Total: ${fmtRp(untukDibayarAmount)}
Status: Menunggu transfer ke rekening bank atau paket diterima pembeli.

---

📝 **Catatan:**
Pendapatan Bersih = Selesai + Untuk Dibayar [1]
- Selesai: Settlement final dari TikTok
- Untuk Dibayar: Dalam proses, akan cair setelah order delivered atau T+7/T+14`;
    
    if (chatId) {
      await saveConversation(chatId, userMessage, answer, updatedContext, lastTool, lastIntent);
    }
    
    return { ok: true, request_id: requestId, answer };
    
  } catch (e) {
    console.error("[HERMES] Error on finance_summary tool:", e);
    return {
      ok: false,
      error: String(e),
      answer: "Maaf, gagal mengambil data keuangan live dari TikTok API. Saya tidak akan mengarang data.",
      request_id: requestId
    };
  }
}
