const mongoose = require('mongoose');
const BigNumber = require('bignumber.js');
const { ChequeLayout, ChequeRegister, LedgerAccount } = require('../models');

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const TEENS = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertLessThanThousand(num) {
  let str = '';
  if (num >= 100) {
    str += ONES[Math.floor(num / 100)] + ' Hundred ';
    num %= 100;
  }
  if (num >= 10 && num <= 19) {
    str += TEENS[num - 10] + ' ';
  } else if (num >= 20) {
    str += TENS[Math.floor(num / 10)] + ' ';
    if (num % 10 > 0) {
      str += ONES[num % 10] + ' ';
    }
  } else if (num > 0) {
    str += ONES[num] + ' ';
  }
  return str.trim();
}

/**
 * Converts numbers into standard Indian English Words (Rupees & Paise)
 * Uses Indian numbering system: Crores, Lakhs, Thousands, Hundreds.
 */
function numberToIndianWords(amount) {
  const bn = new BigNumber(amount);
  if (bn.isZero()) return 'Zero Rupees Only';

  const parts = bn.toFixed(2).split('.');
  let num = parseInt(parts[0], 10);
  const paise = parseInt(parts[1], 10);

  let words = '';

  // Crores (>= 1,00,00,000)
  if (num >= 10000000) {
    const crores = Math.floor(num / 10000000);
    words += convertLessThanThousand(crores) + ' Crore ';
    num %= 10000000;
  }

  // Lakhs (>= 1,00,000)
  if (num >= 100000) {
    const lakhs = Math.floor(num / 100000);
    words += convertLessThanThousand(lakhs) + ' Lakh ';
    num %= 100000;
  }

  // Thousands (>= 1,000)
  if (num >= 1000) {
    const thousands = Math.floor(num / 1000);
    words += convertLessThanThousand(thousands) + ' Thousand ';
    num %= 1000;
  }

  // Hundreds & Remaining
  if (num > 0) {
    words += convertLessThanThousand(num) + ' ';
  }

  words = words.trim() + ' Rupees';

  if (paise > 0) {
    words += ' and ' + convertLessThanThousand(paise) + ' Paise';
  }

  return words + ' Only';
}

/**
 * Issues a new cheque and renders precise HTML for browser / printer output.
 */
async function issueAndPrintCheque({
  tenantId,
  companyId,
  userId,
  bankAccountId,
  chequeNumber,
  chequeDate = new Date(),
  payeeName,
  amount,
  voucherId = null,
  notes = '',
  session = null
}) {
  const bankAcc = await LedgerAccount.findOne({
    _id: bankAccountId,
    tenant_id: tenantId,
    ...(companyId ? { company_id: companyId } : {})
  });
  if (!bankAcc) throw new Error('Bank account not found');

  const cleanChequeNum = String(chequeNumber).trim();

  // Assert no duplicate cheque number on this bank account
  const existing = await ChequeRegister.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    bank_account_id: bankAcc._id,
    cheque_number: cleanChequeNum
  });

  if (existing) {
    throw new Error(`Cheque number "${cleanChequeNum}" has already been issued on ${existing.cheque_date.toISOString().slice(0, 10)} to "${existing.payee_name}" (Status: ${existing.status})`);
  }

  const amtBN = new BigNumber(amount);
  if (amtBN.isLessThanOrEqualTo(0)) {
    throw new Error('Cheque amount must be greater than zero');
  }

  const amountWords = numberToIndianWords(amtBN.toFixed(2));

  // Find bank layout or use default CTS-2010
  let layout = await ChequeLayout.findOne({
    tenant_id: tenantId,
    company_id: companyId,
    bank_account_id: bankAcc._id,
    status: 'ACTIVE'
  });

  if (!layout) {
    layout = await ChequeLayout.findOne({
      tenant_id: tenantId,
      company_id: companyId,
      status: 'ACTIVE'
    });
  }

  if (!layout) {
    // Default fallback CTS-2010
    layout = {
      cheque_width_mm: 203,
      cheque_height_mm: 93,
      date_coordinates: { x_mm: 153, y_mm: 12, letter_spacing_mm: 4.8 },
      payee_coordinates: { x_mm: 22, y_mm: 28 },
      amount_words_coordinates: { line1_x_mm: 28, line1_y_mm: 38, line2_x_mm: 15, line2_y_mm: 46, max_chars_line1: 45 },
      amount_figures_coordinates: { x_mm: 152, y_mm: 44, prefix: '**₹ ' },
      ac_payee_crossing: { enabled: true, x_mm: 18, y_mm: 8, text: 'A/C PAYEE ONLY' }
    };
  }

  // Format Date characters with spacing (e.g. "2 4 1 0 2 0 2 6")
  const cDate = new Date(chequeDate);
  const dd = String(cDate.getDate()).padStart(2, '0');
  const mm = String(cDate.getMonth() + 1).padStart(2, '0');
  const yyyy = String(cDate.getFullYear());
  const dateFormatted = `${dd}${mm}${yyyy}`.split('').join('  ');

  // Split words across 2 lines if long
  let wordsLine1 = amountWords;
  let wordsLine2 = '';
  const maxLine1 = layout.amount_words_coordinates?.max_chars_line1 || 45;
  if (amountWords.length > maxLine1) {
    const lastSpace = amountWords.lastIndexOf(' ', maxLine1);
    if (lastSpace > 0) {
      wordsLine1 = amountWords.slice(0, lastSpace);
      wordsLine2 = amountWords.slice(lastSpace + 1);
    }
  }

  // Generate printable HTML with millimetric positioning
  const printableHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cheque ${cleanChequeNum} - ${payeeName}</title>
  <style>
    @page {
      size: ${layout.cheque_width_mm}mm ${layout.cheque_height_mm}mm;
      margin: 0;
    }
    body {
      margin: 0;
      padding: 0;
      width: ${layout.cheque_width_mm}mm;
      height: ${layout.cheque_height_mm}mm;
      position: relative;
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      font-weight: bold;
      color: #000;
      background: transparent;
      overflow: hidden;
    }
    .crossing {
      position: absolute;
      left: ${layout.ac_payee_crossing?.x_mm || 18}mm;
      top: ${layout.ac_payee_crossing?.y_mm || 8}mm;
      border-top: 1.5px solid #000;
      border-bottom: 1.5px solid #000;
      padding: 2px 8px;
      font-size: 11px;
      transform: rotate(-15deg);
    }
    .date {
      position: absolute;
      left: ${layout.date_coordinates?.x_mm || 153}mm;
      top: ${layout.date_coordinates?.y_mm || 12}mm;
      letter-spacing: ${layout.date_coordinates?.letter_spacing_mm || 4.8}mm;
    }
    .payee {
      position: absolute;
      left: ${layout.payee_coordinates?.x_mm || 22}mm;
      top: ${layout.payee_coordinates?.y_mm || 28}mm;
      max-width: 135mm;
      white-space: nowrap;
    }
    .words-1 {
      position: absolute;
      left: ${layout.amount_words_coordinates?.line1_x_mm || 28}mm;
      top: ${layout.amount_words_coordinates?.line1_y_mm || 38}mm;
    }
    .words-2 {
      position: absolute;
      left: ${layout.amount_words_coordinates?.line2_x_mm || 15}mm;
      top: ${layout.amount_words_coordinates?.line2_y_mm || 46}mm;
    }
    .figures {
      position: absolute;
      left: ${layout.amount_figures_coordinates?.x_mm || 152}mm;
      top: ${layout.amount_figures_coordinates?.y_mm || 44}mm;
    }
  </style>
</head>
<body onload="window.print()">
  ${layout.ac_payee_crossing?.enabled ? `<div class="crossing">${layout.ac_payee_crossing.text}</div>` : ''}
  <div class="date">${dateFormatted}</div>
  <div class="payee">${payeeName} ***</div>
  <div class="words-1">${wordsLine1}</div>
  ${wordsLine2 ? `<div class="words-2">${wordsLine2} ***</div>` : ''}
  <div class="figures">${layout.amount_figures_coordinates?.prefix || '**₹ '}${amtBN.toFixed(2)} /-</div>
</body>
</html>
  `.trim();

  const registerEntry = new ChequeRegister({
    tenant_id: tenantId,
    company_id: companyId,
    bank_account_id: bankAcc._id,
    cheque_number: cleanChequeNum,
    cheque_date: cDate,
    payee_name: payeeName,
    amount: mongoose.Types.Decimal128.fromString(amtBN.toFixed(2)),
    amount_in_words: amountWords,
    voucher_id: voucherId || null,
    status: 'ISSUED',
    printed_at: new Date(),
    notes
  });

  await registerEntry.save(session ? { session } : undefined);

  return {
    cheque: registerEntry,
    amount_in_words: amountWords,
    printable_html: printableHtml
  };
}

module.exports = {
  numberToIndianWords,
  issueAndPrintCheque
};
