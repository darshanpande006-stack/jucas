'use strict';
// WhatsApp-first communication.
//
// Adapter pattern: today the default adapter LOGS every message to comm_logs
// and hands the operator a wa.me deep link (opens WhatsApp with the message
// pre-filled — zero-cost and works immediately on any phone). Swapping in the
// WhatsApp Business Cloud API later means implementing send() in a new adapter
// and setting it with setAdapter(); nothing else in the app changes.

const { t } = require('../i18n');
const { inr, fmtDate, waPhone } = require('../lib/util');

class ManualWaMeAdapter {
  // Returns {status, link}. status 'logged' = handed off to operator's phone.
  send(phone, body) {
    const p = waPhone(phone);
    const link = p ? `https://wa.me/${p}?text=${encodeURIComponent(body)}` : null;
    return { status: 'logged', link };
  }
}

/* Plug-in point for the real API, e.g.:
class CloudApiAdapter {
  async send(phone, body) {
    // POST https://graph.facebook.com/v19.0/<phone_number_id>/messages
    // with a pre-approved template; return { status: 'sent'|'failed' }
  }
} */

let adapter = new ManualWaMeAdapter();
function setAdapter(a) { adapter = a; }

// ── Trilingual message templates ──
const TEMPLATES = {
  proposal_link: (lang, v) => ({
    en: `Namaskar ${v.name} 🙏\nYour quotation from ${t('business_name', lang)} is ready:\n${v.url}\n${v.guests} guests · ${fmtDate(v.date, lang)} · ${inr(v.perPlate)}/plate.\nOpen the link to view the full menu and confirm.`,
    hi: `नमस्कार ${v.name} 🙏\n${t('business_name', lang)} की ओर से आपका कोटेशन तैयार है:\n${v.url}\n${v.guests} मेहमान · ${fmtDate(v.date, lang)} · ${inr(v.perPlate)}/थाली।\nपूरा मेनू देखने और बुकिंग पक्की करने के लिए लिंक खोलें।`,
    mr: `नमस्कार ${v.name} 🙏\n${t('business_name', lang)} कडून तुमचे दरपत्रक तयार आहे:\n${v.url}\n${v.guests} पाहुणे · ${fmtDate(v.date, lang)} · ${inr(v.perPlate)}/ताट.\nपूर्ण मेनू पाहण्यासाठी व बुकिंग पक्की करण्यासाठी लिंक उघडा.`,
  }[lang]),

  booking_confirmed: (lang, v) => ({
    en: `Namaskar ${v.name} 🙏\nYour booking with ${t('business_name', lang)} is CONFIRMED ✅\n${fmtDate(v.date, lang)} · ${v.guests} guests · ${v.venue || ''}\nTotal ${inr(v.total)} (advance ${inr(v.advance)}).\nTrack anytime: ${v.url}`,
    hi: `नमस्कार ${v.name} 🙏\n${t('business_name', lang)} में आपकी बुकिंग पक्की हो गई ✅\n${fmtDate(v.date, lang)} · ${v.guests} मेहमान · ${v.venue || ''}\nकुल ${inr(v.total)} (एडवांस ${inr(v.advance)})।\nस्थिति देखें: ${v.url}`,
    mr: `नमस्कार ${v.name} 🙏\n${t('business_name', lang)} कडे तुमची बुकिंग पक्की झाली ✅\n${fmtDate(v.date, lang)} · ${v.guests} पाहुणे · ${v.venue || ''}\nएकूण ${inr(v.total)} (आगाऊ ${inr(v.advance)}).\nस्थिती पहा: ${v.url}`,
  }[lang]),

  payment_receipt: (lang, v) => ({
    en: `Namaskar ${v.name} 🙏\nReceived ${inr(v.amount)} by ${v.method} on ${fmtDate(v.date, lang)}. Balance due: ${inr(v.balance)}.\n— ${t('business_name', lang)}`,
    hi: `नमस्कार ${v.name} 🙏\n${fmtDate(v.date, lang)} को ${v.method} से ${inr(v.amount)} मिले। बकाया: ${inr(v.balance)}।\n— ${t('business_name', lang)}`,
    mr: `नमस्कार ${v.name} 🙏\n${fmtDate(v.date, lang)} रोजी ${v.method} ने ${inr(v.amount)} मिळाले. येणे बाकी: ${inr(v.balance)}.\n— ${t('business_name', lang)}`,
  }[lang]),

  payment_reminder: (lang, v) => ({
    en: `Namaskar ${v.name} 🙏\nGentle reminder from ${t('business_name', lang)}: balance of ${inr(v.balance)} is due for your event on ${fmtDate(v.date, lang)}. UPI: ${v.upi}`,
    hi: `नमस्कार ${v.name} 🙏\n${t('business_name', lang)} की ओर से विनम्र स्मरण: ${fmtDate(v.date, lang)} के कार्यक्रम का ${inr(v.balance)} बकाया है। UPI: ${v.upi}`,
    mr: `नमस्कार ${v.name} 🙏\n${t('business_name', lang)} कडून नम्र आठवण: ${fmtDate(v.date, lang)} च्या कार्यक्रमाचे ${inr(v.balance)} येणे बाकी आहे. UPI: ${v.upi}`,
  }[lang]),

  staff_invite: (lang, v) => ({
    en: `Namaskar ${v.name} 🙏\nWork on ${fmtDate(v.date, lang)} (${v.meal}) at ${v.venue || 'venue TBD'} — role: ${v.role}, rate ${inr(v.rate)}/day. ${v.guests} guests. Reply YES to confirm.\n— ${t('business_name', lang)}`,
    hi: `नमस्कार ${v.name} 🙏\n${fmtDate(v.date, lang)} (${v.meal}) को ${v.venue || ''} में काम है — काम: ${v.role}, मज़दूरी ${inr(v.rate)}/दिन। ${v.guests} मेहमान। आने के लिए YES भेजें।\n— ${t('business_name', lang)}`,
    mr: `नमस्कार ${v.name} 🙏\n${fmtDate(v.date, lang)} (${v.meal}) रोजी ${v.venue || ''} येथे काम आहे — काम: ${v.role}, रोजंदारी ${inr(v.rate)}/दिवस. ${v.guests} पाहुणे. येणार असाल तर YES पाठवा.\n— ${t('business_name', lang)}`,
  }[lang]),

  quote_ack: (lang, v) => ({
    en: `Namaskar ${v.name} 🙏\nThank you for your enquiry with ${t('business_name', lang)}! We will send your quotation shortly. Track it here: ${v.url}`,
    hi: `नमस्कार ${v.name} 🙏\n${t('business_name', lang)} से संपर्क के लिए धन्यवाद! हम जल्द ही कोटेशन भेजेंगे। यहाँ देखें: ${v.url}`,
    mr: `नमस्कार ${v.name} 🙏\n${t('business_name', lang)} कडे चौकशी केल्याबद्दल धन्यवाद! आम्ही लवकरच दरपत्रक पाठवू. येथे पहा: ${v.url}`,
  }[lang]),
};

// Render a template, log it to comm_logs, and return {body, link, logId}.
function sendTemplate(db, { templateKey, lang, phone, vars, clientId, leadId, eventId, staffId }) {
  const tpl = TEMPLATES[templateKey];
  if (!tpl) throw new Error(`unknown WhatsApp template: ${templateKey}`);
  const body = tpl(lang || 'mr', vars);
  const { status, link } = adapter.send(phone, body);
  const logId = Number(db.prepare(`
    INSERT INTO comm_logs (client_id, lead_id, event_id, staff_id, channel, direction, template_key, lang, body, status)
    VALUES (?,?,?,?, 'whatsapp', 'out', ?, ?, ?, ?)`)
    .run(clientId ?? null, leadId ?? null, eventId ?? null, staffId ?? null, templateKey, lang || 'mr', body, status)
    .lastInsertRowid);
  return { body, link, logId };
}

module.exports = { sendTemplate, setAdapter, TEMPLATES };
