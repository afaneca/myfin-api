import nodemailer from "nodemailer";
import Logger from "../utils/Logger.js";

const sendEmail = async (to: string, subject: string, text?: string, html?: string): Promise<boolean> => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, // e.g., 'smtp.gmail.com'
    port: Number(process.env.SMTP_PORT), // Use 465 for SSL, 587 for TLS
    secure: process.env.SMTP_SECURE === 'true', // Use 'true' for port 465
    auth: {
      user: process.env.SMTP_USER, // Your email address
      pass: process.env.SMTP_PASSWORD, // Your email password
    },
  })

  // send mail with defined transport object
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM, // sender address
    to: to, // list of receivers
    subject: subject, // Subject line
    text: text, // plain text body
    html: html, // html body
  });
  Logger.addLog(`Email sent: ${info.messageId}`);
  return true
}

export default {
  sendEmail
};