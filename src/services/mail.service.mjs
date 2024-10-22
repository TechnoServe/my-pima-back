import logger from "../config/logger.mjs";
import sgMail from "../utils/sendgrid.mjs";

const templates = {
  TS_SAMPLE_REMINDER_TEMPLATE: "d-87e3f081ba9348f8a065c9c01cb54c09",
  FV_SAMPLE_REMINDER_TEMPLATE: "d-c7c0dc473fa247e7819754f35f2999fc",
};

const sendEmail = async (to, templateId, dynamicTemplateData) => {
  try {
    const msg = {
      to,
      from: "Pima Team <team@pima.ink>",
      replyTo: 'ymugenga@tns.org',
      templateId,
      dynamic_template_data: dynamicTemplateData,
    };

    await sgMail.send(msg);
    logger.info(`Email sent to ${to}`);
  } catch (error) {
    logger.error(`Error sending email: ${error.message}`);
  }
};

export const MailService = {
  async sendTSReviewReminder(to, userData) {
    return sendEmail(to, templates.TS_SAMPLE_REMINDER_TEMPLATE, userData);
  },

  async sendFVReviewReminder(to, resetData) {
    return sendEmail(to, templates.FV_SAMPLE_REMINDER_TEMPLATE, resetData);
  },
};
