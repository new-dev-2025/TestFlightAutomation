// Enhanced timing version for better SMS handling
const { runSingleAccountTest, testSMSOnly, LixSMSReceiver, TEST_ACCOUNT } = require('./single_account_test');

// Extended timing test with manual verification option
async function runExtendedTimingTest() {
  console.log('⏰ EXTENDED TIMING TEST - Apple API with Patient SMS Handling');
  console.log('='.repeat(70));
  console.log(`📧 Account: ${TEST_ACCOUNT.email}`);
  console.log(`📱 Phone: ${TEST_ACCOUNT.phone}`);
  console.log(`📋 SMS Code: ${TEST_ACCOUNT.smsCode}`);
  console.log(`🌐 SMS URL: https://lixsms.com/?code=${TEST_ACCOUNT.smsCode}`);
  
  console.log(`\n💡 TIMING STRATEGY:`);
  console.log(`   • Initial wait: 15 seconds`);
  console.log(`   • Retry interval: 10 seconds`);
  console.log(`   • Max retries: 5 attempts`);
  console.log(`   • Final wait: Additional 20 seconds`);
  console.log(`   • Total max time: ~95 seconds`);
  
  // Pre-check SMS service
  console.log(`\n🔍 PRE-CHECK: Testing SMS service connection...`);
  const smsReceiver = new LixSMSReceiver();
  
  try {
    const testResponse = await smsReceiver.getSMSCode(TEST_ACCOUNT.smsCode);
    if (testResponse) {
      console.log(`⚠️  Found existing code: ${testResponse} (may be old)`);
    } else {
      console.log(`✅ SMS service accessible, no existing codes found`);
    }
  } catch (error) {
    console.log(`❌ SMS service pre-check failed: ${error.message}`);
    return;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('🚀 Starting authentication with patient timing...');
  console.log('='.repeat(70));

  // Run the main test
  await runSingleAccountTest();
}

// Interactive test with manual verification
async function runInteractiveTest() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('🎯 INTERACTIVE TEST - Manual SMS Verification');
  console.log('='.repeat(50));
  
  console.log(`📱 SMS URL: https://lixsms.com/?code=${TEST_ACCOUNT.smsCode}`);
  console.log(`\n💡 Steps:`);
  console.log(`1. Script will attempt Apple login`);
  console.log(`2. Apple will send SMS to phone ${TEST_ACCOUNT.phone}`);
  console.log(`3. You can manually check the SMS URL above`);
  console.log(`4. Script will also auto-check for the code`);
  
  rl.question('\nPress Enter to start the interactive test...', async () => {
    rl.close();
    
    try {
      await runSingleAccountTest();
    } catch (error) {
      console.error('❌ Interactive test error:', error);
    }
  });
}

// Test with progressive delays
async function runProgressiveDelayTest() {
  console.log('📈 PROGRESSIVE DELAY TEST');
  console.log('='.repeat(40));
  
  const delays = [5, 10, 15, 20, 30]; // seconds
  const smsReceiver = new LixSMSReceiver();
  
  for (let i = 0; i < delays.length; i++) {
    const delay = delays[i];
    console.log(`\n⏰ Test ${i + 1}/${delays.length}: Waiting ${delay} seconds...`);
    
    await new Promise(resolve => setTimeout(resolve, delay * 1000));
    
    const code = await smsReceiver.getSMSCode(TEST_ACCOUNT.smsCode);
    if (code) {
      console.log(`✅ Found code after ${delay} seconds: ${code}`);
      return code;
    } else {
      console.log(`❌ No code found after ${delay} seconds`);
    }
  }
  
  console.log(`\n📊 Progressive delay test completed - no codes found`);
}

// Monitor SMS URL continuously
async function monitorSMSContinuously(durationMinutes = 5) {
  console.log(`📡 CONTINUOUS SMS MONITORING`);
  console.log(`Duration: ${durationMinutes} minutes`);
  console.log(`URL: https://lixsms.com/?code=${TEST_ACCOUNT.smsCode}`);
  console.log('='.repeat(50));
  
  const smsReceiver = new LixSMSReceiver();
  const startTime = Date.now();
  const endTime = startTime + (durationMinutes * 60 * 1000);
  let checkCount = 0;
  
  while (Date.now() < endTime) {
    checkCount++;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    
    console.log(`\n📱 Check ${checkCount} (${elapsed}s elapsed)`);
    
    const code = await smsReceiver.getSMSCode(TEST_ACCOUNT.smsCode);
    if (code) {
      console.log(`✅ FOUND CODE: ${code} after ${elapsed} seconds!`);
      return code;
    }
    
    console.log(`⏳ No code yet... waiting 15 seconds`);
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  
  console.log(`\n⏰ Monitoring completed after ${durationMinutes} minutes`);
  return null;
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--interactive')) {
    runInteractiveTest();
  } else if (args.includes('--progressive')) {
    runProgressiveDelayTest().catch(console.error);
  } else if (args.includes('--monitor')) {
    const minutes = parseInt(args[args.indexOf('--monitor') + 1]) || 5;
    monitorSMSContinuously(minutes).catch(console.error);
  } else {
    runExtendedTimingTest().catch(console.error);
  }
}

module.exports = {
  runExtendedTimingTest,
  runInteractiveTest,
  runProgressiveDelayTest,
  monitorSMSContinuously
};