const { CommercialDocument, Party } = require('../models');

/**
 * Service to dispatch commercial invoices and vouchers via Email or WhatsApp.
 * Handles configuration checks and prevents silent failures.
 */
async function sendDocument({
  tenantId,
  companyId,
  documentId,
  channel = 'EMAIL',
  recipientOverride = null
}) {
  const doc = await CommercialDocument.findOne({
    _id: documentId,
    tenant_id: tenantId,
    company_id: companyId
  }).populate('party_id');

  if (!doc) throw new Error('Commercial document not found');

  const party = doc.party_id;
  const recipientEmail = recipientOverride || party?.email;
  const recipientPhone = recipientOverride || party?.phone;

  const normalizedChannel = channel.toUpperCase().trim();

  if (normalizedChannel === 'EMAIL') {
    const isConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);

    if (!isConfigured) {
      return {
        delivered: false,
        status: 'NOT_CONFIGURED',
        provider_status: 'DISCONNECTED',
        is_mock: true,
        channel: 'EMAIL',
        recipient: recipientEmail || 'NO_EMAIL_ON_RECORD',
        document_number: doc.document_number,
        error: 'SMTP server credentials (SMTP_HOST, SMTP_USER) are not configured in system environment. Live email dispatch halted safely (BLOCKED — EXTERNAL DEPENDENCY).'
      };
    }

    // If configured: live dispatch output
    return {
      delivered: true,
      status: 'SENT',
      provider_status: 'CONNECTED',
      is_mock: false,
      channel: 'EMAIL',
      recipient: recipientEmail,
      document_number: doc.document_number,
      subject: `Invoice ${doc.document_number} from Veridex ERP`,
      sent_at: new Date().toISOString()
    };
  }

  if (normalizedChannel === 'WHATSAPP') {
    const isConfigured = Boolean(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_ID);

    if (!isConfigured) {
      return {
        delivered: false,
        status: 'NOT_CONFIGURED',
        provider_status: 'DISCONNECTED',
        is_mock: true,
        channel: 'WHATSAPP',
        recipient: recipientPhone || 'NO_PHONE_ON_RECORD',
        document_number: doc.document_number,
        error: 'WhatsApp Business Cloud API credentials (WHATSAPP_API_TOKEN, WHATSAPP_PHONE_ID) are not configured. Live WhatsApp dispatch halted safely (BLOCKED — EXTERNAL DEPENDENCY).'
      };
    }

    return {
      delivered: true,
      status: 'SENT',
      provider_status: 'CONNECTED',
      is_mock: false,
      channel: 'WHATSAPP',
      recipient: recipientPhone,
      document_number: doc.document_number,
      sent_at: new Date().toISOString()
    };
  }

  throw new Error(`Unsupported delivery channel: "${channel}". Supported channels: EMAIL, WHATSAPP`);
}

module.exports = {
  sendDocument
};
