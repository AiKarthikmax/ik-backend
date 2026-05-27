import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Transaction, Habit, HabitLog, JournalEntry, GratitudeLog, Loan, TempLoan, FormalLoan, FormalLoanPayment } from "./types";

// ─── Sanitizer to prevent jsPDF font/character encoding corruption ─
function cleanStr(val: any): any {
  if (typeof val === "string") {
    return val
      .replace(/\u20b9/g, "Rs.")
      .replace(/[\u2014\u2013]/g, "-")
      .replace(/\u2192/g, "->")
      .replace(/\u21b3/g, "->")
      .replace(/\u00d7/g, "x")
      .replace(/[^\x00-\x7F]/g, ""); // strip other non-ASCII characters to keep output strictly ASCII
  }
  return val;
}

function cleanRow(row: any[]): any[] {
  return row.map(cleanStr);
}

function cleanBody(body: any[][]): any[][] {
  return body.map(cleanRow);
}

// ─── Color Palette ──────────────────────────────────────────────
const COLORS = {
  primary: [15, 23, 42] as [number, number, number],       // slate-950
  accent: [99, 102, 241] as [number, number, number],      // indigo-500
  success: [16, 185, 129] as [number, number, number],     // emerald-500
  danger: [239, 68, 68] as [number, number, number],       // red-500
  warning: [245, 158, 11] as [number, number, number],     // amber-500
  muted: [148, 163, 184] as [number, number, number],      // slate-400
  light: [241, 245, 249] as [number, number, number],      // slate-100
  white: [255, 255, 255] as [number, number, number],
};

// ─── Helper: Draw Premium Header ─────────────────────────────────
function drawHeader(doc: jsPDF, title: string, subtitle: string, dateStr: string, dateRange?: { start: string; end: string }) {
  const pageW = doc.internal.pageSize.width;

  const cleanTitle = cleanStr(title);
  const cleanSubtitle = cleanStr(subtitle);
  const cleanDateStr = cleanStr(dateStr);

  // Gradient-like banner background
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageW, 36, "F");

  // Accent left stripe
  doc.setFillColor(...COLORS.accent);
  doc.rect(0, 0, 5, 36, "F");

  // App name
  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("iK Personal Finance Management", 12, 14);

  // Report title
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(cleanSubtitle, 12, 21);

  // Generated date
  doc.setFontSize(8);
  doc.text(`Generated: ${cleanDateStr}`, 12, 28);

  if (dateRange?.start && dateRange?.end) {
    doc.text(`Period: ${cleanStr(dateRange.start)} -> ${cleanStr(dateRange.end)}`, pageW / 2, 28, { align: "center" });
  }

  // Right side watermark
  doc.setTextColor(...COLORS.accent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("CONFIDENTIAL", pageW - 12, 14, { align: "right" });

  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Private Financial Report", pageW - 12, 20, { align: "right" });
}

// ─── Helper: Draw Summary Card Row ────────────────────────────────
function drawSummaryCards(doc: jsPDF, cards: { label: string; value: string; color?: [number, number, number] }[], startY: number) {
  const pageW = doc.internal.pageSize.width;
  const margin = 12;
  const totalW = pageW - margin * 2;
  const cardW = totalW / cards.length;
  const cardH = 18;

  cards.forEach((card, i) => {
    const x = margin + i * cardW;
    doc.setFillColor(30, 41, 59); // slate-800
    doc.roundedRect(x + 1, startY, cardW - 2, cardH, 3, 3, "F");

    const labelClean = cleanStr(card.label);
    const valueClean = cleanStr(card.value);

    // Label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(labelClean.toUpperCase(), x + (cardW / 2), startY + 6, { align: "center" });

    // Value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...(card.color || COLORS.white));
    doc.text(valueClean, x + (cardW / 2), startY + 13, { align: "center" });
  });

  return startY + cardH + 6;
}

// ─── Helper: Draw Page Footer ──────────────────────────────────────
function addFooters(doc: jsPDF) {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageW = doc.internal.pageSize.width;
  const pageH = doc.internal.pageSize.height;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(15, 23, 42);
    doc.rect(0, pageH - 12, pageW, 12, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text("iK Personal Finance Management | Private & Confidential", 12, pageH - 5);
    doc.text(`Page ${i} of ${pageCount}`, pageW - 12, pageH - 5, { align: "right" });
  }
}

// ─── Main Export Function ─────────────────────────────────────────
export function generatePDF(
  type: "transactions" | "habits" | "journal" | "gratitude" | "loans" | "tempLoans" | "formalLoans" | "overall",
  data: {
    transactions?: Transaction[];
    habits?: { habit: Habit; logs: HabitLog[] }[];
    journals?: JournalEntry[];
    gratitudes?: GratitudeLog[];
    loans?: Loan[];
    tempLoans?: TempLoan[];
    formalLoans?: FormalLoan[];
    dateRange?: { start: string; end: string };
  }
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const fullDateTimeStr = `${dateStr} at ${timeStr}`;

  // ── TRANSACTIONS ──────────────────────────────────────────────────
  if (type === "transactions" && data.transactions) {
    drawHeader(doc, "Transaction Ledger", "Income & Expense Detailed Statement", fullDateTimeStr, data.dateRange);

    const items = data.transactions.filter(t => !t.deleted);
    const totalInc = items.filter(t => t.type === "income").reduce((s, o) => s + Number(o.amount), 0);
    const totalExp = items.filter(t => t.type === "expense").reduce((s, o) => s + Number(o.amount), 0);
    const netBal = totalInc - totalExp;

    let currentY = drawSummaryCards(doc, [
      { label: "Total Income", value: `Rs. ${totalInc.toLocaleString("en-IN")}`, color: COLORS.success },
      { label: "Total Expense", value: `Rs. ${totalExp.toLocaleString("en-IN")}`, color: COLORS.danger },
      { label: "Net Balance", value: `Rs. ${netBal.toLocaleString("en-IN")}`, color: netBal >= 0 ? COLORS.success : COLORS.danger }
    ], 44);

    // Section title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.primary);
    doc.text("Transaction Ledger - Full Detail", 12, currentY + 6);
    currentY += 10;

    // Running balance calculation (sorted by date)
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
    let runningBalance = 0;
    const rows = sorted.map(t => {
      const amt = Number(t.amount);
      runningBalance += t.type === "income" ? amt : -amt;
      return [
        t.date,
        t.time || "-",
        t.type === "income" ? "INCOME" : "EXPENSE",
        t.category,
        t.subCategory || "-",
        t.description || "-",
        t.paymentMethod || "-",
        t.account || "-",
        `Rs. ${amt.toLocaleString("en-IN")}`,
        `Rs. ${runningBalance.toLocaleString("en-IN")}`
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [cleanRow(["Date", "Time", "Type", "Category", "Sub-Cat", "Description", "Payment", "Account", "Amount", "Balance"])],
      body: cleanBody(rows.length > 0 ? rows : [["-", "-", "-", "-", "-", "No transactions found", "-", "-", "-", "-"]]),
      theme: "grid",
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 7, fontStyle: "bold" },
      bodyStyles: { fontSize: 7, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 18 },  // Date
        1: { cellWidth: 14 },  // Time
        2: { cellWidth: 14 },  // Type
        3: { cellWidth: 25 },  // Category
        4: { cellWidth: 18 },  // Sub-Cat
        5: { cellWidth: 35 },  // Description
        6: { cellWidth: 16 },  // Payment
        7: { cellWidth: 16 },  // Account
        8: { cellWidth: 18 },  // Amount
        9: { cellWidth: 20 },  // Balance
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 2) {
          const val = data.cell.raw as string;
          if (val === "INCOME") data.cell.styles.textColor = COLORS.success;
          else data.cell.styles.textColor = COLORS.danger;
        }
        if (data.section === "body" && data.column.index === 9) {
          data.cell.styles.fontStyle = "bold";
        }
      },
      margin: { left: 12, right: 12 },
    });

    // Category breakdown
    const afterTableY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.primary);
    doc.text("Category-wise Expense Breakdown", 12, afterTableY);

    const catGroups: { [key: string]: number } = {};
    items.filter(t => t.type === "expense").forEach(t => {
      catGroups[t.category] = (catGroups[t.category] || 0) + Number(t.amount);
    });
    const catRows = Object.entries(catGroups).map(([cat, amt]) => [
      cat,
      `Rs. ${amt.toLocaleString("en-IN")}`,
      `${((amt / totalExp) * 100).toFixed(1)}%`
    ]);

    autoTable(doc, {
      startY: afterTableY + 4,
      head: [cleanRow(["Category", "Total Amount", "% of Expenses"])],
      body: cleanBody(catRows.length > 0 ? catRows : [["-", "-", "-"]]),
      theme: "striped",
      headStyles: { fillColor: COLORS.accent, textColor: COLORS.white, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 12, right: 12 },
    });
  }

  // ── HABITS ────────────────────────────────────────────────────────
  else if (type === "habits" && data.habits) {
    drawHeader(doc, "Habit Tracker", "Daily Routine & Habit Completion Report", fullDateTimeStr, data.dateRange);

    const rows = data.habits.map(h => {
      const logs = h.logs;
      const completedCount = logs.filter(l => l.completed).length;
      const rate = logs.length > 0 ? Math.round((completedCount / logs.length) * 100) : 0;
      return [h.habit.name, h.habit.archived ? "Archived" : "Active", logs.length.toString(), completedCount.toString(), `${rate}%`];
    });

    autoTable(doc, {
      startY: 44,
      head: [cleanRow(["Habit Name", "Status", "Days Tracked", "Days Completed", "Success Rate"])],
      body: cleanBody(rows.length > 0 ? rows : [["-", "-", "0", "0", "0%"]]),
      theme: "striped",
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: 12, right: 12 },
    });
  }

  // ── JOURNAL ───────────────────────────────────────────────────────
  else if (type === "journal" && data.journals) {
    drawHeader(doc, "Personal Journal", "Thoughts & Mood Log Report", fullDateTimeStr, data.dateRange);

    const rows = data.journals.filter(j => !j.deleted).map(j => [j.date, j.mood.toUpperCase(), j.content]);

    autoTable(doc, {
      startY: 44,
      head: [cleanRow(["Date", "Mood", "Journal Entry Content"])],
      body: cleanBody(rows.length > 0 ? rows : [["-", "-", "No journal entries found."]]),
      theme: "striped",
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 2: { cellWidth: 130 } },
      margin: { left: 12, right: 12 },
    });
  }

  // ── GRATITUDE ─────────────────────────────────────────────────────
  else if (type === "gratitude" && data.gratitudes) {
    drawHeader(doc, "Gratitude Legacy", "Daily Thankfulness & Gratitude Logs", fullDateTimeStr, data.dateRange);

    const rows = data.gratitudes.map(g => [g.date, g.entries.join("\n")]);

    autoTable(doc, {
      startY: 44,
      head: [cleanRow(["Date", "Gratitude Statements"])],
      body: cleanBody(rows.length > 0 ? rows : [["-", "No gratitude entries found."]]),
      theme: "striped",
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { cellWidth: 160 } },
      margin: { left: 12, right: 12 },
    });
  }

  // ── THAVANAI LOANS ────────────────────────────────────────────────
  else if (type === "loans" && data.loans) {
    drawHeader(doc, "Thavanai Registry", "EMI / Installment Debt Tracker", fullDateTimeStr, data.dateRange);

    const totalPrincipal = data.loans.reduce((s, l) => s + l.amount, 0);
    const totalPaid = data.loans.reduce((s, l) => s + l.installments.reduce((si, i) => si + (i.type === "skip" ? 0 : i.amount), 0), 0);

    let currentY = drawSummaryCards(doc, [
      { label: "Total Principal", value: `Rs. ${totalPrincipal.toLocaleString("en-IN")}` },
      { label: "Total Paid", value: `Rs. ${totalPaid.toLocaleString("en-IN")}`, color: COLORS.success },
      { label: "Outstanding", value: `Rs. ${(totalPrincipal - totalPaid).toLocaleString("en-IN")}`, color: COLORS.danger }
    ], 44);

    const rows = data.loans.map(l => {
      const paid = l.installments.reduce((s, i) => s + (i.type === "skip" ? 0 : i.amount), 0);
      return [
        l.borrowerName,
        l.dateTaken,
        `Rs. ${l.amount.toLocaleString("en-IN")}`,
        `${l.totalInstallments} x Rs. ${l.installmentAmount}/${l.frequency}`,
        `Rs. ${paid.toLocaleString("en-IN")}`,
        `Rs. ${(l.amount - paid).toLocaleString("en-IN")}`,
        l.status.toUpperCase()
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [cleanRow(["Borrower Name", "Date Taken", "Principal", "EMI Terms", "Total Paid", "Remaining", "Status"])],
      body: cleanBody(rows.length > 0 ? rows : [["-", "-", "-", "-", "-", "-", "-"]]),
      theme: "grid",
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 12, right: 12 },
    });
  }

  // ── TEMP LOANS ────────────────────────────────────────────────────
  else if (type === "tempLoans" && data.tempLoans) {
    drawHeader(doc, "Friend Loans Registry", "Borrowed & Lent Money Tracker", fullDateTimeStr, data.dateRange);

    const borrowed = data.tempLoans.filter(t => t.loanDirection === "borrowed");
    const lent = data.tempLoans.filter(t => t.loanDirection === "lent" || !t.loanDirection);

    const totalBorrowedRem = borrowed.reduce((s, l) => {
      const paid = (l.payments || []).reduce((sp, p) => sp + p.amount, 0);
      return s + Math.max(0, l.amount - paid);
    }, 0);
    const totalLentRem = lent.reduce((s, l) => {
      const paid = (l.payments || []).reduce((sp, p) => sp + p.amount, 0);
      return s + Math.max(0, l.amount - paid);
    }, 0);

    let currentY = drawSummaryCards(doc, [
      { label: "I Still Owe (Borrowed)", value: `Rs. ${totalBorrowedRem.toLocaleString("en-IN")}`, color: COLORS.danger },
      { label: "Still Owed to Me (Lent)", value: `Rs. ${totalLentRem.toLocaleString("en-IN")}`, color: COLORS.success },
    ], 44);

    // ─ BORROWED section
    if (borrowed.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.danger);
      doc.text("Section A - Money I Borrowed (I Owe Them)", 12, currentY + 6);
      currentY += 10;

      const borrowedRows: string[][] = [];
      borrowed.forEach(t => {
        const paid = (t.payments || []).reduce((s, p) => s + p.amount, 0);
        borrowedRows.push([
          t.personName,
          `${t.dateBorrowed}${t.timeBorrowed ? " " + t.timeBorrowed : ""}`,
          t.dueDate || "-",
          `Rs. ${t.amount.toLocaleString("en-IN")}`,
          `Rs. ${paid.toLocaleString("en-IN")}`,
          `Rs. ${Math.max(0, t.amount - paid).toLocaleString("en-IN")}`,
          t.status.toUpperCase(),
          t.description || "-"
        ]);
        // Payment timeline rows (indented)
        (t.payments || []).forEach((p, pi) => {
          borrowedRows.push([
            ` -> Payment ${pi + 1}`,
            p.date + (p.time ? " " + p.time : ""),
            "-",
            "-",
            `Rs. ${p.amount.toLocaleString("en-IN")}`,
            "-",
            "paid",
            p.description || "-"
          ]);
        });
      });

      autoTable(doc, {
        startY: currentY,
        head: [cleanRow(["Person", "Borrow Date/Time", "Due Date", "Amount", "Paid Back", "Remaining", "Status", "Notes"])],
        body: cleanBody(borrowedRows),
        theme: "grid",
        headStyles: { fillColor: [127, 29, 29], textColor: COLORS.white, fontSize: 7.5 },
        bodyStyles: { fontSize: 7.5 },
        didParseCell: (data) => {
          if (data.section === "body" && (data.cell.raw as string)?.startsWith(" ->")) {
            data.cell.styles.fillColor = [254, 242, 242];
            data.cell.styles.textColor = [153, 27, 27];
          }
        },
        margin: { left: 12, right: 12 },
      });
      currentY = (doc as any).lastAutoTable.finalY + 8;
    }

    // ─ LENT section
    if (lent.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.success);
      doc.text("Section B - Money I Lent (They Owe Me)", 12, currentY + 6);
      currentY += 10;

      const lentRows: string[][] = [];
      lent.forEach(t => {
        const paid = (t.payments || []).reduce((s, p) => s + p.amount, 0);
        lentRows.push([
          t.personName,
          `${t.dateBorrowed}${t.timeBorrowed ? " " + t.timeBorrowed : ""}`,
          t.dueDate || "-",
          `Rs. ${t.amount.toLocaleString("en-IN")}`,
          `Rs. ${paid.toLocaleString("en-IN")}`,
          `Rs. ${Math.max(0, t.amount - paid).toLocaleString("en-IN")}`,
          t.status.toUpperCase(),
          t.description || "-"
        ]);
        (t.payments || []).forEach((p, pi) => {
          lentRows.push([
            ` -> Payment ${pi + 1}`,
            p.date + (p.time ? " " + p.time : ""),
            "-",
            "-",
            `Rs. ${p.amount.toLocaleString("en-IN")}`,
            "-",
            "received",
            p.description || "-"
          ]);
        });
      });

      autoTable(doc, {
        startY: currentY,
        head: [cleanRow(["Person", "Lent Date/Time", "Due Date", "Amount", "Recovered", "Remaining", "Status", "Notes"])],
        body: cleanBody(lentRows),
        theme: "grid",
        headStyles: { fillColor: [6, 78, 59], textColor: COLORS.white, fontSize: 7.5 },
        bodyStyles: { fontSize: 7.5 },
        didParseCell: (data) => {
          if (data.section === "body" && (data.cell.raw as string)?.startsWith(" ->")) {
            data.cell.styles.fillColor = [240, 253, 244];
            data.cell.styles.textColor = [22, 101, 52];
          }
        },
        margin: { left: 12, right: 12 },
      });
    }
  }

  // ── FORMAL LOANS ──────────────────────────────────────────────────
  else if (type === "formalLoans" && data.formalLoans) {
    drawHeader(doc, "Bank Loans Registry", "Gold, Personal & Housing Loans Report", fullDateTimeStr, data.dateRange);

    const totalFormal = data.formalLoans.reduce((s, f) => s + f.amount, 0);
    let currentY = drawSummaryCards(doc, [
      { label: "Total Loan Amount", value: `Rs. ${totalFormal.toLocaleString("en-IN")}` },
      { label: "Active Loans", value: `${data.formalLoans.filter(f => f.status === "live").length}` },
      { label: "Closed Loans", value: `${data.formalLoans.filter(f => f.status === "closed").length}`, color: COLORS.success }
    ], 44);

    const rows = data.formalLoans.map(f => [
      f.bank,
      f.loanType.toUpperCase(),
      `Rs. ${f.amount.toLocaleString("en-IN")}`,
      f.goldWeight ? `${f.goldWeight} grams` : "-",
      `${f.interestRate}% (${f.interestType})`,
      f.startDate || "-",
      f.status.toUpperCase()
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [cleanRow(["Lender / Bank", "Loan Type", "Principal", "Gold Weight", "Interest", "Start Date", "Status"])],
      body: cleanBody(rows.length > 0 ? rows : [["-", "-", "-", "-", "-", "-", "-"]]),
      theme: "grid",
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 12, right: 12 },
    });
  }

  // ── OVERALL PORTFOLIO ─────────────────────────────────────────────
  else if (type === "overall") {
    drawHeader(doc, "Financial Portfolio", "Complete Financial Health Snapshot", fullDateTimeStr, data.dateRange);

    const trans = data.transactions?.filter(t => !t.deleted) || [];
    const income = trans.filter(t => t.type === "income").reduce((s, o) => s + Number(o.amount), 0);
    const expense = trans.filter(t => t.type === "expense").reduce((s, o) => s + Number(o.amount), 0);

    const loansTotal = data.loans?.reduce((s, o) => s + o.amount, 0) || 0;
    const loansPaid = data.loans?.reduce((s, l) => s + l.installments.reduce((si, i) => si + (i.type === "skip" ? 0 : i.amount), 0), 0) || 0;
    const tempBorrowedRem = (data.tempLoans || []).filter(t => t.loanDirection === "borrowed").reduce((s, l) => {
      const paid = (l.payments || []).reduce((sp, p) => sp + p.amount, 0);
      return s + Math.max(0, l.amount - paid);
    }, 0);
    const tempLentRem = (data.tempLoans || []).filter(t => t.loanDirection === "lent" || !t.loanDirection).reduce((s, l) => {
      const paid = (l.payments || []).reduce((sp, p) => sp + p.amount, 0);
      return s + Math.max(0, l.amount - paid);
    }, 0);
    const formalLoansTotal = data.formalLoans?.reduce((s, o) => s + o.amount, 0) || 0;

    let currentY = drawSummaryCards(doc, [
      { label: "Total Income", value: `Rs. ${income.toLocaleString("en-IN")}`, color: COLORS.success },
      { label: "Total Expense", value: `Rs. ${expense.toLocaleString("en-IN")}`, color: COLORS.danger },
      { label: "Net Cash Balance", value: `Rs. ${(income - expense).toLocaleString("en-IN")}`, color: income >= expense ? COLORS.success : COLORS.danger }
    ], 44);

    const summaryRows = [
      ["Registered Total Income", `Rs. ${income.toLocaleString("en-IN")}`, ""],
      ["Registered Total Expense", `Rs. ${expense.toLocaleString("en-IN")}`, ""],
      ["Net Cash Balance", `Rs. ${(income - expense).toLocaleString("en-IN")}`, income >= expense ? "POSITIVE" : "DEFICIT"],
      ["Thavanai Loans - Principal", `Rs. ${loansTotal.toLocaleString("en-IN")}`, `Paid: Rs. ${loansPaid.toLocaleString("en-IN")}`],
      ["Thavanai Loans - Outstanding", `Rs. ${(loansTotal - loansPaid).toLocaleString("en-IN")}`, ""],
      ["Money I Still Owe Friends", `Rs. ${tempBorrowedRem.toLocaleString("en-IN")}`, "pending repayment"],
      ["Money Friends Owe Me", `Rs. ${tempLentRem.toLocaleString("en-IN")}`, "to be recovered"],
      ["Formal Loans (Bank/Gold)", `Rs. ${formalLoansTotal.toLocaleString("en-IN")}`, ""],
      ["Total Outstanding Liabilities", `Rs. ${((loansTotal - loansPaid) + tempBorrowedRem + formalLoansTotal).toLocaleString("en-IN")}`, "combined"],
      ["Total Expected Receivables", `Rs. ${tempLentRem.toLocaleString("en-IN")}`, "from friends"],
    ];

    autoTable(doc, {
      startY: currentY,
      head: [cleanRow(["Financial Category", "Amount", "Notes"])],
      body: cleanBody(summaryRows),
      theme: "grid",
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 1: { fontStyle: "bold" } },
      margin: { left: 12, right: 12 },
    });
  }

  // Add page footers to all pages
  addFooters(doc);

  // Save file
  const fileName = `iK_${type}_Report_${now.toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

// ─── Individual Loan PDF ──────────────────────────────────────────
export function generateFriendLoanPDF(loan: TempLoan) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const direction = loan.loanDirection === "borrowed" ? "Money I Borrowed" : "Money I Lent";
  const dirColor: [number, number, number] = loan.loanDirection === "borrowed" ? COLORS.danger : COLORS.success;

  drawHeader(doc, `${direction} - ${loan.personName}`, "Individual Friend Loan Detail Report", dateStr);

  const totalPaid = (loan.payments || []).reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, loan.amount - totalPaid);

  let currentY = drawSummaryCards(doc, [
    { label: "Original Amount", value: `Rs. ${loan.amount.toLocaleString("en-IN")}` },
    { label: "Total Paid Back", value: `Rs. ${totalPaid.toLocaleString("en-IN")}`, color: COLORS.success },
    { label: "Remaining Balance", value: `Rs. ${remaining.toLocaleString("en-IN")}`, color: remaining > 0 ? COLORS.danger : COLORS.success }
  ], 44);

  // Details block
  const details = [
    ["Person Name", loan.personName],
    ["Direction", loan.loanDirection === "borrowed" ? "I Borrowed (I Owe Them)" : "I Lent (They Owe Me)"],
    ["Date", `${loan.dateBorrowed}${loan.timeBorrowed ? " at " + loan.timeBorrowed : ""}`],
    ["Due Date", loan.dueDate || "Not specified"],
    ["Status", loan.status.toUpperCase()],
    ["Description / Purpose", loan.description || "-"],
    ["Created At", loan.createdAt ? new Date(loan.createdAt).toLocaleString("en-IN") : "-"],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [cleanRow(["Field", "Value"])],
    body: cleanBody(details),
    theme: "grid",
    headStyles: { fillColor: dirColor, textColor: COLORS.white, fontSize: 8 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
    margin: { left: 12, right: 12 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Payment timeline
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Payment History Timeline", 12, currentY + 4);
  currentY += 8;

  const payRows = (loan.payments || []).length > 0
    ? (loan.payments || []).map((p, i) => [
        `#${i + 1}`,
        p.date,
        p.time || "-",
        p.createdAt ? new Date(p.createdAt).toLocaleString("en-IN") : "-",
        `Rs. ${p.amount.toLocaleString("en-IN")}`,
        p.description || "-"
      ])
    : [["-", "-", "-", "-", "-", "No payments recorded yet"]];

  autoTable(doc, {
    startY: currentY,
    head: [cleanRow(["#", "Payment Date", "Time", "Logged At", "Amount", "Notes"])],
    body: cleanBody(payRows),
    theme: "striped",
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 8 },
    bodyStyles: { fontSize: 8.5 },
    margin: { left: 12, right: 12 },
  });

  addFooters(doc);
  doc.save(`iK_FriendLoan_${loan.personName.replace(/\s+/g, "_")}_${loan.dateBorrowed}.pdf`);
}

// ─── Individual Institutional / Bank Loan PDF ───────────────────────
export function generateFormalLoanPDF(loan: FormalLoan, payments: FormalLoanPayment[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const typeLabel = loan.loanType === "gold" ? "Gold Loan" : loan.loanType === "personal" ? "Personal Loan" : "Home Loan";

  drawHeader(doc, `${typeLabel} - ${loan.bank}`, "Institutional / Bank Loan Detailed Audit Report", dateStr);

  const remaining = loan.remainingAmount !== undefined ? loan.remainingAmount : loan.amount;
  const principalPaid = Math.max(0, loan.amount - remaining);

  // Calculate accrued interest dynamically matching tab calculations
  const calcAccruedInterest = (l: FormalLoan) => {
    if (!l.startDate) return 0;
    const start = new Date(l.startDate);
    if (now < start) return 0;
    const diffTime = Math.abs(now.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const principal = l.remainingAmount !== undefined ? l.remainingAmount : l.amount;
    const rate = l.interestRate;

    if (l.interestType === "monthly") {
      return Math.round((principal * (rate / 100)) * (diffDays / 30));
    } else if (l.interestType === "yearly") {
      return Math.round((principal * (rate / 100)) * (diffDays / 365));
    } else if (l.interestType === "fixed") {
      return rate; // Flat interest
    }
    return 0;
  };

  const accruedInterest = calcAccruedInterest(loan);
  const interestPaid = payments
    .filter((p) => p.isInterestOnly || p.type === "interest-only")
    .reduce((s, p) => s + p.amount, 0);
  const outstandingInterest = Math.max(0, accruedInterest - interestPaid);

  let currentY = drawSummaryCards(doc, [
    { label: "Original Principal", value: `Rs. ${loan.amount.toLocaleString("en-IN")}` },
    { label: "Principal Repaid", value: `Rs. ${principalPaid.toLocaleString("en-IN")}`, color: COLORS.success },
    { label: "Outstanding Principal", value: `Rs. ${remaining.toLocaleString("en-IN")}`, color: remaining > 0 ? COLORS.danger : COLORS.success },
    { label: "Interest Paid Till Date", value: `Rs. ${interestPaid.toLocaleString("en-IN")}`, color: COLORS.accent },
    { label: "Accrued Interest Outstanding", value: `Rs. ${outstandingInterest.toLocaleString("en-IN")}`, color: COLORS.warning }
  ], 44);

  // Time elapsed years/months/days helper
  const getDurationStringRaw = (startDateStr: string | undefined): string => {
    if (!startDateStr) return "N/A";
    const start = new Date(startDateStr);
    if (isNaN(start.getTime())) return "N/A";
    if (now < start) return "0 days";

    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    let days = now.getDate() - start.getDate();

    if (days < 0) {
      months -= 1;
      const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      days += prevMonth.getDate();
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }

    const parts = [];
    if (years > 0) parts.push(`${years} years`);
    if (months > 0) parts.push(`${months} months`);
    if (days > 0 || parts.length === 0) parts.push(`${days} days`);

    const diffTime = Math.abs(now.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return `${parts.join(", ")} (${diffDays} days elapsed)`;
  };

  const durationStr = getDurationStringRaw(loan.startDate);

  // Details block
  const details = [
    ["Lender / Bank", loan.bank],
    ["Loan Contract Type", typeLabel],
    ["Disbursal / Start Date", loan.startDate || "-"],
    ["Elapsed Duration", durationStr],
    ["Interest Rate Basis", `${loan.interestRate}% ${loan.interestType}`],
    ...(loan.loanType === "gold" ? [["Gold Gram Weight", `${loan.goldWeight || 0}g`]] : []),
    ["Loan Status", loan.status.toUpperCase()],
    ["Description / Purpose", loan.description || "-"],
    ["Contract Logged At", loan.createdAt ? new Date(loan.createdAt).toLocaleString("en-IN") : "-"],
    ["Last Updated At", loan.updatedAt ? new Date(loan.updatedAt).toLocaleString("en-IN") : "-"],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [cleanRow(["Contract Details Specifications", "Value"])],
    body: cleanBody(details),
    theme: "grid",
    headStyles: { fillColor: COLORS.accent, textColor: COLORS.white, fontSize: 8 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 } },
    margin: { left: 12, right: 12 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Payment timeline
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Repayment History Logs", 12, currentY + 4);
  currentY += 8;

  const payRows = payments.length > 0
    ? payments.map((p, i) => [
        `#${i + 1}`,
        p.date,
        p.time || "-",
        p.isInterestOnly ? "Interest Only" : p.type ? p.type.toUpperCase() : "Partial Principal",
        `Rs. ${p.amount.toLocaleString("en-IN")}`,
        `Rs. ${p.remainingAfter !== undefined ? p.remainingAfter.toLocaleString("en-IN") : "-"}`,
        p.description || "-"
      ])
    : [["-", "-", "-", "-", "-", "-", "No repayments recorded yet."]];

  autoTable(doc, {
    startY: currentY,
    head: [cleanRow(["#", "Repayment Date", "Time", "Payment Type", "Amount Paid", "Remaining Principal", "Notes / Details"])],
    body: cleanBody(payRows),
    theme: "striped",
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 8 },
    bodyStyles: { fontSize: 8.5 },
    margin: { left: 12, right: 12 },
  });

  addFooters(doc);
  doc.save(`iK_FormalLoan_${loan.bank.replace(/\s+/g, "_")}_${loan.startDate || "Date"}.pdf`);
}

