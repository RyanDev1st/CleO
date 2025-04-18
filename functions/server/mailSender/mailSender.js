const nodemailer = require("nodemailer");

let transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "ryandev1st@gmail.com",
    pass: "your-app-password", // Generate from Google Security settings
  },
});

async function sendEmail(toEmail) {
  let mailOptions = {
    from: "ryandev1st@gmail.com",
    to: toEmail,
    subject: "Test Email",
    text: "Hello! This is a test email from my local server.",
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Email sent to:", toEmail);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

sendEmail("user@icloud.com"); // Works for Gmail, iCloud, Outlook, etc.
