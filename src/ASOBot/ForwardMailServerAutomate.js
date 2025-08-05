const Imap = require('imap');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const accounts = require('../data/Account.json');

const MAIN_EMAIL = 'ebrartelek08@icloud.com';
const processedMessages = new Set();

function startForwarding(account) {
  const { email, password } = account;
  console.log(`[🚀] Setting up forwarding: ${email} → ${MAIN_EMAIL}`);
  const imap = new Imap({
    user: email,
    password: password,
    host: 'imap.mail.me.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    connTimeout: 60000,
    authTimeout: 10000,
    keepalive: {
      interval: 10000,
      idleInterval: 300000,
      forceNoop: true
    }
  });

  const transporter = nodemailer.createTransport({
    host: 'smtp.mail.me.com',
    port: 587,
    secure: false,
    auth: {
      user: email,
      pass: password,
    },
    tls: {
      rejectUnauthorized: false
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100
  });
  transporter.verify(function (error, success) {
    if (error) {
      console.error(`[❌] SMTP failed for ${email}:`, error.message);
      return;
    }
    console.log(`[✅] SMTP ready for ${email}`);
    imap.connect();
  });

  function openInbox(cb) {
    imap.openBox('INBOX', false, cb);
  }

  imap.once('ready', function () {
    console.log(`[📡] IMAP connected: ${email}`);
    
    openInbox(function (err, box) {
      if (err) {
        console.error(`[❌] Inbox error for ${email}:`, err.message);
        return;
      }
      console.log(`[📬] Monitoring ${email} (${box.messages.total} total messages)`);
      processExistingUnreadMessages();
      imap.on('mail', function (numNewMsgs) {
        console.log(`[📨] ${numNewMsgs} new email(s) in ${email}`);
        processNewMessages(numNewMsgs);
      });

      imap.on('error', function (err) {
        console.error(`[❌] IMAP error for ${email}:`, err.message);
        reconnectAfterDelay(account, 30000);
      });
    });

    function processExistingUnreadMessages() {
      imap.search(['UNSEEN'], function (err, results) {
        if (err) {
          console.error(`[❌] Search error:`, err.message);
          return;
        }
        
        if (results && results.length > 0) {
          console.log(`[📧] Found ${results.length} unread email(s) in ${email}`);
          fetchAndForwardMessages(results, 'unread');
        } else {
          console.log(`[📭] No unread emails in ${email}`);
        }
      });
    }

    function processNewMessages(numNewMsgs) {
      imap.status('INBOX', (err, mailbox) => {
        if (err) {
          console.error(`[❌] Status error:`, err.message);
          return;
        }
        
        const totalMessages = mailbox.messages.total;
        const startSeq = Math.max(1, totalMessages - numNewMsgs + 1);
        const endSeq = totalMessages;
        
        console.log(`[🔄] Processing messages ${startSeq}-${endSeq} from ${email}`);
        
        const range = `${startSeq}:${endSeq}`;
        fetchAndForwardMessages(range, 'new');
      });
    }

    function fetchAndForwardMessages(range, type) {
      const fetch = imap.fetch(range, {
        bodies: '',
        struct: true,
        markSeen: false
      });

      fetch.on('message', function (msg, seqno) {
        let messageId = null;
        let emailBuffer = '';
        
        msg.on('body', function (stream, info) {
          stream.on('data', function (chunk) {
            emailBuffer += chunk.toString('utf8');
          });
          
          stream.once('end', function () {
            simpleParser(emailBuffer, async (err, parsed) => {
              if (err) {
                console.error(`[❌] Parse error:`, err.message);
                return;
              }

              const msgIdentifier = `${email}-${parsed.messageId || seqno}-${parsed.date}`;
              
              if (processedMessages.has(msgIdentifier)) {
                console.log(`[⏭️] Skipping duplicate message from ${email}`);
                return;
              }
              
              processedMessages.add(msgIdentifier);
              
              await forwardEmail(parsed, email, seqno, type);
            });
          });
        });

        msg.once('attributes', function (attrs) {
          messageId = attrs.uid;
        });
      });

      fetch.once('error', function (err) {
        console.error(`[❌] Fetch error:`, err.message);
      });

      fetch.once('end', function () {
        console.log(`[✅] Finished processing ${type} messages from ${email}`);
      });
    }

    async function forwardEmail(parsed, fromEmail, seqno, type) {
      try {
        const originalFrom = parsed.from ? (parsed.from.text || parsed.from.address || 'Unknown') : 'Unknown Sender';
        const originalSubject = parsed.subject || '(No Subject)';
        const originalDate = parsed.date || new Date();
        const forwardedSubject = `Fwd: ${originalSubject}`;
        const forwardHeader = `\n\n---------- Forwarded message ----------\n` +
                             `From: ${originalFrom}\n` +
                             `Date: ${originalDate}\n` +
                             `Subject: ${originalSubject}\n` +
                             `To: ${fromEmail}\n\n`;
        
        const forwardedText = forwardHeader + (parsed.text || 'No text content');
        
        let forwardedHtml = '';
        if (parsed.html) {
          forwardedHtml = `
            <br><br>
            <div style="border-left: 4px solid #ccc; padding-left: 16px; margin: 16px 0; color: #666;">
              <p style="margin: 0; font-weight: bold;">---------- Forwarded message ----------</p>
              <p style="margin: 4px 0;"><strong>From:</strong> ${originalFrom}</p>
              <p style="margin: 4px 0;"><strong>Date:</strong> ${originalDate}</p>
              <p style="margin: 4px 0;"><strong>Subject:</strong> ${originalSubject}</p>
              <p style="margin: 4px 0;"><strong>To:</strong> ${fromEmail}</p>
            </div>
            <div style="margin-top: 16px;">
              ${parsed.html}
            </div>
          `;
        }

        console.log(`[📤] Forwarding "${originalSubject}" from ${fromEmail}...`);

        const info = await transporter.sendMail({
          from: fromEmail, // Send from the original account
          to: MAIN_EMAIL,
          subject: forwardedSubject,
          text: forwardedText,
          html: forwardedHtml || forwardedText.replace(/\n/g, '<br>'),
          attachments: parsed.attachments || [],
          headers: {
            'X-Forwarded-From': fromEmail,
            'X-Original-From': originalFrom,
            'X-Forwarded-Type': type
          }
        });

        console.log(`[✅] SUCCESS: Email forwarded to ${MAIN_EMAIL}`);
        console.log(`[📋] Subject: "${forwardedSubject}"`);
        console.log(`[🆔] Message ID: ${info.messageId}`);
        console.log(`[📊] From: ${originalFrom} → ${fromEmail} → ${MAIN_EMAIL}`);
        
      } catch (error) {
        console.error(`[❌] Forward failed for ${fromEmail}:`, error.message);
        if (error.code === 'EAUTH') {
          console.error(`[🔐] Authentication failed for ${fromEmail} - check credentials`);
        } else if (error.code === 'ECONNECTION') {
          console.error(`[🌐] Connection failed for ${fromEmail} - check network`);
        }
      }
    }
  });

  imap.once('error', function (err) {
    console.error(`[❌] IMAP connection error for ${email}:`, err.message);
    reconnectAfterDelay(account, 30000);
  });

  imap.once('end', function () {
    console.log(`[🔌] IMAP connection ended for ${email}`);
    reconnectAfterDelay(account, 10000);
  });

  function reconnectAfterDelay(account, delay) {
    console.log(`[⏳] Reconnecting ${account.email} in ${delay/1000}s...`);
    setTimeout(() => {
      console.log(`[🔄] Reconnecting ${account.email}...`);
      startForwarding(account);
    }, delay);
  }
}

async function verifyConfiguration() {
  console.log('[🔍] Verifying email forwarding configuration...');
  if (!accounts || accounts.length === 0) {
    console.error('[❌] No accounts found in Account.json');
    console.log('📝 Create Account.json with format:');
    console.log('[{"email": "account@icloud.com", "password": "app-password"}]');
    process.exit(1);
  }

  console.log(`[📋] Accounts to monitor: ${accounts.length}`);
  console.log(`[📬] Main destination: ${MAIN_EMAIL}`);
  
  // Validate account format
  for (const account of accounts) {
    if (!account.email || !account.password) {
      console.error(`[❌] Invalid account format:`, account);
      process.exit(1);
    }
  }
  console.log('[✅] Configuration valid');
  return true;
}

process.on('SIGINT', function () {
  console.log('\n[🛑] Shutting down email forwarder...');
  console.log('[💾] Processed messages:', processedMessages.size);
  process.exit(0);
});

process.on('uncaughtException', function (err) {
  console.error('[💥] Uncaught Exception:', err.message);
  console.error('[📍] Stack:', err.stack);
});

process.on('unhandledRejection', function (reason, promise) {
  console.error('[💥] Unhandled Rejection:', reason);
});

async function RunForwardMailToMainMailServer() {
  try {
    console.log('='.repeat(60));
    console.log('🚀 EMAIL FORWARDING SERVICE STARTING');
    console.log('='.repeat(60));
    
    await verifyConfiguration();
    
    console.log(`[⚡] Starting forwarders for ${accounts.length} account(s)...`);
    accounts.forEach((account, index) => {
      setTimeout(() => {
        startForwarding(account);
      }, index * 3000);
    });
    
    console.log('[✅] All email forwarders initiated');
    console.log(`[👀] Monitoring for new emails...`);
    console.log(`[📨] All emails will be forwarded to: ${MAIN_EMAIL}`);
    
  } catch (error) {
    console.error('[💥] Failed to start email forwarding:', error.message);
    process.exit(1);
  }
}

module.exports = {
  RunForwardMailToMainMailServer
}