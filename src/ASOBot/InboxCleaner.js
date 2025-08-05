const Imap = require('imap');
const accounts = require('../data/Account.json')

async function clearAllInbox(account) {
  return new Promise((resolve) => {
    const { email, password } = account;
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
      console.error(`❌ IMAP error for ${email}:`, err.message);
      resolve();
    });

    imap.connect();
  });
}

async function RunClearInboxAppleID() {
  console.log('🧹 CLEARING ALL INBOXES');
  console.log('='.repeat(50));

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    console.log(`\n[${i + 1}/${accounts.length}] Processing: ${account.email}`);
    
    await clearAllInbox(account);
    
    if (i < accounts.length - 1) {
      console.log('⏳ Waiting 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n🏁 ALL INBOXES CLEARED');
}

module.exports = { RunClearInboxAppleID }
