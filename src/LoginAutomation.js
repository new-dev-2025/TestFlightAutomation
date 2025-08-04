const puppeteer = require('puppeteer');
const https = require('https');
const AppleIDList = require('./AppleID.json')

const TESTFLIGHT_ACTIVATION_URLs = [
  'https://appstoreconnect.apple.com/activation_ds?key=709d1ee8949daa6fe8d7439cc3e5fff1',
]

function makeHttpRequest(url) {
  return new Promise((resolve, reject) => {
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
      const match = body.match(/(\d{6})/);
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
      await this.acceptTermsOfService();
      const success = await this.verifyCompletion();
      return { success, method: 'FULL_AUTOMATION' };
    } catch (error) {
      console.error(`Automation error: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      await this.wait(10000);
    }
  }

  // New method for single page processing
  async runSingleActivation(activationUrl) {
    try {
      await this.navigateToActivation(activationUrl);
      await this.waitForCompleteLoad();
      await this.performAutomaticLogin();
      await this.handleAutomatic2FA();
      await this.acceptTermsOfService();
      const success = await this.verifyCompletion();
      return { success, method: 'SINGLE_PAGE_AUTOMATION' };
    } catch (error) {
      console.error(`Single activation error: ${error.message}`);
      return { success: false, error: error.message };
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
    await this.wait(10000);
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
        const emailField = await this.page.$('input[type="email"], input[type="text"][autocomplete="username"]');
        if (emailField) {
          await this.fillField(emailField, account.email);
        }
        await this.fillPasswordField(account.password);
        const hasError = await this.page.evaluate(() => {
          return document.body.textContent.includes('Check the account information');
        });

        if (hasError) {
          attempts++;
          console.log(`⚠️ Login failed (attempt ${attempts}/${maxAttempts})`);
          await this.wait(2000);
          continue;
        }
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
    try {
      await this.page.waitForSelector('#aid-auth-widget-iFrame', { timeout: 15000 });
      console.log('✅ Found iframe');
      const iframe = await this.page.$('#aid-auth-widget-iFrame');
      if (!iframe) {
        console.log('❌ Iframe not found');
        return false;
      }
      const frame = await iframe.contentFrame();
      if (!frame) {
        console.log('❌ Could not access iframe content');
        return false;
      }
      const trustButtons = await frame.$$('button[type="submit"]');
      for (let i = 0; i < trustButtons.length; i++) {
        try {
          const text = await trustButtons[i].evaluate(el => el.textContent?.trim());
          console.log(`Button ${i} text: "${text}"`);

          if (text === 'Trust') {
            console.log('🔒 Found Trust button in iframe, clicking...');
            await trustButtons[i].click();
            return true;
          }
        } catch (error) {
          console.log(`Error checking button ${i}:`, error.message);
        }
      }

      const allButtons = await frame.$$('button');
      for (let i = 0; i < allButtons.length; i++) {
        try {
          const text = await allButtons[i].evaluate(el => el.textContent?.trim());
          console.log(`All buttons ${i}: "${text}"`);

          if (text === 'Trust') {
            console.log('🔒 Found Trust button in iframe, clicking...');
            await allButtons[i].click();
            return true;
          }
        } catch (error) {
          continue;
        }
      }
      console.log('❌ Trust button not found in iframe');
      return false;

    } catch (error) {
      console.log('❌ Error accessing iframe:', error.message);
      return false;
    }
  }

  async checkTermsCheckbox() {
    try {
      await this.page.waitForSelector('.agree-checkbox', { timeout: 5000 });
      const label = await this.page.$('label[for="tosAgree"]');
      if (label) {
        await label.click();
        console.log('✅ Clicked tosAgree label');

        // Verify it worked
        const isChecked = await this.page.$eval('#tosAgree', el => el.checked);
        if (isChecked) {
          console.log('✅ Checkbox is now checked via label click');
          return true;
        }
      }
      const success = await this.page.evaluate(() => {
        const checkbox = document.getElementById('tosAgree');
        const label = document.querySelector('label[for="tosAgree"]');
        if (checkbox && label) {
          label.click();
          return checkbox.checked;
        }
        return false;
      });

      if (success) {
        return true;
      }
      await this.page.evaluate(() => {
        const checkbox = document.getElementById('tosAgree');
        if (checkbox) {
          checkbox.checked = true;
          const event = new Event('change', { bubbles: true });
          checkbox.dispatchEvent(event);
          const clickEvent = new Event('click', { bubbles: true });
          checkbox.dispatchEvent(clickEvent);
        }
      });
      console.log('✅ Checkbox state forced with events');
      return true;

    } catch (error) {
      console.error('Error in checkTermsCheckbox:', error);
      return false;
    }
  }

  async acceptTermsOfService() {
    await this.wait(5000)
    await this.trustBtnClick()
    await this.wait(5000)
    try {
      await this.checkTermsCheckbox()
      const agreeButton = await this.page.$('button.tb-btn--primary:not(.tb-btn--disabled)');
      if (agreeButton) {
        const buttonText = await agreeButton.evaluate(el => el.textContent?.trim());
        if (buttonText === 'Agree') {
          await agreeButton.click();
          console.log('✅ Clicked Agree button');
          return true;
        }
      }
      const buttons = await this.page.$$('button');
      for (const button of buttons) {
        try {
          const buttonText = await button.evaluate(el => el.textContent?.trim());
          const isDisabled = await button.evaluate(el => el.disabled);

          if (buttonText === 'Agree' && !isDisabled) {
            await button.click();
            console.log('✅ Clicked Agree button (fallback)');
            return true;
          }
        } catch (err) {
          continue;
        }
      }
      console.log('❌ Could not find or click Agree button');
      return false;

    } catch (error) {
      console.log('❌ Error in acceptTermsOfService:', error.message);
      return false;
    }
  }

  async handleAutomatic2FA() {
    await this.wait(10000);
    const verificationCode = await getVerificationCode(this.accountInfo.smsCode)
    const needs2FA = await this.page.$$('input, input[type="tel"]');
    needs2FA[0].type(verificationCode);
    await this.wait(5000)
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
}

async function runFullyAutomatedTestFlight() {
  const automation = new FullyAutomatedTestFlight();
  await automation.launchBrowser();

  try {
    const promises = TESTFLIGHT_ACTIVATION_URLs.map(async (url, index) => {
      const page = await automation.browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      const tabAutomation = new FullyAutomatedTestFlight();
      tabAutomation.browser = automation.browser;
      tabAutomation.page = page;

      console.log(`🔄 Tab ${index + 1}: Processing URL: ${url}`);

      try {
        const result = await tabAutomation.runSingleActivation(url);
        console.log(`✅ Tab ${index + 1}: Completed URL: ${url}`, result);
        await page.close();

        return { tabIndex: index + 1, url, ...result };
      } catch (error) {
        console.error(`❌ Tab ${index + 1}: Failed URL: ${url}`, error.message);
        await page.close();
        return { tabIndex: index + 1, url, success: false, error: error.message };
      }
    });
    const results = await Promise.all(promises);
    return results;
  } finally {
    if (automation.browser) {
      await automation.browser.close();
    }
  }
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