const puppeteer = require('puppeteer');
const https = require('https');
const AppleIDList = require('../data/AppleID.json');
const { loadActivationLinks } = require('../utils/ActivateLinkLoader');

// const TESTFLIGHT_ACTIVATION_URLs = [
//   'https://appstoreconnect.apple.com/activation_ds?key=aae0cc3458af1de6032ff551a93743e4',
//   'https://appstoreconnect.apple.com/activation_ds?key=0289cb181765b45dfcd1dfd137555fb2',
//   'https://appstoreconnect.apple.com/activation_ds?key=2c91a43e15c632c1567f4425b770bc2b',
//   'https://appstoreconnect.apple.com/activation_ds?key=9eb7de57e497fd739bd23d22671fc1ad',
//   'https://appstoreconnect.apple.com/activation_ds?key=87ef8ddbf716a5069e9a2c5155c45899',
//   'https://appstoreconnect.apple.com/activation_ds?key=bb58e5c689b01dd43df680a659044cf3',
//   'https://appstoreconnect.apple.com/activation_ds?key=edb7f39ef0a36e6ae345282c103dc56f',
//   'https://appstoreconnect.apple.com/activation_ds?key=cb60a34ef023cce2c7360d458f7a7c21',
//   'https://appstoreconnect.apple.com/activation_ds?key=96a661a2a845b54bae2015e84deb4848',

// ];

function wait(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1));
}

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
  const response = await makeHttpRequest(`https://lixsms.com/message/?code=${smsCode}`);
  if (response.statusCode !== 200) return null;
  const jsonData = JSON.parse(response.body);
  if (jsonData.message && jsonData.message[0] && jsonData.message[0].body) {
    const body = jsonData.message[0].body;
    const match = body.match(/(\d{6})/);
    return match ? match[0] : null;
  }
  return null;
}

class FullyAutomatedTestFlight {
  constructor() {
    this.browser = null;
    this.page = null;
    this.accountInfo = null;
  }


  async runSingleActivation(activationUrl) {
    await this.navigateToActivation(activationUrl);
    await wait(5000)
    const verifyLink = await this.checkInvalidUrl()
    await wait(5000)
    if (verifyLink.isInvalid) {
      console.log('✅ Already acceptable invitation link');
      return
    }
    const isLoginSuccess = await this.performAutomaticLogin();
    if (isLoginSuccess) {
      const is2FA = await this.handleAutomatic2FA();
      if (is2FA) {
        await this.acceptTermsOfService();
        console.log('✅ Successful to confirm acceptable invitation link: ', this.accountInfo.email);
      }
    } else {
      console.log('⚠️ Please check this email cuz no preset on our local: ', this.getUsernameFromURL());
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

  async checkInvalidUrl() {
    await wait(3000);
    const invalidStates = await this.page.evaluate(() => {
      const bodyText = document.body.textContent.toLowerCase();

      if (bodyText.includes('invitation has expired') ||
        bodyText.includes('no longer valid') ||
        bodyText.includes('invitation isn\'t valid') ||
        bodyText.includes('can\'t link more providers')) {
        return { invalid: true };
      }

      return { invalid: false };
    });

    if (invalidStates.invalid) {
      console.log('❌ Invalid URL detected');
      return { isInvalid: true };
    }

    return { isInvalid: false };
  }

  async navigateToActivation(url) {
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
  }

  async waitForCompleteLoad() {
    await this.page.waitForFunction(() =>
      document.readyState === 'complete' &&
      document.querySelector('input, button') !== null
    );
    await wait(3000);
  }

  getUsernameFromURL() {
    const currentUrl = this.page.url();
    const urlObj = new URL(currentUrl);
    const username = urlObj.searchParams.get('username');
    return username
  }

  async performAutomaticLogin(account) {
    await wait(10000);
    const email = this.getUsernameFromURL()
    this.accountInfo = AppleIDList.find((x) => x.email == email)
    if (!this.accountInfo) {
      return false
    }
    const passwordFieldExists = await this.page.$$('input, input[type="password"]');
    if (passwordFieldExists) {
      await passwordFieldExists[0].type(this.accountInfo.password);
      await wait(2000);
      await this.submitLoginForm();
      return true
    }

    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
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
        await wait(2000);
        continue;
      }
      await wait(8000);
      return false;
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
    }
    await this.page.keyboard.press('Enter');
  }

  async trustBtnClick() {
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
      const text = await trustButtons[i].evaluate(el => el.textContent?.trim());
      console.log(`Button ${i} text: "${text}"`);

      if (text === 'Trust') {
        console.log('🔒 Found Trust button in iframe, clicking...');
        await trustButtons[i].click();
        return true;
      }
    }

    const allButtons = await frame.$$('button');
    for (let i = 0; i < allButtons.length; i++) {
      const text = await allButtons[i].evaluate(el => el.textContent?.trim());
      console.log(`All buttons ${i}: "${text}"`);

      if (text === 'Trust') {
        console.log('🔒 Found Trust button in iframe, clicking...');
        await allButtons[i].click();
        return true;
      }
    }

    console.log('❌ Trust button not found in iframe');
    return false;
  }

  async checkTermsCheckbox() {
    try {
      await wait(5000)
      await this.page.waitForSelector('.agree-checkbox', { timeout: 15000 });
      const label = await this.page.$('label[for="tosAgree"]');
      if (label) {
        await label.click();
        console.log('✅ Clicked tosAgree label');
        const isChecked = await this.page.$eval('#tosAgree', el => el.checked);
        if (isChecked) {
          console.log('✅ Checkbox is now checked via label click');
          return true;
        }
      }
      await wait(2000)
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
    } catch {
      console.log('✅ No agree Term privacy');
    }
    console.log('✅ Checkbox state forced with events');
    return true;
  }

  async acceptTermsOfService() {
    await wait(5000)
    await this.trustBtnClick()
    await wait(10000)
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
      const buttonText = await button.evaluate(el => el.textContent?.trim());
      const isDisabled = await button.evaluate(el => el.disabled);

      if (buttonText === 'Agree' && !isDisabled) {
        await button.click();
        console.log('✅ Clicked Agree button (fallback)');
        return true;
      }
    }
    console.log('❌ Could not find or click Agree button');
    return false;
  }

  async tapResetToPhoneNumber() {

    await this.page.waitForSelector('#aid-auth-widget-iFrame', { timeout: 15000 });
    const iframe = await this.page.$('#aid-auth-widget-iFrame');
    if (!iframe) return false;

    const frame = await iframe.contentFrame();
    if (!frame) return false;

    const buttons = await frame.$$('button, a');
    for (const button of buttons) {
      const text = await button.evaluate(el => el.textContent?.trim() || '');
      if (text.includes("Text code to")) {
        await button.click();
        return true;
      }
    }
    return false;
  }

  async tabRequestByPhoneNumber() {
    await wait(5000)
    await this.page.waitForSelector('#aid-auth-widget-iFrame', { timeout: 15000 });
    const iframe = await this.page.$('#aid-auth-widget-iFrame');
    if (!iframe) return false;
    const frame = await iframe.contentFrame();
    if (!frame) return false;
    const buttons = await frame.$$('button, a');
    for (const button of buttons) {
      const text = await button.evaluate(el => el.textContent?.trim() || '');
      if (text.includes('Can’t get to your')) {
        await button.click();
        await wait(10000)
        await this.tapResetToPhoneNumber()
        return true;
      }
    }
    return false;
  }

  async handleAutomatic2FA() {
    console.log("🔒 Two-Factor Authentication");
    await this.tabRequestByPhoneNumber()
    await wait(5000);
    let attempt = 0
    let verificationCode = null
    while (attempt < 3) {
      await wait(5000);
      verificationCode = await getVerificationCode(this.accountInfo.smsCode)
      if (verificationCode != "" && verificationCode != null) {
        attempt = 0
        console.log('✅ Get Otp Successful: ', verificationCode);
        break
      }
      attempt = attempt + 1
      console.log('❌ Attempt To Get OTP: ', attempt);
    }
    if (attempt == 3) {
      attempt = 0
      return false
    }
    const needs2FA = await this.page.$$('input, input[type="tel"]');
    await wait(2000)
    needs2FA[0].type(verificationCode);
    await wait(5000)
    return true
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
}

async function RunAcceptableInvitationLinkURL() {
  const automation = new FullyAutomatedTestFlight();
  await automation.launchBrowser();
  const promises = [];
  const links = loadActivationLinks('ActivationLinks.txt');
  for (let index = 0; index < links.length; index++) {
    const url = links[index];
    const delayedPromise = new Promise(async (resolve) => {
      const delayTime = index * 60000;
      if (delayTime > 0) {
        console.log(`⏳ Tab ${index + 1}: Waiting ${delayTime / 1000} seconds before opening...`);
        await new Promise(r => setTimeout(r, delayTime));
      }
      console.log(`🔄 Tab ${index + 1}: Opening now for URL: ${url}`);
      const page = await automation.browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; M1 Chip Mac OS X 11_15_7) AppleWebKit/937.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/937.36');
      const tabAutomation = new FullyAutomatedTestFlight();
      tabAutomation.browser = automation.browser;
      tabAutomation.page = page;
      const result = await tabAutomation.runSingleActivation(url);
      console.log(`✅ Tab ${index + 1}: Completed URL: ${url}`, result);
      resolve({ tabIndex: index + 1, url, ...result });
    });

    promises.push(delayedPromise);
  }
  console.log('🚀 Starting all delayed tab processes...');
  const results = await Promise.all(promises);
  console.log('🎉 All tabs completed:', results);
  return results;
}

module.exports = {
  RunAcceptableInvitationLinkURL,
  FullyAutomatedTestFlight,
  getVerificationCode
};

// RunAcceptableInvitationLinkURL()