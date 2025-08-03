const puppeteer = require('puppeteer');
const https = require('https');
const AppleIDList = require('./AppleID.json')


const TESTFLIGHT_ACTIVATION_URLs = [
'https://appstoreconnect.apple.com/activation_ds?key=7e32ae5bb8b755b74ce737533cb2878a',
'https://appstoreconnect.apple.com/activation_ds?key=1b92dab6ed611a5ee6a075f4f70129e8',
'https://appstoreconnect.apple.com/activation_ds?key=a7d5773785fd1c0e2f53add3e09fea48',
'https://appstoreconnect.apple.com/activation_ds?key=3787dee248f2124d303fdf825f6dc1e4',
'https://appstoreconnect.apple.com/activation_ds?key=9d65c71634719bf443c4daf3004ebceb'
]



function makeHttpRequest(url) {
  return new Promise((resolve, reject) => {
    console.log(`🌐 Making request to: ${url}`);
    const req = https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log(`✅ Request completed with status: ${res.statusCode}`);
        resolve({
          statusCode: res.statusCode,
          body: body
        });
      });
    });
    req.on('error', (err) => {
      console.error(`❌ Request error: ${err.message}`);
      reject(err);
    });
    req.setTimeout(15000, () => {
      console.log('⏰ Request timeout');
      req.destroy();
    });
  });
}

async function getVerificationCode(smsCode) {
  try {
    const response = await makeHttpRequest(`https://lixsms.com/message/?code=${smsCode}`);
    if (response.statusCode !== 200) return null;
    const jsonData = JSON.parse(response.body);
    if (jsonData.message && jsonData.message[0] && jsonData.message[0].body) {
      const body = jsonData.message[0].body;
      const match = body.match(/(\d{6})/);  // Extract 6-digit code
      return match ? match[0] : null;
    }
    return null;
  } catch (error) {
    console.error(`SMS error: ${error.message}`);
    return null;
  }
}

class FullyAutomatedTestFlight {
  constructor() {

    this.browser = null;
    this.page = null;
    this.accountInfo = null;
  }
  async runFullAutomation(activationUrl) {
    try {
      await this.launchBrowser();
      await this.navigateToActivation(activationUrl);
      await this.waitForCompleteLoad();
      await this.performAutomaticLogin();
      await this.handleAutomatic2FA();
      await this.acceptTestFlightAutomatically();
      const success = await this.verifyCompletion();
      return { success, method: 'FULL_AUTOMATION' };
    } catch (error) {
      console.error(`Automation error: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      await this.wait(10000);
      await this.cleanup();
    }
  }

  async launchBrowser() {
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--start-maximized'
      ]
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  }
  async navigateToActivation(url) {
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await this.wait(5000);
  }

  async waitForCompleteLoad() {
    await this.page.waitForFunction(() =>
      document.readyState === 'complete' &&
      document.querySelector('input, button') !== null
    );
    await this.wait(3000);
  }

  async performAutomaticLogin(account) {
    const currentUrl = this.page.url();
    const urlObj = new URL(currentUrl);
    const email = urlObj.searchParams.get('username');
    this.accountInfo = AppleIDList.find((x) => x.email == email)
    const passwordFieldExists = await this.page.$$('input, input[type="password"]');
    if (passwordFieldExists) {
      await passwordFieldExists[0].type(this.accountInfo.password);
      await this.wait(2000);
      await this.submitLoginForm();
      return
    }

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        // Fill email/phone field if exists
        const emailField = await this.page.$('input[type="email"], input[type="text"][autocomplete="username"]');
        if (emailField) {
          await this.fillField(emailField, account.email);
        }

        // Fill password field
        await this.fillPasswordField(account.password);

        // Submit the form


        // Check for errors
        const hasError = await this.page.evaluate(() => {
          return document.body.textContent.includes('Check the account information');
        });

        if (hasError) {
          attempts++;
          console.log(`⚠️ Login failed (attempt ${attempts}/${maxAttempts})`);
          await this.wait(2000);
          continue;
        }

        console.log('✅ Login successful');
        await this.wait(8000);
        return;

      } catch (error) {
        attempts++;
        console.log(`⚠️ Login error (attempt ${attempts}/${maxAttempts}): ${error.message}`);
        await this.wait(2000);
      }
    }

    throw new Error('Login failed after maximum attempts');
  }

  async fillField(fieldHandle, value) {
    await fieldHandle.click({ clickCount: 3 });
    await fieldHandle.type(value, { delay: 50 });
  }

  async fillPasswordField(password) {
    console.log('🔑 Filling password field...');

    const passwordField = await this.page.waitForSelector('div.password input#password_text_field', {
      visible: true,
      timeout: 15000
    });

    await this.fillField(passwordField, password);

    // Verify input
    const enteredValue = await passwordField.evaluate(el => el.value);
    if (enteredValue !== password) {
      throw new Error('Password verification failed');
    }
  }

  async submitLoginForm() {
    const buttons = await this.page.$$('button, input[type="submit"]');
    const targetTexts = ['Continue', 'Sign In', 'Submit', 'Next'];

    for (const button of buttons) {
      try {
        const buttonText = await button.evaluate(el =>
          el.textContent?.trim() || el.value?.trim() || ''
        );

        if (targetTexts.some(text =>
          buttonText.toLowerCase().includes(text.toLowerCase()))
        ) {
          console.log(`✅ Found submit button with text: ${buttonText}`);
          await button.click();
          return;
        }
      } catch (err) {
        continue;
      }
    }
    await this.page.keyboard.press('Enter');
  }

async trustBtnClick() {
    const buttons = await this.page.$$('button, input[type="submit"]');
    const targetTexts = ['Trust'];

    for (const button of buttons) {
      try {
        const buttonText = await button.evaluate(el =>
          el.textContent?.trim() || el.value?.trim() || ''
        );

        if (targetTexts.some(text =>
          buttonText.toLowerCase().includes(text.toLowerCase()))
        ) {
          console.log(`✅ Found submit button with text: ${buttonText}`);
          await button.click();
          return;
        }
      } catch (err) {
        continue;
      }
    }
    await this.page.keyboard.press('Enter');
  
}

  async handleAutomatic2FA() {
    await this.wait(10000);
    const verificationCode = await getVerificationCode(this.accountInfo.smsCode)
    const needs2FA = await this.page.$$('input, input[type="tel"]');
    needs2FA[0].type(verificationCode);
    await this.wait(10000)
    await this.trustBtnClick()
    // const tosAgree = await this.page.$$('input, input[type="checkbox"]');
    // await tosAgree[0].click();


  }

  async findButtonByText(text) {
    const buttons = await this.page.$$('button');
    for (const button of buttons) {
      const buttonText = await button.evaluate(el => el.textContent.trim());
      if (buttonText.toLowerCase().includes(text.toLowerCase())) {
        return button;
      }
    }
    return null;
  }

  async getSMSCodeWithRetry(smsCode) {
    for (let attempt = 1; attempt <= 6; attempt++) {
      const code = await getVerificationCode(smsCode);
      if (code) return code;
      await this.wait(10000);
    }
    return null;
  }

  async acceptTestFlightAutomatically() {
    await this.wait(5000);

    const acceptButtons = await this.page.$$('button');
    const targetTexts = ['Accept', 'Join', 'Install'];

    for (const button of acceptButtons) {
      try {
        const buttonText = await button.evaluate(el => el.textContent.trim());
        if (targetTexts.some(text =>
          buttonText.toLowerCase().includes(text.toLowerCase()))
        ) {
          await button.click();
          await this.wait(3000);
          return;
        }
      } catch (err) {
        continue;
      }
    }

    // Fallback to Enter key if no button found
    await this.page.keyboard.press('Enter');
    await this.wait(3000);
  }

  async verifyCompletion() {
    await this.wait(5000);
    const success = await this.page.evaluate(() => {
      const pageText = document.body.textContent.toLowerCase();
      return pageText.includes('success') ||
        pageText.includes('accepted') ||
        pageText.includes('completed');
    });
    return success;
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    // if (this.browser) await this.browser.close();
  }
}

async function runFullyAutomatedTestFlight() {
  console.log('🤖 Starting TestFlight automation...');
  const automation = new FullyAutomatedTestFlight();
  // for(const TESTFLIGHT_ACTIVATION_URL of TESTFLIGHT_ACTIVATION_URLs) {
  const result = await automation.runFullAutomation(TESTFLIGHT_ACTIVATION_URLs[4]);
  // }
  console.log('✅ Automation completed:', result);
  return result;
}


if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--sms-only')) {

  } else {
    runFullyAutomatedTestFlight().catch(console.error);
  }
}

module.exports = {
  runFullyAutomatedTestFlight,
  FullyAutomatedTestFlight,
  getVerificationCode
};