const Imap = require('imap');
const fs = require('fs');
const path = require('path');
const accounts = require('../data/AppleID.json'); // Importing Apple ID accounts

// Array to store failed accounts
const failedAccounts = [];

async function clearAllInbox(account) {
  return new Promise((resolve) => {
    const { email, privateKey } = account;
    console.log(`🧹 Clearing all emails for: ${email}`);

    const imap = new Imap({
      user: email,
      password: password,
      host: 'imap.mail.me.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });

    imap.once('ready', function () {
      console.log(`✅ Connected to ${email}`);

      imap.openBox('INBOX', false, function (err, box) {
        if (err) {
          console.error(`❌ Cannot open INBOX for ${email}:`, err.message);
          resolve();
          return;
        }

        const totalMessages = box.messages.total;
        console.log(`📊 Found ${totalMessages} messages`);

        if (totalMessages === 0) {
          console.log(`📭 INBOX already empty`);
          imap.end();
          resolve();
          return;
        }

        imap.search(['ALL'], function (err, results) {
          if (err || !results || results.length === 0) {
            console.log(`❌ No messages found or search error`);
            imap.end();
            resolve();
            return;
          }

          console.log(`🗑️ Deleting ${results.length} messages...`);

          imap.addFlags(results, '\\Deleted', function (err) {
            if (err) {
              console.error(`❌ Error marking for deletion:`, err.message);
              imap.end();
              resolve();
              return;
            }

            imap.expunge(function (err) {
              if (err) {
                console.error(`❌ Error expunging:`, err.message);
              } else {
                console.log(`✅ Successfully deleted ${results.length} messages from ${email}`);
              }

              imap.end();
              resolve();
            });
          });
        });
      });
    });

    imap.once('error', function (err) {
      console.error(`❌ IMAP error for ${email}: ${err.message}`);
      
      // Add failed account to array
      failedAccounts.push({
        email: email,
        error: err.message,
        timestamp: new Date().toISOString()
      });
      
      resolve();
    });

    imap.connect();
  });
}

async function saveFailedAccountsToFile() {
  if (failedAccounts.length === 0) {
    console.log('✅ No failed accounts to save');
    return;
  }

  const fileName = `failed_accounts_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  const filePath = path.join(__dirname, fileName);
  
  let content = `Failed iCloud Accounts Log\n`;
  content += `Generated: ${new Date().toLocaleString()}\n`;
  content += `Total Failed: ${failedAccounts.length}\n`;
  content += '='.repeat(50) + '\n\n';
  
  failedAccounts.forEach((account, index) => {
    content += `${index + 1}. Email: ${account.email}\n`;
    content += `   Error: ${account.error}\n`;
    content += `   Time: ${new Date(account.timestamp).toLocaleString()}\n\n`;
  });
  
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`💾 Failed accounts saved to: ${fileName}`);
    console.log(`📍 File location: ${filePath}`);
  } catch (writeErr) {
    console.error(`❌ Error saving failed accounts file:`, writeErr.message);
  }
}

async function RunClearInboxAppleID() {
  console.log('🧹 CLEARING ALL INBOXES');
  console.log('='.repeat(50));

  // Clear the failed accounts array at the start
  failedAccounts.length = 0;

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    console.log(`\n[${i + 1}/${accounts.length}] Processing: ${account.email}`);
    
    await clearAllInbox(account);
    
    if (i < accounts.length - 1) {
      console.log('⏳ Waiting 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n🏁 ALL INBOXES PROCESSING COMPLETED');
  
  // Save failed accounts to file
  await saveFailedAccountsToFile();
  
  if (failedAccounts.length > 0) {
    console.log(`\n⚠️  ${failedAccounts.length} account(s) failed - check the generated txt file for details`);
  }
}

module.exports = { RunClearInboxAppleID }