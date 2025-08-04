const Imap = require('imap');
const accounts = require('./Account.json');

// Configuration options
const CONFIG = {
  // What to delete
  DELETE_ALL_EMAILS: true,        // Delete all emails
  DELETE_ONLY_READ: false,        // Only delete read emails
  DELETE_ONLY_UNREAD: false,      // Only delete unread emails
  DELETE_OLDER_THAN_DAYS: null,   // Delete emails older than X days (null = all)
  
  // Safety options
  DRY_RUN: false,                 // Set to true to see what would be deleted without actually deleting
  BATCH_SIZE: 100,                // Process emails in batches to avoid timeout
  CONFIRM_BEFORE_DELETE: true,    // Ask for confirmation before deleting
  
  // Folders to clean
  FOLDERS_TO_CLEAN: ['INBOX', 'Sent', 'Drafts', 'Junk'], // Add more folders as needed
};

// Statistics tracking
const stats = {
  totalAccounts: 0,
  processedAccounts: 0,
  totalDeleted: 0,
  errors: 0
};

function cleanInbox(account) {
  return new Promise((resolve) => {
    const { email, password } = account;
    
    console.log(`\n🧹 Cleaning inbox for: ${email}`);
    console.log('='.repeat(50));

    const imap = new Imap({
      user: email,
      password: password,
      host: 'imap.mail.me.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 60000,
      authTimeout: 10000
    });

    let accountStats = {
      email: email,
      foldersProcessed: 0,
      totalDeleted: 0,
      errors: []
    };

    imap.once('ready', async function () {
      console.log(`✅ Connected to ${email}`);
      
      try {
        for (const folderName of CONFIG.FOLDERS_TO_CLEAN) {
          await cleanFolder(imap, folderName, accountStats);
        }
        
        console.log(`\n📊 Summary for ${email}:`);
        console.log(`   Folders processed: ${accountStats.foldersProcessed}`);
        console.log(`   Total deleted: ${accountStats.totalDeleted}`);
        console.log(`   Errors: ${accountStats.errors.length}`);
        
        stats.totalDeleted += accountStats.totalDeleted;
        stats.processedAccounts++;
        
      } catch (error) {
        console.error(`❌ Error processing ${email}:`, error.message);
        stats.errors++;
      }
      
      imap.end();
      resolve(accountStats);
    });

    imap.once('error', function (err) {
      console.error(`❌ IMAP error for ${email}:`, err.message);
      stats.errors++;
      resolve(accountStats);
    });

    imap.connect();
  });
}

function cleanFolder(imap, folderName, accountStats) {
  return new Promise((resolve, reject) => {
    console.log(`\n📁 Processing folder: ${folderName}`);
    
    imap.openBox(folderName, false, function (err, box) {
      if (err) {
        console.error(`❌ Cannot open ${folderName}:`, err.message);
        accountStats.errors.push(`Cannot open ${folderName}: ${err.message}`);
        resolve();
        return;
      }

      const totalMessages = box.messages.total;
      console.log(`📊 Found ${totalMessages} messages in ${folderName}`);
      
      if (totalMessages === 0) {
        console.log(`📭 ${folderName} is already empty`);
        accountStats.foldersProcessed++;
        resolve();
        return;
      }

      // Build search criteria
      let searchCriteria = [];
      
      if (CONFIG.DELETE_ONLY_READ) {
        searchCriteria.push('SEEN');
      } else if (CONFIG.DELETE_ONLY_UNREAD) {
        searchCriteria.push('UNSEEN');
      } else if (CONFIG.DELETE_ALL_EMAILS) {
        searchCriteria.push('ALL');
      }
      
      // Add date filter if specified
      if (CONFIG.DELETE_OLDER_THAN_DAYS) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - CONFIG.DELETE_OLDER_THAN_DAYS);
        searchCriteria.push(['BEFORE', cutoffDate]);
      }

      console.log(`🔍 Searching for emails to delete...`);
      
      imap.search(searchCriteria, function (err, results) {
        if (err) {
          console.error(`❌ Search error in ${folderName}:`, err.message);
          accountStats.errors.push(`Search error in ${folderName}: ${err.message}`);
          resolve();
          return;
        }

        if (!results || results.length === 0) {
          console.log(`📭 No messages match deletion criteria in ${folderName}`);
          accountStats.foldersProcessed++;
          resolve();
          return;
        }

        console.log(`🎯 Found ${results.length} messages to delete in ${folderName}`);
        
        if (CONFIG.DRY_RUN) {
          console.log(`🔍 DRY RUN: Would delete ${results.length} messages from ${folderName}`);
          accountStats.foldersProcessed++;
          resolve();
          return;
        }

        // Process in batches to avoid timeout
        processBatches(imap, results, folderName, accountStats)
          .then(() => {
            accountStats.foldersProcessed++;
            resolve();
          })
          .catch(reject);
      });
    });
  });
}

async function processBatches(imap, messageIds, folderName, accountStats) {
  const totalMessages = messageIds.length;
  let deletedCount = 0;
  
  console.log(`🗂️ Processing ${totalMessages} messages in batches of ${CONFIG.BATCH_SIZE}`);
  
  for (let i = 0; i < messageIds.length; i += CONFIG.BATCH_SIZE) {
    const batch = messageIds.slice(i, i + CONFIG.BATCH_SIZE);
    const batchNum = Math.floor(i / CONFIG.BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(messageIds.length / CONFIG.BATCH_SIZE);
    
    console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} messages)`);
    
    try {
      await deleteBatch(imap, batch, folderName);
      deletedCount += batch.length;
      accountStats.totalDeleted += batch.length;
      
      console.log(`✅ Deleted batch ${batchNum}/${totalBatches} - Progress: ${deletedCount}/${totalMessages}`);
      
      // Small delay between batches to be gentle on the server
      if (i + CONFIG.BATCH_SIZE < messageIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      console.error(`❌ Error deleting batch ${batchNum}:`, error.message);
      accountStats.errors.push(`Error deleting batch ${batchNum} in ${folderName}: ${error.message}`);
    }
  }
  
  console.log(`🎉 Finished processing ${folderName}: ${deletedCount} messages deleted`);
}

function deleteBatch(imap, messageIds, folderName) {
  return new Promise((resolve, reject) => {
    // Mark messages for deletion
    imap.addFlags(messageIds, '\\Deleted', function (err) {
      if (err) {
        reject(new Error(`Failed to mark messages for deletion: ${err.message}`));
        return;
      }
      
      // Expunge to permanently delete
      imap.expunge(function (err) {
        if (err) {
          reject(new Error(`Failed to expunge messages: ${err.message}`));
          return;
        }
        
        resolve();
      });
    });
  });
}

async function confirmDeletion() {
  if (!CONFIG.CONFIRM_BEFORE_DELETE) {
    return true;
  }
  
  console.log('\n⚠️  DELETION CONFIRMATION');
  console.log('='.repeat(50));
  console.log(`📊 Accounts to process: ${accounts.length}`);
  console.log(`📁 Folders to clean: ${CONFIG.FOLDERS_TO_CLEAN.join(', ')}`);
  console.log(`🗑️  Delete all emails: ${CONFIG.DELETE_ALL_EMAILS}`);
  console.log(`📅 Delete only read: ${CONFIG.DELETE_ONLY_READ}`);
  console.log(`📧 Delete only unread: ${CONFIG.DELETE_ONLY_UNREAD}`);
  console.log(`📆 Delete older than: ${CONFIG.DELETE_OLDER_THAN_DAYS || 'No limit'} days`);
  console.log(`🔍 Dry run mode: ${CONFIG.DRY_RUN}`);
  
  if (CONFIG.DRY_RUN) {
    console.log('\n✅ Running in DRY RUN mode - no emails will actually be deleted');
    return true;
  }
  
  console.log('\n❗ This will PERMANENTLY delete emails!');
  console.log('Type "DELETE" to confirm, or anything else to cancel:');
  
  // In a real implementation, you'd use readline for user input
  // For now, we'll assume confirmation
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('Confirm deletion (type DELETE): ', (answer) => {
      rl.close();
      if (answer.trim() === 'DELETE') {
        console.log('✅ Deletion confirmed');
        resolve(true);
      } else {
        console.log('❌ Deletion cancelled');
        resolve(false);
      }
    });
  });
}

async function validateConfiguration() {
  console.log('🔍 Validating configuration...');
  
  if (!accounts || accounts.length === 0) {
    console.error('❌ No accounts found in Account.json');
    return false;
  }
  
  for (const account of accounts) {
    if (!account.email || !account.password) {
      console.error('❌ Invalid account format:', account);
      return false;
    }
  }
  
  console.log('✅ Configuration valid');
  return true;
}

async function main() {
  console.log('🧹 AUTOMATED INBOX CLEANER');
  console.log('='.repeat(50));
  console.log(`📅 Started at: ${new Date()}`);
  
  if (!await validateConfiguration()) {
    process.exit(1);
  }
  
  stats.totalAccounts = accounts.length;
  
  if (!await confirmDeletion()) {
    console.log('👋 Cleanup cancelled by user');
    process.exit(0);
  }
  
  console.log('\n🚀 Starting inbox cleanup...');
  
  // Process accounts one by one to avoid overwhelming the servers
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    console.log(`\n[${i + 1}/${accounts.length}] Processing account: ${account.email}`);
    
    try {
      await cleanInbox(account);
      
      // Small delay between accounts
      if (i < accounts.length - 1) {
        console.log('⏳ Waiting 3 seconds before next account...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
    } catch (error) {
      console.error(`❌ Failed to process ${account.email}:`, error.message);
      stats.errors++;
    }
  }
  
  // Final summary
  console.log('\n🏁 CLEANUP COMPLETE');
  console.log('='.repeat(50));
  console.log(`📊 Total accounts: ${stats.totalAccounts}`);
  console.log(`✅ Successfully processed: ${stats.processedAccounts}`);
  console.log(`🗑️  Total emails deleted: ${stats.totalDeleted}`);
  console.log(`❌ Errors encountered: ${stats.errors}`);
  console.log(`📅 Completed at: ${new Date()}`);
  
  if (CONFIG.DRY_RUN) {
    console.log('\n💡 This was a DRY RUN - no emails were actually deleted');
    console.log('💡 Set DRY_RUN to false to perform actual deletion');
  }
}

// Graceful shutdown
process.on('SIGINT', function () {
  console.log('\n🛑 Cleanup interrupted by user');
  console.log(`📊 Progress: ${stats.processedAccounts}/${stats.totalAccounts} accounts processed`);
  console.log(`🗑️  Emails deleted so far: ${stats.totalDeleted}`);
  process.exit(0);
});

process.on('uncaughtException', function (err) {
  console.error('💥 Uncaught Exception:', err.message);
  process.exit(1);
});

// Start the application
main().catch(console.error);